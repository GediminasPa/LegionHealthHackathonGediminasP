---
name: new-agent-tool
description: Add a new tool to the Pydantic AI agent (with a mocked test). Use when the user wants the agent/assistant to be able to do or look up something new, e.g. "/new-agent-tool search orders by name" or "let the agent create items".
---

# New agent tool

Add a tool to the assistant agent in `app/agents/assistant.py`, following the existing `list_items` tool.

## Steps

1. **Tool function** — add an async `@assistant.tool` function. Signature: `ctx: RunContext[AgentDeps]` first, then plain typed parameters (the model fills these). DB access via `ctx.deps.session`; reuse functions from `app/services/` instead of writing queries inline where possible. The docstring is the tool description the model sees — one clear sentence about when to use it.
2. **Return value** — return JSON-serializable data (dicts/lists of primitives), not ORM objects.
3. **Prompt** — if the tool changes what the agent should proactively do, mention it in `prompts/assistant.md`.
4. **Test** — extend `tests/test_agent.py`: a `FunctionModel(stream_function=...)` that issues a `DeltaToolCall(name="<tool>", json_args=...)` on the first call and streams text reflecting the tool return on the second. Assert the tool's effect/output appears in the SSE body. Never make real model calls (`models.ALLOW_MODEL_REQUESTS = False` is already set).
5. **Verify** — `bin/check` must pass.

If the tool mutates data (create/update), make the test assert the mutation actually persisted via the REST API, not just the agent's reply.
