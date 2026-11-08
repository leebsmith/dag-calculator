"""Local-only interactive inspector for the artifact DAG."""

from __future__ import annotations

import html
import os
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.artifact import data_dir, load_artifact

router = APIRouter()

_REPO_ROOT = Path(__file__).resolve().parents[3]
SVG_PATH = _REPO_ROOT / "docs" / "artifact_dag.svg"

_XML_DECLARATION = re.compile(r"<\?xml.*?\?>", re.DOTALL)
_DOCTYPE = re.compile(r"<!DOCTYPE.*?>", re.DOTALL)

_KIND_BADGES = {
    "root": "root",
    "choice": "choice",
    "collection": "collection",
    "selection": "selection",
    "derived": "derived",
    "boundary": "boundary",
    "identity": "identity",
    "relation": "relation",
}


def verify_local_dev() -> None:
    """Reject everything unless this process was started for local development."""
    if os.environ.get("APP_ENV", "").strip().lower() != "development":
        raise HTTPException(status_code=404, detail="Not Found")


def _artifact_path() -> Path:
    return data_dir() / "artifact.json"


def _svg_text() -> str | None:
    if not SVG_PATH.is_file():
        return None
    text = SVG_PATH.read_text(encoding="utf-8")
    text = _XML_DECLARATION.sub("", text, count=1)
    text = _DOCTYPE.sub("", text, count=1)
    return text.strip()


def _graph_is_stale() -> bool:
    try:
        return SVG_PATH.stat().st_mtime_ns < _artifact_path().stat().st_mtime_ns
    except OSError:
        return False


def _group_nodes(nodes: Mapping[str, Any]) -> dict[str, dict[str, list[tuple[str, str]]]]:
    groups: dict[str, dict[str, list[tuple[str, str]]]] = {}
    for node_id in sorted(nodes):
        parts = node_id.split(".")
        namespace = parts[0]
        subgroup = parts[1] if len(parts) > 1 else ""
        kind = str(nodes[node_id].get("kind", "derived"))
        groups.setdefault(namespace, {}).setdefault(subgroup, []).append((node_id, kind))
    return {namespace: dict(sorted(entries.items())) for namespace, entries in sorted(groups.items())}


def _badge(kind: str) -> str:
    label = _KIND_BADGES.get(kind, kind)
    return f'<span class="badge badge-{html.escape(label)}">{html.escape(label)}</span>'


def _button(node_id: str, kind: str, label: str | None = None) -> str:
    text = html.escape(label if label is not None else node_id)
    return (
        f'<button class="node" type="button" data-node-id="{html.escape(node_id)}" '
        f'data-kind="{html.escape(kind)}"><span class="node-id">{text}</span>'
        f"{_badge(kind)}</button>"
    )


def _render_namespace(
    namespace: str, subgroups: dict[str, list[tuple[str, str]]]
) -> str:
    count = sum(len(entries) for entries in subgroups.values())
    lines = [
        '<section class="namespace">',
        f'<h2>{html.escape(namespace)} <span class="count">{count}</span></h2>',
    ]
    for subgroup, entries in subgroups.items():
        if subgroup:
            lines.append(f'<h3>{html.escape(subgroup)}</h3>')
        lines.extend(_button(node_id, kind) for node_id, kind in entries)
    lines.append("</section>")
    return "\n".join(lines)


def _render_identity(identity: Mapping[str, str]) -> str:
    if not identity:
        return ""
    lines = [
        '<section class="namespace">',
        f'<h2>external identity <span class="count">{len(identity)}</span></h2>',
    ]
    lines.extend(_button(namespace, "identity") for namespace in sorted(identity))
    lines.append("</section>")
    return "\n".join(lines)


def _render_relations(relations: list[Mapping[str, Any]] | tuple[Mapping[str, Any], ...]) -> str:
    if not relations:
        return ""
    lines = [
        '<section class="namespace">',
        f'<h2>relations <span class="count">{len(relations)}</span></h2>',
    ]
    for relation in relations:
        relation_id = str(relation["id"])
        severity = "blocking" if relation.get("blocking") else "warning"
        lines.append(_button(f"rel_{relation_id}", "relation", f"{relation_id} · {severity}"))
    lines.append("</section>")
    return "\n".join(lines)


def _render_sidebar(artifact: Mapping[str, Any]) -> str:
    nodes = artifact["nodes"]
    groups = _group_nodes(nodes)
    lines = [
        '<aside class="sidebar">',
        '<header><h1>Artifact DAG</h1>'
        '<p class="muted">Click a node to highlight and center it.</p>'
        '<input id="filter" type="search" placeholder="Filter nodes…" '
        'aria-label="Filter nodes"></header>',
        '<nav id="sidebar">',
    ]
    lines.extend(_render_namespace(namespace, subgroups) for namespace, subgroups in groups.items())
    identity = artifact.get("identity") or {}
    relations = artifact.get("relations") or []
    lines.append(_render_identity(identity))
    lines.append(_render_relations(relations))
    lines.extend(["</nav>", "</aside>"])
    return "\n".join(line for line in lines if line)


def _render_legend() -> str:
    return (
        '<div class="legend">'
        + "".join(_badge(kind) for kind in _KIND_BADGES)
        + "</div>"
    )


def _render_page(artifact: Mapping[str, Any], svg: str, stale: bool) -> str:
    meta = artifact.get("meta") or {}
    name = html.escape(str(meta.get("name", "artifact")))
    schema = html.escape(str(artifact.get("schema_version", "?")))
    nodes = artifact["nodes"]
    relations = artifact.get("relations") or []
    banner = (
        '<div class="banner">The graph is older than data/artifact.json. '
        "Run <code>make dot</code> to refresh it.</div>"
        if stale
        else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} · DAG inspector</title>
<style>{_STYLE}</style>
</head>
<body>
{_render_sidebar(artifact)}
<main class="viewport">
<header class="toolbar">
<div><h1>{name}</h1><p class="muted">schema {schema} · {len(nodes)} nodes · {len(relations)} relations</p></div>
{_render_legend()}
</header>
{banner}
<div id="graph">{svg}</div>
</main>
<script>{_SCRIPT}</script>
</body>
</html>
"""


def _missing_page(reason: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>DAG graph unavailable</title><style>{_STYLE}</style></head>
<body><main class="missing">
<h1>DAG graph unavailable</h1>
<p>{html.escape(reason)}</p>
<p>Generate it with <code>make dot</code>, then reload this page.</p>
</main></body>
</html>
"""


@router.get("/dev/dag-visualizer", response_class=HTMLResponse, include_in_schema=False)
def dag_visualizer() -> HTMLResponse:
    """Serve the interactive artifact graph to a local development session."""
    verify_local_dev()
    artifact = load_artifact()
    svg = _svg_text()
    if svg is None:
        return HTMLResponse(
            status_code=503,
            content=_missing_page("No rendered SVG was found beside the dot file."),
            headers={"Cache-Control": "no-store"},
        )
    return HTMLResponse(
        content=_render_page(artifact, svg, _graph_is_stale()),
        headers={"Cache-Control": "no-store"},
    )


_STYLE = """
:root {
  color-scheme: light;
  --ink: #1f2933;
  --muted: #627d98;
  --line: #d9e2ec;
  --surface: #ffffff;
  --page: #f5f7fa;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  display: flex;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
  background: var(--page);
}
.sidebar {
  width: 360px;
  min-width: 280px;
  max-width: 42vw;
  height: 100vh;
  overflow: auto;
  background: var(--surface);
  border-right: 1px solid var(--line);
  position: sticky;
  top: 0;
}
.sidebar header { padding: 18px 16px 12px; border-bottom: 1px solid var(--line); }
.sidebar h1 { margin: 0 0 4px; font-size: 18px; }
.muted { margin: 0; color: var(--muted); font-size: 12px; }
#filter {
  width: 100%;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
}
#sidebar { padding: 8px 10px 32px; }
.namespace { margin: 8px 0 14px; }
.namespace h2 {
  margin: 8px 4px 4px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.namespace h3 { margin: 10px 6px 3px; font-size: 11px; color: #829ab1; }
.count {
  float: right;
  font-weight: 500;
  color: #9fb3c8;
}
.node {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.node:hover { background: #eef2f7; }
.node.selected { background: #ffe9c7; box-shadow: inset 3px 0 0 #e65100; }
.node-id {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.badge-root { background: #e3f2fd; color: #0d47a1; }
.badge-choice { background: #e1f5fe; color: #01579b; }
.badge-collection { background: #f3e5f5; color: #4a148c; }
.badge-selection { background: #eceff1; color: #37474f; }
.badge-derived { background: #f5f5f5; color: #424242; }
.badge-boundary { background: #fff3e0; color: #bf360c; }
.badge-identity { background: #e0f2f1; color: #004d40; }
.badge-relation { background: #ffebee; color: #b71c1c; }
.viewport { flex: 1; height: 100vh; overflow: auto; padding: 18px 24px 60px; }
.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.toolbar h1 { margin: 0; font-size: 20px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; max-width: 460px; }
.banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid #ffcc80;
  border-radius: 8px;
  background: #fff8e1;
  font-size: 13px;
}
#graph {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  overflow: auto;
}
#graph svg { display: block; min-width: 1100px; height: auto; }
#graph.highlighting g.node:not(.highlighted) { opacity: 0.3; }
#graph g.node.highlighted > polygon,
#graph g.node.highlighted > ellipse,
#graph g.node.highlighted > path {
  fill: #ffe082 !important;
  stroke: #d84315 !important;
  stroke-width: 2.5px !important;
}
#graph g.node.highlighted > text { fill: #000 !important; font-weight: 700; }
.missing { margin: 40px auto; max-width: 720px; padding: 24px; }
code { padding: 1px 5px; border-radius: 5px; background: #eef2f7; }
@media (max-width: 820px) {
  body { flex-direction: column; }
  .sidebar { width: 100%; max-width: none; height: 42vh; position: relative; }
  .viewport { height: 58vh; }
  #graph svg { min-width: 900px; }
}
"""

_SCRIPT = """
const graph = document.getElementById("graph");
const sidebar = document.getElementById("sidebar");
const filter = document.getElementById("filter");
let selected = null;

function highlightNode(id) {
  const target = document.getElementById(id);
  if (!target) return;
  document.querySelectorAll("g.node.highlighted").forEach((node) => {
    node.classList.remove("highlighted");
  });
  sidebar.querySelectorAll(".node.selected").forEach((node) => {
    node.classList.remove("selected");
  });
  selected = null;
  target.classList.add("highlighted");
  graph.classList.add("highlighting");
  for (const button of sidebar.querySelectorAll("[data-node-id]")) {
    if (button.dataset.nodeId === id) {
      button.classList.add("selected");
      selected = button;
      break;
    }
  }
  if (selected) selected.scrollIntoView({ behavior: "smooth", block: "nearest" });
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  history.replaceState(null, "", "#" + encodeURIComponent(id));
}

function clearHighlight() {
  document.querySelectorAll("g.node.highlighted").forEach((node) => {
    node.classList.remove("highlighted");
  });
  sidebar.querySelectorAll(".node.selected").forEach((node) => {
    node.classList.remove("selected");
  });
  selected = null;
  graph.classList.remove("highlighting");
}

window.highlightNode = highlightNode;

sidebar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-node-id]");
  if (button) highlightNode(button.dataset.nodeId);
});

graph.addEventListener("click", (event) => {
  const node = event.target.closest("g.node");
  if (node && node.id) highlightNode(node.id);
  else clearHighlight();
});

filter.addEventListener("input", () => {
  const query = filter.value.trim().toLowerCase();
  for (const button of sidebar.querySelectorAll("[data-node-id]")) {
    button.hidden = query.length > 0 && !button.dataset.nodeId.toLowerCase().includes(query);
  }
});

if (location.hash.length > 1) {
  highlightNode(decodeURIComponent(location.hash.slice(1)));
}
"""
