# specs/

Implementation-ready specs live here, one Markdown file per feature (`<kebab-case-name>.md`).

The build loop:

1. **Spec** — turn the rough idea into a spec with `/spec-builder <idea>` (problem, FRs, acceptance criteria, tickets). Optionally push the tickets to Linear.
2. **Implement** — work the tickets in order; each is sized for one agent loop (~one PR).
3. **Verify** — `bin/check` green + the ticket's acceptance criteria, then commit referencing the ticket ID.

Keep FR/ticket numbering stable when iterating on a spec — edit in place, add new numbers, never renumber.
