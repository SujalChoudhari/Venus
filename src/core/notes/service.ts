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

    async load(filename: string) {
        const fullPath = join(this.notesDir, filename);
        this.undoStack = [];
        this.redoStack = [];
        try {
            const content = await readFile(fullPath, "utf8");
            this.state = { filename, content, isDirty: false };
        } catch (e) {
            this.state = { filename, content: "", isDirty: false };
        }
    }

    async listFiles(): Promise<string[]> {
        try {
            const files = await readdir(this.notesDir);
            return files.filter(f => f.endsWith('.txt') || f.endsWith('.md'));
        } catch (e) {
            return [];
        }
    }

    async deleteFile(filename: string) {
        try {
            const fullPath = join(this.notesDir, filename);
            await unlink(fullPath);
        } catch (e) {
            // Ignore if file doesn't exist
        }
    }
}

export const notepadService = new NotepadService();
