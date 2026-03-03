#!/usr/bin/env bun
import "dotenv/config";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useInput, useStdout, useApp } from "ink";
import { ChatWindow, type Message } from "./components/ChatWindow";
import { InputBar } from "./components/InputBar";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ViewSwitcher } from "./components/ViewSwitcher";
import { KnowledgeGraphPanel } from "./components/KnowledgeGraphPanel";
import { GraphView } from "./components/GraphView";
import { ActivityPanel } from "./components/ActivityPanel";
import { SystemStatsPanel } from "./components/SystemStatsPanel";
import { MemoryBrowser } from "./components/MemoryBrowser";
import { ToolLog, type ToolLogEntry } from "./components/ToolLog";
import { McpManagerView } from "./components/McpManagerView";
import { NotepadView } from "./components/NotepadView";
import { ConfigPanel } from "./components/ConfigPanel";
import { SplashScreen } from "./components/SplashScreen";
import { notepadService } from "./core/notes/service";
import { AppSettings, getSettings, getSettingsPath, loadSettings } from "./core/config/settings";

import {
  initializeDatabase,
  closeDatabase,
  storeMemory,
  queryMemoryByTopic,
  getDatabase,
  getChatSessions,
  getChatMessages,
  createChatSession,
  deleteChatSession,
  type ChatSession,
  type ChatMessage,
} from "./core/memory";
import { initializeAi, runAgentLoop, type GeminiMessage } from "./core/chat/service";

import { Theme } from "./core/theme";

export type ViewId = "dashboard" | "memory" | "tools" | "mcp" | "graph" | "notes" | "config";
export type AppMode = "CHAT" | "COMMAND" | "INSERT";

type CountRow = { count: number };
type MemoryBrowserRow = {
  id: string;
  topic: string;
  content: string;
  embedding_model: string | null;
  has_embedding: number;
};
const WELCOME_MESSAGE = "NEW SESSION\nYou're back in context. What should we focus on?";
const DEFAULT_MODEL = "gemma-3-27b-it";
const randomId = () => Math.random().toString(36).slice(2);
const VIEW_ORDER: ViewId[] = ["dashboard", "notes", "memory", "tools", "mcp", "graph", "config"];
const toUiMessage = (m: ChatMessage): Message => ({
  id: m.id,
  role: m.role,
  content: m.content,
  timestamp: new Date(m.timestamp),
  type: m.type,
});

const App: React.FC = () => {
  const { stdout } = useStdout();
  const { exit } = useApp();
  const termWidth = stdout?.columns ?? 120;
  const termHeight = stdout?.rows ?? 40;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: WELCOME_MESSAGE,
      timestamp: new Date(),
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Loading...");
  const [mcpStatus, setMcpStatus] = useState("ready");
  const [history, setHistory] = useState<string[]>([]);
  const conversationHistory = useRef<GeminiMessage[]>([]);
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [toolActivities, setToolActivities] = useState<ToolLogEntry[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [showSplash, setShowSplash] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [appMode, setAppMode] = useState<AppMode>("CHAT");
  const sessionStartedAt = useRef(new Date());


  // *** USE A REF for session ID so it's always fresh in callbacks ***
  const sessionIdRef = useRef<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const matchesShortcut = (input: string, key: any, shortcut: string): boolean => {
    const normalized = shortcut.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === "escape") return !!key.escape;
    if (normalized === "tab") return !!key.tab && !key.shift;
    if (normalized === "shift+tab") return !!key.tab && !!key.shift;
    if (normalized === "ctrl+c") return !!key.ctrl && input === "c";
    if (normalized.startsWith("ctrl+")) return !!key.ctrl && input === normalized.slice(5);
    if (normalized.startsWith("alt+")) return !!key.meta && input === normalized.slice(4);
    return input === normalized;
  };

  // Modal Switching Logic (Vim-style 3-mode)
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (appMode !== "INSERT" && activeView !== "notes") {
        exit();
        process.exit(0);
      }
      return;
    }

    if (matchesShortcut(input, key, settings.shortcuts.modeCycle)) {
      setAppMode(prev => {
        if (prev === "CHAT") return "COMMAND";
        if (prev === "COMMAND") {
          setActiveView("notes");
          return "INSERT";
        }
        setActiveView("dashboard");
        return "CHAT";
      });
      return;
    }

    if (appMode === "COMMAND") {
      for (const view of VIEW_ORDER) {
        const hotkey = settings.shortcuts.commandViewHotkeys[view];
        if (hotkey && matchesShortcut(input, key, hotkey)) {
          setActiveView(view);
          return;
        }
      }

      if (matchesShortcut(input, key, settings.shortcuts.commandNextView)) {
        const currentIdx = VIEW_ORDER.indexOf(activeView);
        setActiveView(VIEW_ORDER[(currentIdx + 1) % VIEW_ORDER.length]);
        return;
      }
      if (matchesShortcut(input, key, settings.shortcuts.commandPrevView)) {
        const currentIdx = VIEW_ORDER.indexOf(activeView);
        setActiveView(VIEW_ORDER[(currentIdx - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]);
        return;
      }
    }
  });

  const getLongTermMemoryCount = useCallback((): number => {
    const db = getDatabase();
    const row = db.query("SELECT COUNT(*) as count FROM long_term_memory").get() as CountRow | null;
    return row?.count ?? 0;
  }, []);

  const loadSessionData = useCallback((sessionId: string) => {
    const historicalMessages = getChatMessages(sessionId);

    const uiMessages = historicalMessages.map(toUiMessage);

    if (uiMessages.length === 0) {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: WELCOME_MESSAGE,
        timestamp: new Date()
      }]);
      conversationHistory.current = [];
    } else {
      setMessages(uiMessages);
      const geminiHistory: GeminiMessage[] = [];
      for (const m of historicalMessages) {
        if (m.type === 'text') {
          // Map DB roles to valid Gemma roles
          const role: GeminiMessage["role"] = m.role === 'model' ? 'model' : 'user';
          geminiHistory.push({ role, parts: [{ text: m.content }] });
        } else if (m.type === 'tool_call') {
          // Tool calls come from the model
          geminiHistory.push({ role: 'model', parts: [{ text: `<tool_call>\n${m.content}\n</tool_call>` }] });
        } else if (m.type === 'tool_result') {
          // Tool results are fed back as user context
          geminiHistory.push({ role: 'user', parts: [{ text: `<tool_result>\n${m.content}\n</tool_result>` }] });
        }
      }
      conversationHistory.current = geminiHistory;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const loaded = await loadSettings();
      setSettings(loaded);
      setActiveView(loaded.ui.startupView);
      setShowSplash(loaded.ui.showSplash);
      notepadService.configureDirectories(loaded.notes.directories);

      await initializeDatabase();
      await notepadService.init(); // Ensure notepad files are checked and loaded

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        initializeAi(apiKey);
      } else {
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "⚠️ GEMINI_API_KEY not found in .env",
          timestamp: new Date()
        }]);
      }

      setMemoryCount(getLongTermMemoryCount());

      const existingSessions = getChatSessions();
      setSessions(existingSessions);

      if (existingSessions.length > 0) {
        const lastSession = existingSessions[0];
        setCurrentSessionId(lastSession.id);
        sessionIdRef.current = lastSession.id; // Set ref immediately
        loadSessionData(lastSession.id);
      } else {
        const newSession = createChatSession("New Conversation", DEFAULT_MODEL);
        setCurrentSessionId(newSession.id);
        sessionIdRef.current = newSession.id; // Set ref immediately
        setSessions([newSession]);
      }

    };
    init();

    return () => { closeDatabase(); };
  }, [getLongTermMemoryCount, loadSessionData]);


  const handleSubmit = useCallback(async (input: string) => {
    if (!input.trim() || isLoading) return;

    setHistory(prev => [...prev, input]);

    if (input.startsWith("/")) {
      const parts = input.slice(1).split(" ");
      const cmd = parts[0];
      const args = parts.slice(1);

      switch (cmd) {
        case "new": {
          const title = args.join(" ") || "New Session";
          const session = createChatSession(title, DEFAULT_MODEL);
          setCurrentSessionId(session.id);
          sessionIdRef.current = session.id;
          setSessions(getChatSessions());
          setMessages([{
            id: "welcome", role: "assistant",
            content: `NEW SESSION: ${title}\nYou're all set. What should we work on?`,
            timestamp: new Date()
          }]);
          conversationHistory.current = [];
          return;
        }
        case "sessions": {
          const list = getChatSessions();
          const text = list.map(s => `[${s.id.slice(0, 8)}] ${s.title} (${new Date(s.updated_at).toLocaleString()})`).join("\n");
          setMessages(prev => [...prev, {
            id: randomId(),
            role: "assistant",
            content: `Saved Sessions:\n${text || "No sessions found."}`,
            timestamp: new Date()
          }]);
          return;
        }
        case "load": {
          const id = args[0];
          if (!id) return;
          const fullId = getChatSessions().find(s => s.id.startsWith(id))?.id;
          if (fullId) {
            setCurrentSessionId(fullId);
            sessionIdRef.current = fullId;
            loadSessionData(fullId);
          }
          return;
        }
        case "delete": {
          const id = args[0];
          if (!id) return;
          const fullId = getChatSessions().find(s => s.id.startsWith(id))?.id;
          if (fullId) {
            deleteChatSession(fullId);
            setSessions(getChatSessions());
            if (sessionIdRef.current === fullId) {
              const remaining = getChatSessions();
              if (remaining.length > 0) {
                setCurrentSessionId(remaining[0].id);
                sessionIdRef.current = remaining[0].id;
                loadSessionData(remaining[0].id);
              } else {
                const session = createChatSession("New Session", DEFAULT_MODEL);
                setCurrentSessionId(session.id);
                sessionIdRef.current = session.id;
                setMessages([]);
              }
            }
          }
          return;
        }
        case "memorize": {
          const text = args.join(" ");
          if (!text) return;
          await storeMemory("general", text);
          setMemoryCount(getLongTermMemoryCount());
          setMessages(prev => [...prev, { id: randomId(), role: "assistant", content: "✅ Memory stored.", timestamp: new Date() }]);
          return;
        }
        case "recall": {
          const topic = args.join(" ");
          if (!topic) return;
          const recalled = queryMemoryByTopic(topic);
          const content = recalled.length > 0 ? recalled.map(m => `- ${m.content}`).join("\n") : "No memories found.";
          setMessages(prev => [...prev, { id: randomId(), role: "assistant", content: `Recalled:\n${content}`, timestamp: new Date() }]);
          return;
        }
        case "dash":
        case "chat": setActiveView("dashboard"); return;
        case "mem": setActiveView("memory"); return;
        case "toollog": setActiveView("tools"); return;
        case "notes": setActiveView("notes"); return;
        case "mcp": setActiveView("mcp"); return;
        case "graph": setActiveView("graph"); return;
        case "config":
        case "settings": setActiveView("config"); return;
        case "reloadcfg": {
          const loaded = await loadSettings();
          setSettings(loaded);
          notepadService.configureDirectories(loaded.notes.directories);
          await notepadService.init();
          setMessages(prev => [...prev, {
            id: randomId(),
            role: "assistant",
            content: `✅ Config reloaded from ${getSettingsPath()}`,
            timestamp: new Date()
          }]);
          return;
        }

        case "help":
          setMessages(prev => [...prev, {
            id: randomId(), role: "assistant",
            content: `Commands:\n/new /sessions /load /delete /memorize /recall /dash /chat /mem /notes /toollog /mcp /graph /config /reloadcfg`,
            timestamp: new Date()
          }]);
          return;
        default: return;
      }
    }

    // Normal chat message
    const userMsg: Message = {
      id: randomId(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setLoadingLabel("Thinking...");

    try {
      const buildModelInputWithNotes = async (rawInput: string): Promise<string> => {
        const mentionMatches = [...rawInput.matchAll(/(?:^|\s)@([a-zA-Z0-9._-]+)/g)];
        if (mentionMatches.length === 0) return rawInput;

        const files = await notepadService.listFiles();
        const fileByAlias = new Map<string, string>();
        for (const f of files) {
          const lower = f.toLowerCase();
          fileByAlias.set(lower, f);
          fileByAlias.set(f.replace(/\.(txt|md)$/i, "").toLowerCase(), f);
        }

        const orderedAliases: string[] = [];
        const seen = new Set<string>();
        for (const match of mentionMatches) {
          const alias = (match[1] || "").toLowerCase();
          if (alias && !seen.has(alias)) {
            seen.add(alias);
            orderedAliases.push(alias);
          }
        }

        const blocks: string[] = [];
        for (const alias of orderedAliases) {
          const filename = fileByAlias.get(alias) || fileByAlias.get(`${alias}.txt`) || fileByAlias.get(`${alias}.md`);
          if (!filename) continue;
          const content = await notepadService.readFileContent(filename);
          if (content === null) continue;
          blocks.push(`[${filename}]\n${content || "(empty file)"}`);
        }

        if (blocks.length === 0) return rawInput;
        return `${rawInput}\n\nReferenced notes context:\n${blocks.join("\n\n")}`;
      };

      const modelInput = await buildModelInputWithNotes(input);
      // *** Use ref to always get the CURRENT session ID ***
      const sid = sessionIdRef.current || undefined;
      const generator = runAgentLoop(modelInput, conversationHistory.current, sid);

      for await (const chunk of generator) {
        if (chunk.type === "text") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && last.type !== "tool_call" && last.type !== "tool_result") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + chunk.text },
              ];
            }
            return [
              ...prev,
              { id: randomId(), role: "assistant", content: chunk.text, timestamp: new Date() },
            ];
          });
        } else if (chunk.type === "tool_call") {
          const activity: ToolLogEntry = {
            id: `tool-${Date.now()}`,
            name: chunk.name,
            args: chunk.args,
            timestamp: new Date(),
            status: "running"
          };
          setToolActivities(prev => [...prev, activity]);
          setMessages((prev) => [
            ...prev,
            { id: randomId(), role: "assistant", type: "tool_call", content: `Calling ${chunk.name}...`, timestamp: new Date() },
          ]);
          setLoadingLabel(`Calling ${chunk.name}...`);
        } else if (chunk.type === "tool_result") {
          setToolActivities(prev => prev.map(a =>
            a.name === chunk.name ? { ...a, status: chunk.isError ? "error" : "done", output: chunk.output } : a
          ));
          setMessages((prev) => [
            ...prev,
            { id: randomId(), role: "assistant", type: "tool_result", content: chunk.output, timestamp: new Date() },
          ]);
        } else if (chunk.type === "waiting") {
          setLoadingLabel(`Rate limit reached. Retrying in ${chunk.seconds}s...`);
          setMessages((prev) => [
            ...prev,
            { id: randomId(), role: "assistant", type: "system", content: `⏳ Rate limit reached. Retrying in ${chunk.seconds} seconds...`, timestamp: new Date() },
          ]);
        } else if (chunk.type === "error") {
          setMessages((prev) => [
            ...prev,
            { id: randomId(), role: "assistant", type: "system", content: `❌ Error: ${chunk.message}`, timestamp: new Date() },
          ]);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { id: randomId(), role: "assistant", content: `❌ ${message}`, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
      setLoadingLabel("Loading...");
      setSessions(getChatSessions());
      // Refresh memory count
      try {
        setMemoryCount(getLongTermMemoryCount());
      } catch { }
    }
  }, [getLongTermMemoryCount, isLoading, loadSessionData]);

  const getMemoriesForBrowser = () => {
    try {
      const db = getDatabase();
      return db.query("SELECT id, topic, content, embedding_model, embedding IS NOT NULL as has_embedding FROM long_term_memory ORDER BY updated_at DESC").all() as MemoryBrowserRow[];
    } catch {
      return [];
    }
  };

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} memoryCount={memoryCount} toolCount={8} />;
  }

  const sidebarWidth = Math.max(20, Math.min(45, Math.floor(termWidth * 0.30)));

  // Determine height budget for chat window
  // termHeight - TopBar(2) - Footer(5ish) - Border(2)
  const mainHeight = Math.max(10, termHeight - 7);

  // Determine what goes in the center panel
  const renderCenterPanel = () => {
    switch (activeView) {
      case "memory": return <MemoryBrowser memories={getMemoriesForBrowser()} />;
      case "tools": return <ToolLog entries={toolActivities} />;
      case "notes": return <NotepadView mode={appMode} />;
      case "mcp": return <McpManagerView />;
      case "graph": return <GraphView appMode={appMode} />;
      case "config": return <ConfigPanel mode={appMode} configPath={getSettingsPath()} />;

      case "dashboard":
      default:
        return (
          <Box flexDirection="column" height={mainHeight}>
            <Box flexDirection="row" alignItems="center" flexShrink={0}>
              <Text color={Theme.colors.secondary}>┌─ </Text>
              <Text color={Theme.colors.primary} bold>CHAT</Text>
              <Text color={Theme.colors.secondary}> </Text>
              <Box flexGrow={1} height={0} borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={Theme.colors.secondary} />
              <Text color={Theme.colors.secondary}>┐</Text>
            </Box>
            <Box borderStyle="single" borderTop={false} borderColor={Theme.colors.secondary} flexGrow={1} overflow="hidden">
              <ChatWindow messages={messages} isStreaming={isLoading} />
            </Box>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} overflow="hidden">
      {/* Top bar - always visible */}
      <Box flexShrink={0}>
        <ViewSwitcher
          activeView={activeView}
          memoryCount={memoryCount}
          toolCount={8}
          status={mcpStatus}
          viewHotkeys={settings.shortcuts.commandViewHotkeys}
        />
      </Box>

      {/* Main area: center + sidebar — Sidebar hides in notes/insert mode for focus */}
      <Box flexDirection="row" flexGrow={1} flexBasis={0} overflow="hidden" height={(activeView === "notes" || appMode === "INSERT") ? termHeight - 8 : mainHeight}>
        {/* Center panel */}
        <Box flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden" >
          {renderCenterPanel()}
        </Box>

        {/* Sidebar — configurable visibility */}
        {(!settings.ui.hideSidebarInNotes || (activeView !== "notes" && appMode !== "INSERT")) && (
          <Box flexDirection="column" width={sidebarWidth} flexShrink={0} height={mainHeight}>
            {settings.ui.showKnowledgeGraphPanel && <KnowledgeGraphPanel panelWidth={sidebarWidth} />}
            {settings.ui.showActivityPanel && <ActivityPanel activities={toolActivities} />}
            {settings.ui.showSystemStatsPanel && <SystemStatsPanel panelWidth={sidebarWidth} />}
          </Box>
        )}
      </Box>

      {/* Input bar - Hidden or shrunken in notes view? 
          User said: "when in notes view the chat should disappear." 
          The input bar is part of the "system" so I'll keep it but maybe minimize its impact.
      */}
      <Box flexDirection="column" flexShrink={0} marginTop={0}>
        {isLoading && <Box paddingX={2}><LoadingSpinner label={loadingLabel} /></Box>}
        <InputBar
          onSubmit={handleSubmit}
          history={history}
          isLoading={isLoading}
          mode={appMode}
        />
        <Box justifyContent="space-between" paddingX={2} marginBottom={0}>
          <Text color={Theme.colors.text.muted} dimColor>
            {appMode === "CHAT"
              ? `${settings.shortcuts.modeCycle}: command mode  •  `
              : appMode === "COMMAND"
                ? `${settings.shortcuts.modeCycle}: insert mode  •  `
                : `${settings.shortcuts.modeCycle}: chat mode  •  `}
            {`views: ${Object.keys(settings.shortcuts.commandViewHotkeys).length} hotkeys  •  ${settings.shortcuts.commandNextView}: next view  •  ↑↓ history`}
          </Text>
          <Text color={Theme.colors.text.muted} dimColor>
            Session started {sessionStartedAt.current.toLocaleString()}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

render(<App />, { exitOnCtrlC: false });
