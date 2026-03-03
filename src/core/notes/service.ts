import { access, readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import clipboardy from "clipboardy";
import { NoteDirectoryConfig } from "../config/settings";

export interface NoteState {
    filename: string;
    content: string;
    isDirty: boolean;
}

class NotepadService {
    private normalizeLineEndings(text: string): string {
        return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    private state: NoteState = {
        filename: "scratchpad.txt",
        content: "Welcome to Venus Notepad!\n\nThis is your private space for thoughts.\n- Type anywhere\n- Ctrl+S to save\n- Shift+Up/Down to scroll\n",
        isDirty: false,
    };

    private noteDirectories: NoteDirectoryConfig[] = [
        {
            path: process.env.NOTES_DIR || join(process.cwd(), "notes"),
            read: true,
            write: true,
        }
    ];

    // History and Clipboard
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    private internalClipboard: string = "";
    private readonly allowedExts = [".txt", ".md"];

    configureDirectories(directories: NoteDirectoryConfig[]) {
        const cleaned = directories
            .map((d) => ({ path: d.path, read: !!d.read, write: !!d.write }))
            .filter((d) => d.path && (d.read || d.write));
        if (cleaned.length > 0) {
            this.noteDirectories = cleaned;
        }
    }

    getDirectories(): NoteDirectoryConfig[] {
        return [...this.noteDirectories];
    }

    async init() {
        const writableDirs = this.noteDirectories.filter((d) => d.write);
        for (const d of writableDirs) {
            try {
                await mkdir(d.path, { recursive: true });
            } catch { }
        }

        try {
            const files = await this.listFiles();
            if (files.includes("scratchpad.txt")) {
                await this.load("scratchpad.txt");
            } else {
                // First Run: Save the default welcome message to disk
                await this.save();
            }
        } catch (e) { }
    }

    getState(): NoteState {
        return this.state;
    }

    updateContent(content: string, skipHistory: boolean = false) {
        const normalized = this.normalizeLineEndings(content);
        if (this.state.content !== normalized) {
            if (!skipHistory) {
                this.pushHistory(this.state.content);
            }
            this.state.content = normalized;
            this.state.isDirty = true;
        }
    }

    // --- History Management ---
    pushHistory(content: string) {
        this.undoStack.push(content);
        if (this.undoStack.length > 100) this.undoStack.shift(); // Max 100 undo steps
        this.redoStack = []; // Clear redo stack on new change
    }

    undo(): boolean {
        if (this.undoStack.length === 0) return false;
        const prevContent = this.undoStack.pop()!;
        this.redoStack.push(this.state.content);
        this.updateContent(prevContent, true);
        return true;
    }

    redo(): boolean {
        if (this.redoStack.length === 0) return false;
        const nextContent = this.redoStack.pop()!;
        this.undoStack.push(this.state.content);
        this.updateContent(nextContent, true);
        return true;
    }

    // --- Clipboard Management ---
    async copyToClipboard(text: string) {
        this.internalClipboard = text;
        try {
            await clipboardy.write(text);
        } catch (e) {
            // Fallback to internal if system clipboard fails
        }
    }

    async readFromClipboard(): Promise<string> {
        try {
            return await clipboardy.read();
        } catch (e) {
            return this.internalClipboard;
        }
    }

    // --- File Management ---
    async save() {
        if (!this.state.isDirty) return;
        const fullPath = await this.resolveWritablePath(this.state.filename);
        if (!fullPath) throw new Error("No writable notes directory configured for this file");
        await writeFile(fullPath, this.state.content, "utf8");
        this.state.isDirty = false;
    }

    normalizeFilename(name: string): string {
        const trimmed = name.trim().replace(/[\\/:*?"<>|]/g, "-");
        if (!trimmed) return "untitled.txt";
        if (this.allowedExts.some((ext) => trimmed.toLowerCase().endsWith(ext))) {
            return trimmed;
        }
        return `${trimmed}.txt`;
    }

    async createNote(preferredName?: string): Promise<string> {
        const targetDir = this.noteDirectories.find((d) => d.write);
        if (!targetDir) throw new Error("No writable notes directory configured");
        const existing = new Set(await this.listFiles());
        const desired = this.normalizeFilename(preferredName || "untitled.txt");
        if (!existing.has(desired)) {
            await mkdir(targetDir.path, { recursive: true });
            await writeFile(join(targetDir.path, desired), "", "utf8");
            return desired;
        }

        const dotIdx = desired.lastIndexOf(".");
        const base = dotIdx > -1 ? desired.slice(0, dotIdx) : desired;
        const ext = dotIdx > -1 ? desired.slice(dotIdx) : ".txt";
        let i = 1;
        while (i < 10000) {
            const candidate = `${base}-${i}${ext}`;
            if (!existing.has(candidate)) {
                await writeFile(join(targetDir.path, candidate), "", "utf8");
                return candidate;
            }
            i += 1;
        }
        throw new Error("Unable to create unique note filename");
    }

    async readFileContent(filename: string): Promise<string | null> {
        const safeName = this.normalizeFilename(filename);
        if (!this.allowedExts.some((ext) => safeName.toLowerCase().endsWith(ext))) return null;
        const fullPath = await this.resolveReadablePath(safeName);
        if (!fullPath) return null;
        try {
            const text = await readFile(fullPath, "utf8");
            return this.normalizeLineEndings(text);
        } catch {
            return null;
        }
    }

    async load(filename: string) {
        const safeName = this.normalizeFilename(filename);
        const fullPath = await this.resolveReadablePath(safeName);
        this.undoStack = [];
        this.redoStack = [];
        try {
            if (!fullPath) throw new Error("missing");
            const content = this.normalizeLineEndings(await readFile(fullPath, "utf8"));
            this.state = { filename: safeName, content, isDirty: false };
        } catch (e) {
            this.state = { filename: safeName, content: "", isDirty: false };
        }
    }

    async listFiles(): Promise<string[]> {
        const allFiles = new Set<string>();
        try {
            for (const dir of this.noteDirectories.filter((d) => d.read)) {
                try {
                    const files = await readdir(dir.path);
                    files
                        .filter((f) => this.allowedExts.some((ext) => f.toLowerCase().endsWith(ext)))
                        .forEach((f) => allFiles.add(f));
                } catch { }
            }
        } catch {
            // no-op
        }
        return [...allFiles].sort((a, b) => a.localeCompare(b));
    }

    async deleteFile(filename: string) {
        try {
            const safeName = this.normalizeFilename(filename);
            const fullPath = await this.resolveWritablePath(safeName);
            if (!fullPath) return;
            await unlink(fullPath);
        } catch (e) {
            // Ignore if file doesn't exist
        }
    }

    private async resolveReadablePath(filename: string): Promise<string | null> {
        const readable = this.noteDirectories.filter((d) => d.read);
        for (const dir of readable) {
            const fullPath = join(dir.path, filename);
            try {
                await access(fullPath, constants.R_OK);
                return fullPath;
            } catch { }
        }
        return null;
    }

    private async resolveWritablePath(filename: string): Promise<string | null> {
        const existingReadable = await this.resolveReadablePath(filename);
        if (existingReadable) {
            const existingResolved = resolve(existingReadable).toLowerCase();
            for (const dir of this.noteDirectories.filter((d) => d.write)) {
                const dirResolved = resolve(dir.path).toLowerCase();
                if (existingResolved.startsWith(dirResolved)) return existingReadable;
            }
        }
        const firstWritable = this.noteDirectories.find((d) => d.write);
        if (!firstWritable) return null;
        await mkdir(firstWritable.path, { recursive: true });
        return join(firstWritable.path, filename);
    }
}

export const notepadService = new NotepadService();
