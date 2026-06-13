from __future__ import annotations

from typing import Any

import httpx
from pydantic import BaseModel, Field

from app.config import get_settings


class WebSearchResult(BaseModel):
    title: str
    url: str
    summary: str | None = None
    publisher: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


def _extract_search_results(payload: dict[str, Any]) -> list[WebSearchResult]:
    results: list[WebSearchResult] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for annotation in item.get("annotations", []):
            if not isinstance(annotation, dict):
                continue
            url = annotation.get("url")
            title = annotation.get("title") or url
            if isinstance(url, str) and isinstance(title, str):
                results.append(
                    WebSearchResult(
                        title=title,
                        url=url,
                        summary=annotation.get("text") or annotation.get("summary"),
                        raw=annotation,
                    )
                )
    return results


async def grok_web_search(
    query: str,
    allowed_domains: list[str] | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[WebSearchResult]:
    settings = get_settings()
    if not settings.grok_api_key:
        return []

    close_client = client is None
    http_client = client or httpx.AsyncClient(timeout=30)
    try:
        response = await http_client.post(
            f"{settings.grok_base_url.rstrip('/')}/responses",
            headers={"Authorization": f"Bearer {settings.grok_api_key}"},
            json={
                "model": settings.agent_model.split(":", 1)[-1],
                "input": [{"role": "user", "content": query}],
                "tools": [{"type": "web_search"}],
                "filters": {"allowed_domains": allowed_domains or []},
            },
        )
        response.raise_for_status()
        return _extract_search_results(response.json())
    finally:
        if close_client:
            await http_client.aclose()
