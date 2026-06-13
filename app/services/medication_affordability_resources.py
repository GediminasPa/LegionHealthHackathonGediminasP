from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "medication_affordability"
RESOURCES_PATH = DATA_DIR / "resources.json"


def load_resources() -> list[dict[str, Any]]:
    return json.loads(RESOURCES_PATH.read_text())


def list_resource_connections() -> list[dict[str, Any]]:
    return load_resources()


def search_curated_resources(
    query: str = "", tags: list[str] | None = None, limit: int = 5
) -> list[dict[str, Any]]:
    resources = load_resources()
    normalized_query = query.lower()
    normalized_tags = {tag.lower() for tag in tags or []}

    def score(resource: dict[str, Any]) -> int:
        haystack = " ".join(
            [
                str(resource.get("id", "")),
                str(resource.get("name", "")),
                str(resource.get("notes_for_agent", "")),
                " ".join(resource.get("tags", [])),
                " ".join(resource.get("domains", [])),
            ]
        ).lower()
        tag_score = len(
            normalized_tags.intersection({tag.lower() for tag in resource.get("tags", [])})
        )
        query_score = sum(1 for token in normalized_query.split() if token in haystack)
        return tag_score * 3 + query_score

    ranked = sorted(resources, key=score, reverse=True)
    if normalized_query or normalized_tags:
        ranked = [resource for resource in ranked if score(resource) > 0]
    return ranked[:limit]
