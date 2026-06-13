---
name: demo-prep
description: Pre-demo checklist — verify the stack boots, seed demo data, smoke-test the API, agent, and UI so the live demo doesn't break. Use right before presenting, e.g. "/demo-prep" or "get ready for the demo".
---

# Demo prep

Make the app demo-proof. Work through this checklist and report a pass/fail summary at the end.

## Checklist

1. **Quality gate** — `bin/check` passes. If not, fix or explicitly flag what's broken before anything else.
2. **Clean boot** — `bin/up`, then start the API (`uv run uvicorn app.main:app --port 8000` in background) and confirm `GET /api/health` returns `{"status": "ok", "db": "ok"}`.
3. **Agent key** — confirm `ANTHROPIC_API_KEY` is set in `.env`. If it is, send one real message to `POST /api/agent/chat` and confirm tokens stream back. If not, warn loudly — the chat demo will show a 503 setup hint.
4. **Seed data** — ask what demo data is needed (or infer from the product). Create it via the REST API so the agent's DB tools have something real to show. Don't seed junk like "test1".
5. **Frontend** — `npm --prefix frontend run build` passes; start `bin/dev` and confirm the page loads, the health badge is green, and one chat round-trip renders incrementally.
6. **Reset story** — note how to wipe and re-seed quickly if the demo machine needs a reset: `bin/db reset` + the seed commands from step 4. Print these at the end.
7. **Demo script** — output a 5-line suggested demo flow (what to click/type, in order), based on what the app currently does.

Anything that fails: fix it if it's quick, otherwise put it at the TOP of the report in bold.
