# GSD Codex CLI Notes

- This repo targets Codex CLI, not Claude Code. Keep docs and prompts aligned with `/prompts:gsd-*`.
- Codex prompts live in `codex-prompts/` and are installed to `~/.codex/prompts`.
- Shared workflows/templates live in `get-shit-done/` and are installed to `~/.codex/get-shit-done`.
- Do not use `@` include syntax in prompts or workflows; use explicit “Read file: …” instructions instead.
- Map-codebase parallelism is handled by the `get-shit-done-codex` wrapper (`bin/gsd-codex.js`).
