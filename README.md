# Venus

Venus is a terminal-first knowledge assistant built with Bun, Ink, and SQLite.
It combines chat, long-term memory, tool execution, and note-taking in a single CLI interface.

## Features

- Multi-panel terminal UI (chat, memory, tools, MCP, graph, notes)
- Local memory store with semantic retrieval
- Tool registry for file and memory operations
- Session-based chat history with indexing
- Automated non-UI test suite with strict coverage gating

## Tech Stack

- Runtime: Bun
- UI: Ink + React
- Storage: SQLite (`bun:sqlite`)
- Language: TypeScript

## Project Structure

```text
.
├── src/
│   ├── components/          # Ink UI components
│   ├── core/
│   │   ├── chat/            # Prompt + agent loop logic
│   │   ├── mcp/             # Tool definitions and registry
│   │   ├── memory/          # Database + memory manager
│   │   ├── notes/           # Notepad service
│   │   └── theme.ts
│   ├── db/                  # Local sqlite file (ignored in git)
│   ├── types/
│   └── index.tsx            # App entry
├── tests/core/              # Non-UI test suite
├── scripts/
│   ├── check-coverage.mjs   # Coverage gate script
│   └── manual/              # Manual diagnostic/smoke scripts
└── package.json
```

## Setup

```bash
bun install
```

## Run

```bash
bun run dev
```

## Build

```bash
bun run build
bun run start
```

## Quality Checks

```bash
bun run type-check
bun run test
bun run test:coverage
```

`test:coverage` enforces 100% coverage for non-UI modules (`src/core/**` and `src/types/**`, excluding hooks).

## Manual Diagnostics

```bash
bun run db:check
bun run db:test
bun run memory:smoke
```

## Notes

- `src/db/*.db` is intentionally ignored.
- Pre-commit runs `bun run test` via `simple-git-hooks`.
