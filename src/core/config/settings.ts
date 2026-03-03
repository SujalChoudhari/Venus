import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

export interface NoteDirectoryConfig {
  path: string;
  read: boolean;
  write: boolean;
}

export interface ShortcutConfig {
  modeCycle: string;
  commandNextView: string;
  commandPrevView: string;
  commandViewHotkeys: Record<string, string>;
}

export interface AppSettings {
  notes: {
    directories: NoteDirectoryConfig[];
  };
  ui: {
    startupView: "dashboard" | "notes" | "memory" | "tools" | "mcp" | "graph" | "config";
    hideSidebarInNotes: boolean;
    showSystemStatsPanel: boolean;
    showActivityPanel: boolean;
    showKnowledgeGraphPanel: boolean;
    showSplash: boolean;
  };
  shortcuts: ShortcutConfig;
}

const CONFIG_DIR = join(process.cwd(), "config");
const CONFIG_PATH = join(CONFIG_DIR, "venus.config.yaml");

const DEFAULT_SETTINGS: AppSettings = {
  notes: {
    directories: [{ path: "./notes", read: true, write: true }],
  },
  ui: {
    startupView: "dashboard",
    hideSidebarInNotes: true,
    showSystemStatsPanel: true,
    showActivityPanel: true,
    showKnowledgeGraphPanel: true,
    showSplash: true,
  },
  shortcuts: {
    modeCycle: "escape",
    commandNextView: "tab",
    commandPrevView: "shift+tab",
    commandViewHotkeys: {
      dashboard: "1",
      notes: "2",
      memory: "3",
      tools: "4",
      mcp: "5",
      graph: "6",
      config: "7",
    },
  },
};

let cachedSettings: AppSettings = DEFAULT_SETTINGS;

const toBool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

const normalizeSettings = (raw: unknown): AppSettings => {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const rawDirs = Array.isArray(src.notes?.directories) ? src.notes.directories : DEFAULT_SETTINGS.notes.directories;
  const directories: NoteDirectoryConfig[] = rawDirs
    .map((d: any) => ({
      path: typeof d?.path === "string" ? d.path : "",
      read: toBool(d?.read, true),
      write: toBool(d?.write, false),
    }))
    .filter((d: NoteDirectoryConfig) => d.path.trim().length > 0);

  const notes = {
    directories: directories.length > 0 ? directories : DEFAULT_SETTINGS.notes.directories,
  };

  const startupView = src.ui?.startupView;
  const allowedViews = new Set(["dashboard", "notes", "memory", "tools", "mcp", "graph", "config"]);
  const ui = {
    startupView: allowedViews.has(startupView) ? startupView : DEFAULT_SETTINGS.ui.startupView,
    hideSidebarInNotes: toBool(src.ui?.hideSidebarInNotes, DEFAULT_SETTINGS.ui.hideSidebarInNotes),
    showSystemStatsPanel: toBool(src.ui?.showSystemStatsPanel, DEFAULT_SETTINGS.ui.showSystemStatsPanel),
    showActivityPanel: toBool(src.ui?.showActivityPanel, DEFAULT_SETTINGS.ui.showActivityPanel),
    showKnowledgeGraphPanel: toBool(src.ui?.showKnowledgeGraphPanel, DEFAULT_SETTINGS.ui.showKnowledgeGraphPanel),
    showSplash: toBool(src.ui?.showSplash, DEFAULT_SETTINGS.ui.showSplash),
  } as AppSettings["ui"];

  const shortcutViews = src.shortcuts?.commandViewHotkeys && typeof src.shortcuts.commandViewHotkeys === "object"
    ? src.shortcuts.commandViewHotkeys
    : DEFAULT_SETTINGS.shortcuts.commandViewHotkeys;

  const commandViewHotkeys: Record<string, string> = {};
  for (const [view, fallback] of Object.entries(DEFAULT_SETTINGS.shortcuts.commandViewHotkeys)) {
    const val = shortcutViews?.[view];
    commandViewHotkeys[view] = typeof val === "string" && val.trim() ? val.trim() : fallback;
  }

  const shortcuts: ShortcutConfig = {
    modeCycle: typeof src.shortcuts?.modeCycle === "string" && src.shortcuts.modeCycle.trim()
      ? src.shortcuts.modeCycle.trim()
      : DEFAULT_SETTINGS.shortcuts.modeCycle,
    commandNextView: typeof src.shortcuts?.commandNextView === "string" && src.shortcuts.commandNextView.trim()
      ? src.shortcuts.commandNextView.trim()
      : DEFAULT_SETTINGS.shortcuts.commandNextView,
    commandPrevView: typeof src.shortcuts?.commandPrevView === "string" && src.shortcuts.commandPrevView.trim()
      ? src.shortcuts.commandPrevView.trim()
      : DEFAULT_SETTINGS.shortcuts.commandPrevView,
    commandViewHotkeys,
  };

  return { notes, ui, shortcuts };
};

export const getSettingsPath = (): string => CONFIG_PATH;

export const getSettings = (): AppSettings => cachedSettings;

export const loadSettings = async (): Promise<AppSettings> => {
  await mkdir(CONFIG_DIR, { recursive: true });
  try {
    const yamlText = await readFile(CONFIG_PATH, "utf8");
    try {
      const parsed = YAML.parse(yamlText);
      cachedSettings = normalizeSettings(parsed);
    } catch {
      cachedSettings = DEFAULT_SETTINGS;
    }
    return cachedSettings;
  } catch {
    const defaultYaml = YAML.stringify(DEFAULT_SETTINGS);
    await writeFile(CONFIG_PATH, defaultYaml, "utf8");
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
};
