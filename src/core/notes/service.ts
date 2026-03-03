import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import clipboardy from "clipboardy";

export interface NoteState {
    filename: string;
    content: string;
    isDirty: boolean;
}

class NotepadService {
    private state: NoteState = {
        filename: "scratchpad.txt",
        content: "Welcome to Venus Notepad!\n\nThis is your private space for thoughts.\n- Type anywhere\n- Ctrl+S to save\n- Shift+Up/Down to scroll\n",
        isDirty: false,
    };

    private notesDir = process.env.NOTES_DIR || join(process.cwd(), "notes");

    // History and Clipboard
    private undoStack: string[] = [];
    private redoStack: string[] = [];
    private internalClipboard: string = "";
    private readonly allowedExts = [".txt", ".md"];

    async init() {
        try {
            await mkdir(this.notesDir, { recursive: true });
        } catch (e) { }

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
        if (this.state.content !== content) {
            if (!skipHistory) {
                this.pushHistory(this.state.content);
            }
            this.state.content = content;
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
        const fullPath = join(this.notesDir, this.state.filename);
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
        const existing = new Set(await this.listFiles());
        const desired = this.normalizeFilename(preferredName || "untitled.txt");
        if (!existing.has(desired)) {
            await writeFile(join(this.notesDir, desired), "", "utf8");
            return desired;
        }

        const dotIdx = desired.lastIndexOf(".");
        const base = dotIdx > -1 ? desired.slice(0, dotIdx) : desired;
        const ext = dotIdx > -1 ? desired.slice(dotIdx) : ".txt";
        let i = 1;
        while (i < 10000) {
            const candidate = `${base}-${i}${ext}`;
            if (!existing.has(candidate)) {
                await writeFile(join(this.notesDir, candidate), "", "utf8");
                return candidate;
            }
            i += 1;
        }
        throw new Error("Unable to create unique note filename");
    }

    async readFileContent(filename: string): Promise<string | null> {
        const safeName = this.normalizeFilename(filename);
        if (!this.allowedExts.some((ext) => safeName.toLowerCase().endsWith(ext))) return null;
        const fullPath = join(this.notesDir, safeName);
        try {
            return await readFile(fullPath, "utf8");
        } catch {
            return null;
        }
    }

    async load(filename: string) {
        const safeName = this.normalizeFilename(filename);
        const fullPath = join(this.notesDir, safeName);
        this.undoStack = [];
        this.redoStack = [];
        try {
            const content = await readFile(fullPath, "utf8");
            this.state = { filename: safeName, content, isDirty: false };
        } catch (e) {
            this.state = { filename: safeName, content: "", isDirty: false };
        }
    }

    async listFiles(): Promise<string[]> {
        try {
            const files = await readdir(this.notesDir);
            return files
                .filter((f) => this.allowedExts.some((ext) => f.toLowerCase().endsWith(ext)))
                .sort((a, b) => a.localeCompare(b));
        } catch (e) {
            return [];
        }
    }

    async deleteFile(filename: string) {
        try {
            const safeName = this.normalizeFilename(filename);
            const fullPath = join(this.notesDir, safeName);
            await unlink(fullPath);
        } catch (e) {
            // Ignore if file doesn't exist
        }
    }
}

export const notepadService = new NotepadService();
