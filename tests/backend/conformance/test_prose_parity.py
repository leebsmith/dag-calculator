"""Shared prose corpus: the backend degrades the constructs the UI flags."""

from __future__ import annotations

import json
from pathlib import Path

from app.services.prose import parse_markdown

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "conformance"
    / "fixtures"
    / "prose-constructs.json"
)


def node_types(ast: dict) -> list[str]:
    found: list[str] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if isinstance(node.get("type"), str):
                found.append(node["type"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(ast)
    return found


def node_text(ast: dict) -> str:
    found: list[str] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if isinstance(node.get("value"), str):
                found.append(node["value"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(ast)
    return "".join(found)


def test_the_backend_degrades_the_shared_prose_corpus_as_documented() -> None:
    cases = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for entry in cases:
        expected = entry.get("python")
        if not expected:
            continue
        ast = parse_markdown(entry["source"])
        types = node_types(ast)
        if "block_types" in expected:
            assert [child["type"] for child in ast["children"]] == expected["block_types"], entry["name"]
        for kind in expected.get("contains_types", []):
            assert kind in types, entry["name"]
        for kind in expected.get("forbidden_types", []):
            assert kind not in types, entry["name"]
        if "contains_text" in expected:
            assert expected["contains_text"] in node_text(ast), entry["name"]
