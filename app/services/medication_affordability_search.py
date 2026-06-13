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
    seen_urls: set[str] = set()

    def add_result(annotation: dict[str, Any]) -> None:
        url = annotation.get("url")
        title = annotation.get("title") or url
        if isinstance(url, str) and isinstance(title, str) and url not in seen_urls:
            seen_urls.add(url)
            results.append(
                WebSearchResult(
                    title=title,
                    url=url,
                    summary=annotation.get("text") or annotation.get("summary"),
                    raw=annotation,
                )
            )

    for citation in payload.get("citations", []):
        if isinstance(citation, str) and citation not in seen_urls:
            seen_urls.add(citation)
            results.append(WebSearchResult(title=citation, url=citation, raw={"url": citation}))
        elif isinstance(citation, dict):
            add_result(citation)

    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for annotation in item.get("annotations", []):
            if not isinstance(annotation, dict):
                continue
            add_result(annotation)
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            for annotation in content.get("annotations", []):
                if isinstance(annotation, dict):
                    add_result(annotation)
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
        web_search_tool: dict[str, Any] = {"type": "web_search"}
        if allowed_domains:
            web_search_tool["filters"] = {"allowed_domains": allowed_domains[:5]}

        response = await http_client.post(
            f"{settings.grok_base_url.rstrip('/')}/responses",
            headers={"Authorization": f"Bearer {settings.grok_api_key}"},
            json={
                "model": settings.agent_model.split(":", 1)[-1],
                "input": [{"role": "user", "content": query}],
                "tools": [web_search_tool],
            },
        )
        response.raise_for_status()
        return _extract_search_results(response.json())
    finally:
        if close_client:
            await http_client.aclose()
