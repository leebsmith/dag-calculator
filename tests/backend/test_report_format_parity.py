"""Typst render gates: pinned version and byte-for-byte determinism.

Both need the `typst` binary, which is not a Python dependency
(plans/report-renderer.md §7.1). They skip loudly rather than fail on a machine
without it; CI and the image always have it.

Display formatting is no longer a Typst concern: the bundle carries the
pre-formatted strings (``formatted``), produced by the frontend formatter. The
generator only composes them.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / "backend" / "app" / "templates"
BUNDLE = ROOT / "tests" / "conformance" / "fixtures" / "report-bundle.json"

TYPST = shutil.which("typst")

pytestmark = pytest.mark.skipif(
    TYPST is None, reason="typst binary not installed; render gates skipped"
)


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


def test_typst_version_matches_the_pin() -> None:
    pinned = (TEMPLATES / "TYPST_VERSION").read_text().strip()
    reported = subprocess.run(
        [TYPST, "--version"], capture_output=True, text=True, timeout=30, check=True
    ).stdout.split()[1]
    assert reported == pinned, (
        f"typst {reported} != pinned {pinned}; layout would differ from the image"
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
