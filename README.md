# Venus - A Lightning-Fast Terminal Second Brain

## Overview

Venus is an autonomous, proactive personal assistant and second brain for the terminal. It combines:

- **Reactive UI** with Ink (React for CLI)
- **Long-term Memory** via SQLite with vector embeddings
- **Command Orchestration** with slash commands
- **MCP Integration** for external tools and extensions

## Getting Started

### Prerequisites

- Bun 1.0+ ([install here](https://bun.sh))
- Node.js 18+ (for dependencies)

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

### Build

```bash
bun run build
bun run start
```

## Architecture

### Folder Structure

```
venus/
├── src/
│   ├── components/          # Ink React components
│   │   ├── ChatWindow.tsx   # Main chat display
│   │   ├── InputBar.tsx     # Sticky bottom input
│   │   └── ContextHeader.tsx # Memory/status display
│   ├── core/                # Core business logic
│   │   ├── memory/          # SQLite & vector memory layer
│   │   ├── commands/        # Command router & handlers
│   │   └── mcp/             # MCP server orchestrator
│   ├── types/               # Shared TypeScript types
│   └── index.tsx            # Entry point
├── db/                      # SQLite database storage
├── config/                  # Configuration files
├── venus.json               # MCP server configuration
├── bunfig.toml              # Bun runtime config
├── tsconfig.json            # TypeScript configuration
├── package.json
└── README.md
```

## Key Features (Roadmap)

- [x] Basic Ink UI scaffold
- [x] Sticky bottom command input
- [x] Command menu system (`/help`, `/read`, `/write`, etc.)
- [ ] SQLite memory schema (vector + working)
- [ ] MCP server spawning & stdio communication
- [ ] Claude API integration for chat
- [ ] File ingestion (`/read`)
- [ ] Content generation (`/write`)
- [ ] Memory persistence (`/memorize`)
- [ ] Advanced UI features (spinners, progress bars)

## Commands

- `/help` - Show available commands
- `/read [filepath]` - Ingest a file into working memory
- `/write [prompt] -> [filepath]` - Generate and write content
- `/memorize [text]` - Store in long-term memory
- `/forget [topic]` - Prune from database

## Tech Stack

- **Runtime:** Bun
- **UI:** Ink + React
- **Memory:** SQLite (`bun:sqlite`)
- **IPC:** MCP (Model Context Protocol)

---

_Built with ⚡ for lightning-fast context switching and autonomous assistance._
