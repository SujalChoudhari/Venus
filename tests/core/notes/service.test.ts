import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const clipboardWriteMock = mock(async (_text: string) => {});
const clipboardReadMock = mock(async () => "system-clip");

mock.module("clipboardy", () => ({
  default: {
    write: clipboardWriteMock,
    read: clipboardReadMock,
  },
}));

const fixedNotesDir = await mkdtemp(join(tmpdir(), "venus-notes-fixed-"));
process.env.NOTES_DIR = fixedNotesDir;
const { notepadService } = await import("../../../src/core/notes/service");

describe("notepad service", () => {
  beforeEach(async () => {
    await rm(fixedNotesDir, { recursive: true, force: true });
    await mkdir(fixedNotesDir, { recursive: true });
    clipboardWriteMock.mockClear();
    clipboardReadMock.mockClear();
    await notepadService.load("scratchpad.txt");
  });

  afterEach(async () => {
    await rm(fixedNotesDir, { recursive: true, force: true });
  });

  it("initializes and loads existing notes", async () => {
    await notepadService.init();
    expect(Array.isArray(await notepadService.listFiles())).toBe(true);

    await writeFile(join(fixedNotesDir, "scratchpad.txt"), "preexisting", "utf8");
    await notepadService.init();
    expect(notepadService.getState().content).toBe("preexisting");
  });

  it("supports update, undo and redo", () => {
    const initial = notepadService.getState().content;
    notepadService.updateContent("v1");
    notepadService.updateContent("v2");
    expect(notepadService.undo()).toBe(true);
    expect(notepadService.getState().content).toBe("v1");
    expect(notepadService.undo()).toBe(true);
    expect(notepadService.getState().content).toBe(initial);
    expect(notepadService.undo()).toBe(false);

    expect(notepadService.redo()).toBe(true);
    expect(notepadService.redo()).toBe(true);
    expect(notepadService.redo()).toBe(false);
  });

  it("caps undo stack at 100 entries", () => {
    for (let i = 0; i < 105; i++) notepadService.pushHistory(`h-${i}`);
    for (let i = 0; i < 100; i++) expect(notepadService.undo()).toBe(true);
    expect(notepadService.undo()).toBe(false);
  });

  it("uses clipboard with fallback behavior", async () => {
    await notepadService.copyToClipboard("internal");
    expect(clipboardWriteMock).toHaveBeenCalledWith("internal");
    expect(await notepadService.readFromClipboard()).toBe("system-clip");

    clipboardReadMock.mockRejectedValueOnce(new Error("no clipboard"));
    expect(await notepadService.readFromClipboard()).toBe("internal");

    clipboardWriteMock.mockRejectedValueOnce(new Error("write fail"));
    await notepadService.copyToClipboard("internal2");
    clipboardReadMock.mockRejectedValueOnce(new Error("still no clipboard"));
    expect(await notepadService.readFromClipboard()).toBe("internal2");
  });

  it("saves, loads, lists and deletes files", async () => {
    notepadService.updateContent("saved content");
    await notepadService.save();
    expect(notepadService.getState().isDirty).toBe(false);
    await notepadService.save();

    await notepadService.load("scratchpad.txt");
    expect(notepadService.getState().content).toContain("saved content");

    await writeFile(join(fixedNotesDir, "a.md"), "# note", "utf8");
    await writeFile(join(fixedNotesDir, "b.txt"), "text", "utf8");
    await writeFile(join(fixedNotesDir, "c.json"), "{}", "utf8");
    const files = await notepadService.listFiles();
    expect(files.includes("a.md")).toBe(true);
    expect(files.includes("b.txt")).toBe(true);
    expect(files.includes("c.json")).toBe(false);

    await notepadService.deleteFile("a.md");
    expect((await notepadService.listFiles()).includes("a.md")).toBe(false);

    await notepadService.deleteFile("missing.md");
    await notepadService.load("missing.txt");
    expect(notepadService.getState().content).toBe("");
  });

  it("creates unique notes and reads file content without mutating state", async () => {
    const created = await notepadService.createNote("scratchpad");
    expect(created).toBe("scratchpad.txt");
    expect((await notepadService.listFiles()).includes("scratchpad.txt")).toBe(true);

    const second = await notepadService.createNote("scratchpad.txt");
    expect(second).toBe("scratchpad-1.txt");

    await writeFile(join(fixedNotesDir, "alpha.md"), "alpha-body", "utf8");
    const before = notepadService.getState().filename;
    const mdContent = await notepadService.readFileContent("alpha.md");
    expect(mdContent).toBe("alpha-body");
    expect(notepadService.getState().filename).toBe(before);
  });

  afterAll(async () => {
    mock.restore();
    await rm(fixedNotesDir, { recursive: true, force: true });
  });
});
