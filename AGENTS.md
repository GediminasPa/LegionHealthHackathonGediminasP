# Agent Instructions

## Process Management

- Do not create or manage `tmux` sessions unless the user explicitly asks for orchestrator mode, a Codex swarm, tmux-based workers, or otherwise directly requests `tmux`.
- Outside orchestrator mode, run local servers in the foreground when possible. If a persistent background process is needed, ask the user before starting it.
