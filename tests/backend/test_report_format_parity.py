"""Typst render gates: formatting parity with the frontend, and determinism.

Both need the `typst` binary, which is not a Python dependency
(plans/report-renderer.md §7.1). They skip loudly rather than fail on a machine
without it; CI and the image always have it.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / "backend" / "app" / "templates"
BUNDLE = ROOT / "tests" / "conformance" / "fixtures" / "report-bundle.json"
VECTOR = ROOT / "tests" / "conformance" / "fixtures" / "report-format-vector.json"

TYPST = shutil.which("typst")

pytestmark = pytest.mark.skipif(
    TYPST is None, reason="typst binary not installed; render gates skipped"
)


def _typst_literal(value: Any) -> str:
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def stage_root(tmp: Path) -> Path:
    """Reproduce the service's temp root: templates + report.json beside them."""
    root = tmp / "report"
    shutil.copytree(TEMPLATES, root)
    shutil.copy(BUNDLE, root / "report.json")
    return root


def run_typst(argv: list[str], root: Path) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [
            TYPST,
            *argv,
            "--root",
            str(root),
            "--font-path",
            str(root / "fonts"),
            "--ignore-system-fonts",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if completed.returncode != 0:
        raise AssertionError(f"typst {' '.join(argv)} failed:\n{completed.stderr}")
    return completed


def query(root: Path, source: str, label: str) -> Any:
    probe = root / "probe.typ"
    probe.write_text(source)
    result = run_typst(
        ["eval", f"query(<{label}>)", "--in", str(probe)],
        root,
    )
    payload = json.loads(result.stdout)
    assert len(payload) == 1, f"expected one <{label}> metadata node"
    return payload[0]["value"]


def test_typst_version_matches_the_pin() -> None:
    pinned = (TEMPLATES / "TYPST_VERSION").read_text().strip()
    reported = subprocess.run(
        [TYPST, "--version"], capture_output=True, text=True, timeout=30, check=True
    ).stdout.split()[1]
    assert reported == pinned, (
        f"typst {reported} != pinned {pinned}; layout would differ from the image"
    )


def test_display_strings_match_the_frontend_vector() -> None:
    vector = json.loads(VECTOR.read_text())
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp))

        path_calls = ",\n  ".join(
            f"({_typst_literal(item['path'])}, display({_typst_literal(item['path'])}))"
            for item in vector["paths"]
        )
        case_calls = ",\n  ".join(
            "format-value({value}, {dimension}, {unit}, {decimals}, {symbol})".format(
                value=_typst_literal(item["value"]),
                dimension=_typst_literal(item["dimension"]),
                unit=_typst_literal(item["unit"]),
                decimals=_typst_literal(item["decimals"]),
                symbol=_typst_literal(item["symbol"]),
            )
            for item in vector["cases"]
        )
        source = (
            '#import "lib/format.typ": display, format-value\n\n'
            f"#metadata((\n  paths: (\n  {path_calls}\n  ),\n"
            f"  cases: (\n  {case_calls}\n  ),\n)) <vector>\n"
        )
        rendered = query(root, source, "vector")

    assert [text for _, text in rendered["paths"]] == [
        item["display"] for item in vector["paths"]
    ], "Typst path display strings drifted from the frontend vector"
    assert rendered["cases"] == [item["display"] for item in vector["cases"]], (
        "Typst format-value drifted from the frontend vector"
    )


def test_the_bundle_renders_deterministically() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp))
        outputs = []
        for index in range(2):
            target = root / f"report-{index}.pdf"
            run_typst(
                [
                    "compile",
                    str(root / "report.typ"),
                    str(target),
                    "--input",
                    "bundle=/report.json",
                    "--creation-timestamp",
                    "1700000000",
                ],
                root,
            )
            outputs.append(target.read_bytes())

    assert outputs[0] == outputs[1], "two compiles of one bundle differ byte-for-byte"
