"""Render the artifact DAG as GraphViz dot, with an optional SVG render."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT = ROOT / "data" / "artifact.json"
DEFAULT_OUT = ROOT / "docs" / "artifact_dag.dot"

PATH_TOKEN = re.compile(
    r"(?<![A-Za-z0-9_$])([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)"
)
SKIP_PREFIXES = ("constants.", "functions.", "row.")

KIND_STYLE = {
    "root": {
        "shape": "box",
        "style": "rounded,filled",
        "fillcolor": "#e3f2fd",
        "color": "#1565c0",
    },
    "choice": {
        "shape": "box",
        "style": "rounded,filled",
        "fillcolor": "#e1f5fe",
        "color": "#0277bd",
    },
    "collection": {
        "shape": "box3d",
        "style": "filled",
        "fillcolor": "#f3e5f5",
        "color": "#6a1b9a",
    },
    "selection": {
        "shape": "box",
        "style": "dashed,filled",
        "fillcolor": "#f5f5f5",
        "color": "#616161",
    },
    "derived": {
        "shape": "ellipse",
        "style": "filled",
        "fillcolor": "#ffffff",
        "color": "#424242",
    },
    "boundary": {
        "shape": "hexagon",
        "style": "filled",
        "fillcolor": "#fff3e0",
        "color": "#e65100",
    },
}

IDENTITY_STYLE = {
    "shape": "box",
    "style": "dashed,filled",
    "fillcolor": "#eceff1",
    "color": "#78909c",
    "fontcolor": "#37474f",
}

RELATION_STYLE = {
    True: {
        "shape": "diamond",
        "style": "dashed,filled",
        "fillcolor": "#ffebee",
        "color": "#c62828",
    },
    False: {
        "shape": "diamond",
        "style": "dashed,filled",
        "fillcolor": "#fff8e1",
        "color": "#ef6c00",
    },
}

EDGE_STYLE = {
    "data": 'color="#546e7a", penwidth=1.0',
    "read": 'color="#b0bec5", style="dashed", constraint=false, penwidth=0.9',
    "reference": 'color="#1565c0", style="dotted", penwidth=1.2',
}
RELATION_EDGE_STYLE = {
    True: 'color="#c62828", style="dashed", dir="none", constraint=false, penwidth=1.0',
    False: 'color="#ef6c00", style="dashed", dir="none", constraint=false, penwidth=1.0',
}


def dot_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def dot_attrs(attributes: dict[str, Any]) -> str:
    return ", ".join(f"{key}={dot_quote(str(value))}" for key, value in attributes.items())


def load_artifact(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        artifact = json.load(handle)
    if not isinstance(artifact.get("nodes"), dict):
        raise ValueError(f"{path} does not declare a nodes table")
    return artifact


def resolve_reference(
    nodes: dict[str, Any], identity: dict[str, str], path: str
) -> tuple[str, str, tuple[str, ...]] | None:
    if path in nodes:
        return ("node", path, ())
    parts = path.split(".")
    for index in range(len(parts) - 1, 0, -1):
        prefix = ".".join(parts[:index])
        if prefix in nodes:
            return ("node", prefix, tuple(parts[index:]))
    for index in range(len(parts), 0, -1):
        prefix = ".".join(parts[:index])
        if prefix in identity:
            return ("identity", prefix, tuple(parts[index:]))
    return None


def strip_string_literals(expression: str) -> str:
    rendered: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(expression):
        char = expression[index]
        if quote is not None:
            if char == "\\" and index + 1 < len(expression):
                rendered.extend((" ", " "))
                index += 2
                continue
            if char == quote:
                quote = None
            rendered.append(" ")
        elif char in {'"', "'"}:
            quote = char
            rendered.append(" ")
        else:
            rendered.append(char)
        index += 1
    return "".join(rendered)


def expression_paths(expression: str) -> list[str]:
    stripped = strip_string_literals(expression)
    return sorted(
        {
            path
            for path in PATH_TOKEN.findall(stripped)
            if not path.startswith(SKIP_PREFIXES)
        }
    )


def add_resolved_edge(
    edges: set[tuple[str, str, str]],
    identities: set[str],
    nodes: dict[str, Any],
    identity: dict[str, str],
    source_path: str,
    target: str,
    kind: str,
    owner: str,
) -> None:
    resolved = resolve_reference(nodes, identity, source_path)
    if resolved is None:
        raise ValueError(f"{owner}: cannot resolve declared reference {source_path!r}")
    resolved_kind, resolved_id, _suffix = resolved
    if resolved_kind == "identity":
        identities.add(resolved_id)
    edges.add((resolved_id, target, kind))


def node_input_edges(
    node_id: str,
    node: dict[str, Any],
    edges: set[tuple[str, str, str]],
    identities: set[str],
    nodes: dict[str, Any],
    identity: dict[str, str],
) -> None:
    kind = node.get("kind")
    if kind in {"derived", "boundary"}:
        for path in (node.get("inputs") or {}).values():
            add_resolved_edge(edges, identities, nodes, identity, path, node_id, "data", node_id)
    elif kind == "collection":
        for field, spec in sorted((node.get("fields") or {}).items()):
            for path in (spec.get("inputs") or {}).values():
                add_resolved_edge(
                    edges, identities, nodes, identity, path, node_id, "read", f"{node_id}.{field}"
                )
    elif kind == "selection":
        add_resolved_edge(
            edges, identities, nodes, identity, node["ref"], node_id, "reference", node_id
        )


def relation_edges(
    artifact: dict[str, Any],
    edges: set[tuple[str, str, str]],
    identities: set[str],
) -> dict[str, dict[str, Any]]:
    nodes = artifact["nodes"]
    identity = artifact.get("identity") or {}
    relations: dict[str, dict[str, Any]] = {}
    for relation in artifact.get("relations") or []:
        relation_id = str(relation["id"])
        relation_node = f"rel_{relation_id}"
        participants: set[str] = set()
        for path in expression_paths(str(relation.get("predicate", ""))):
            resolved = resolve_reference(nodes, identity, path)
            if resolved is None:
                continue
            resolved_kind, resolved_id, _suffix = resolved
            if resolved_kind == "identity":
                identities.add(resolved_id)
            participants.add(resolved_id)
        for participant in sorted(participants):
            edges.add((participant, relation_node, "relation"))
        relations[relation_id] = {
            "blocking": bool(relation.get("blocking")),
            "predicate": str(relation.get("predicate", "")),
            "participants": sorted(participants),
        }
    return relations


def collect_graph(
    artifact: dict[str, Any],
) -> tuple[set[tuple[str, str, str]], set[str], dict[str, dict[str, Any]]]:
    nodes = artifact["nodes"]
    identity = artifact.get("identity") or {}
    edges: set[tuple[str, str, str]] = set()
    identities: set[str] = set(identity)
    for node_id in sorted(nodes):
        node_input_edges(node_id, nodes[node_id], edges, identities, nodes, identity)
    relations = relation_edges(artifact, edges, identities)
    return edges, identities, relations


def node_label(node_id: str, namespace: str) -> str:
    prefix = f"{namespace}."
    return node_id[len(prefix) :] if node_id.startswith(prefix) else node_id


def render_node(node_id: str, node: dict[str, Any], namespace: str) -> str:
    kind = str(node.get("kind", "derived"))
    style = KIND_STYLE.get(kind, KIND_STYLE["derived"])
    attributes = {
        "id": node_id,
        "label": node_label(node_id, namespace),
        "tooltip": node_id,
        **style,
    }
    return f"    {dot_quote(node_id)} [{dot_attrs(attributes)}];"


def render_cluster(namespace: str, node_ids: list[str], nodes: dict[str, Any]) -> list[str]:
    cluster_id = f"cluster_{namespace}"
    lines = [
        f"  subgraph {dot_quote(cluster_id)} {{",
        f"    label={dot_quote(namespace)};",
        '    style="rounded,filled";',
        '    color="#cfd8dc";',
        '    fillcolor="#fafafa";',
    ]
    lines.extend(render_node(node_id, nodes[node_id], namespace) for node_id in node_ids)
    lines.append("  }")
    return lines


def render_identity_cluster(identities: set[str]) -> list[str]:
    if not identities:
        return []
    lines = [
        '  subgraph "cluster_identity" {',
        '    label="external identity";',
        '    style="rounded,filled";',
        '    color="#b0bec5";',
        '    fillcolor="#f5f5f5";',
    ]
    for namespace in sorted(identities):
        attributes = {
            "id": namespace,
            "label": namespace,
            "tooltip": f"identity namespace {namespace}",
            **IDENTITY_STYLE,
        }
        lines.append(f"    {dot_quote(namespace)} [{dot_attrs(attributes)}];")
    lines.append("  }")
    return lines


def render_relation_cluster(relations: dict[str, dict[str, Any]]) -> list[str]:
    if not relations:
        return []
    lines = [
        '  subgraph "cluster_relations" {',
        '    label="relations";',
        '    style="rounded,filled";',
        '    color="#ffcdd2";',
        '    fillcolor="#fffafa";',
    ]
    for relation_id in sorted(relations):
        relation = relations[relation_id]
        attributes = {
            "id": f"rel_{relation_id}",
            "label": relation_id,
            "tooltip": relation["predicate"],
            "fontsize": "9",
            **RELATION_STYLE[relation["blocking"]],
        }
        lines.append(f"    {dot_quote(f'rel_{relation_id}')} [{dot_attrs(attributes)}];")
    lines.append("  }")
    return lines


def render_edges(
    edges: set[tuple[str, str, str]], relations: dict[str, dict[str, Any]]
) -> list[str]:
    lines: list[str] = []
    for source, target, kind in sorted(edges):
        if kind == "relation":
            relation_id = target.removeprefix("rel_")
            blocking = bool(relations.get(relation_id, {}).get("blocking"))
            style = RELATION_EDGE_STYLE[blocking]
            lines.append(f"  {dot_quote(source)} -> {dot_quote(target)} [{style}];")
        else:
            lines.append(f"  {dot_quote(source)} -> {dot_quote(target)} [{EDGE_STYLE[kind]}];")
    return lines


def render_dot(artifact: dict[str, Any]) -> tuple[str, int, int, int]:
    nodes = artifact["nodes"]
    edges, identities, relations = collect_graph(artifact)
    namespaces: dict[str, list[str]] = {}
    for node_id in sorted(nodes):
        namespaces.setdefault(node_id.split(".", 1)[0], []).append(node_id)

    schema_version = artifact.get("schema_version", "unknown")
    graph_label = (
        f"Brewing calculator artifact (schema {schema_version}): "
        f"{len(nodes)} nodes, {len(relations)} relations"
    )
    lines = [
        "// Generated by tools/generate_artifact_dot.py from data/artifact.json. Do not edit.",
        "digraph artifact {",
        '  graph [rankdir="LR", splines="true", overlap="false", nodesep="0.35", '
        'ranksep="0.9", fontname="Helvetica", fontsize="14", bgcolor="white", '
        'compound="true"];',
        '  node [fontname="Helvetica", fontsize="9", margin="0.08,0.04"];',
        '  edge [fontname="Helvetica", fontsize="8", arrowsize="0.7", color="#546e7a"];',
        f"  label={dot_quote(graph_label)};",
        '  labelloc="t";',
        '  labeljust="l";',
    ]
    for namespace in sorted(namespaces):
        lines.extend(render_cluster(namespace, namespaces[namespace], nodes))
    lines.extend(render_identity_cluster(identities))
    lines.extend(render_relation_cluster(relations))
    lines.extend(render_edges(edges, relations))
    lines.append("}")
    return "\n".join(lines) + "\n", len(nodes), len(relations), len(edges)


def write_if_changed(path: Path, text: str) -> bool:
    if path.is_file() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def render_svg(dot_path: Path, svg_path: Path) -> bool:
    dot_binary = shutil.which("dot")
    if dot_binary is None:
        print("graphviz 'dot' not found; wrote the .dot file only", file=sys.stderr)
        return False
    svg_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([dot_binary, "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True)
    print(f"artifact svg: {svg_path}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--svg-out", type=Path)
    args = parser.parse_args()

    artifact = load_artifact(args.artifact)
    text, node_count, relation_count, edge_count = render_dot(artifact)
    changed = write_if_changed(args.out, text)
    state = "wrote" if changed else "unchanged"
    print(
        f"artifact dot: {state} {args.out} "
        f"({node_count} nodes, {relation_count} relations, {edge_count} edges)"
    )
    if args.svg_out is not None:
        render_svg(args.out, args.svg_out)


if __name__ == "__main__":
    main()
