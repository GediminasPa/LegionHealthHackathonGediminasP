# Agent Instructions

## Routine Private Git Sync

After completing meaningful work in this repository, inspect the diff for secrets and unrelated files, run the relevant checks when practical, then commit and push the task-relevant changes to the configured private GitHub remote unless the user explicitly asks not to. Prefer small coherent commits; do not leave finished work only in the working tree.

This standing preference applies to private Git repository sync only. It does not authorize public repositories, hosted previews, GitHub Pages, deployments, or any live service publication.

## Process Management

- Do not create or manage `tmux` sessions unless the user explicitly asks for orchestrator mode, a Codex swarm, tmux-based workers, or otherwise directly requests `tmux`.
- Outside orchestrator mode, run local servers in the foreground when possible. If a persistent background process is needed, ask the user before starting it.

## Browser And Playwright

- For routine frontend checks, use Playwright headlessly/silently in the background rather than opening a visible browser window. Prefer shell-driven headless checks or screenshots saved to `agent-reports/`.
- Do not open the in-app Browser plugin, headed Chromium, Safari, Chrome, or any visible browser window unless the user explicitly asks for visual debugging or an interactive browser.

## Delivery Workflow

- After completing a meaningful coding task and verifying it, commit only the relevant changes and push the current branch unless the user explicitly asks not to.
