"""The local-only DAG inspector: dev gate, sidebar, and SVG embedding."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.routers.dev as dev
from app.artifact import load_artifact
from app.main import app

SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="120pt" height="40pt">
<g id="batch.target_abv" class="node"><title>batch.target_abv</title>
<ellipse cx="20" cy="20" rx="18" ry="10"/></g>
</svg>
"""


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def svg_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "artifact_dag.svg"
    path.write_text(SVG, encoding="utf-8")
    monkeypatch.setattr(dev, "SVG_PATH", path)
    return path


def test_the_inspector_is_hidden_without_development_mode(client: TestClient, monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    response = client.get("/dev/dag-visualizer")
    assert response.status_code == 404


def test_the_inspector_is_hidden_outside_development(
    client: TestClient, monkeypatch, svg_path: Path
):
    monkeypatch.setenv("APP_ENV", "production")
    response = client.get("/dev/dag-visualizer")
    assert response.status_code == 404
    assert svg_path.is_file()


def test_the_inspector_embeds_the_graph_and_lists_every_node(
    client: TestClient, monkeypatch, svg_path: Path
):
    monkeypatch.setenv("APP_ENV", "development")
    response = client.get("/dev/dag-visualizer")

    assert response.status_code == 200
    body = response.text
    assert response.headers["cache-control"] == "no-store"
    assert 'id="batch.target_abv"' in body
    assert 'data-node-id="batch.target_abv"' in body
    assert 'data-node-id="rel_hlt_not_overfilled"' in body
    assert 'data-node-id="equipment"' in body
    assert "function highlightNode" in body

    for node_id in load_artifact()["nodes"]:
        assert f'data-node-id="{node_id}"' in body


def test_a_missing_svg_explains_the_dot_target(
    client: TestClient, monkeypatch, tmp_path: Path
):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setattr(dev, "SVG_PATH", tmp_path / "missing.svg")

    response = client.get("/dev/dag-visualizer")

    assert response.status_code == 503
    assert "make dot" in response.text


def test_the_inspector_is_absent_from_the_openapi_schema():
    assert "/dev/dag-visualizer" not in app.openapi()["paths"]
