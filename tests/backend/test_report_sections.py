"""Render gates for report sections: presence, isolation, and lib access.

Typst is not a Python dependency (plans/report-renderer.md §7.1); these skip
loudly without the binary, like the formatting parity gate.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / "backend" / "app" / "templates"
BUNDLE = ROOT / "tests" / "conformance" / "fixtures" / "report-bundle.json"

TYPST = shutil.which("typst")

pytestmark = pytest.mark.skipif(
    TYPST is None, reason="typst binary not installed; render gates skipped"
)


def stage_root(tmp: Path, bundle: Path | dict[str, Any]) -> Path:
    """Reproduce the service's temp root: templates + report.json beside them."""
    root = tmp / "report"
    shutil.copytree(TEMPLATES, root)
    if isinstance(bundle, dict):
        (root / "report.json").write_text(json.dumps(bundle))
    else:
        shutil.copy(bundle, root / "report.json")
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


def probe(root: Path, source: str) -> Any:
    path = root / "probe.typ"
    path.write_text(source)
    completed = run_typst(["eval", "query(<probe>)", "--in", str(path)], root)
    payload = json.loads(completed.stdout)
    assert len(payload) == 1, "expected one <probe> metadata node"
    return payload[0]["value"]


def render(root: Path, sections: str | None = None, paper: str | None = None) -> None:
    argv = ["compile", "--input", "bundle=/report.json"]
    if sections is not None:
        argv += ["--input", f"sections={sections}"]
    if paper is not None:
        argv += ["--input", f"paper={paper}"]
    argv += [str(root / "report.typ"), str(root / "report.pdf")]
    run_typst(argv, root)


def page_size(root: Path, paper: str = "auto") -> tuple[float, float]:
    target = root / "page-{p}.svg"
    run_typst(
        [
            "compile",
            "--format",
            "svg",
            "--input",
            "bundle=/report.json",
            "--input",
            f"paper={paper}",
            str(root / "report.typ"),
            str(target),
        ],
        root,
    )
    head = (root / "page-1.svg").read_text()[:400]
    width = re.search(r'width="([0-9.]+)pt"', head)
    height = re.search(r'height="([0-9.]+)pt"', head)
    assert width and height, "SVG page box missing"
    return (round(float(width.group(1)), 1), round(float(height.group(1)), 1))


A4 = (595.3, 841.9)
US_LETTER = (612.0, 792.0)


def us_customary(bundle: dict[str, Any]) -> dict[str, Any]:
    nodes = bundle["catalog"]["nodes"]
    nodes["batch.v_ferm"].update(unit="gal", symbol="gal")
    nodes["solver.batch.m_grist"].update(unit="lb", symbol="lb")
    nodes["mash.strike_water_temp_c"].update(unit="degF", symbol="°F")
    return bundle


def fixture() -> dict[str, Any]:
    return json.loads(BUNDLE.read_text())


PRESENCE_PROBE = (
    '#import "sections/volume-ledger.typ": present-volume-ledger\n'
    "#metadata(present-volume-ledger()) <probe>\n"
)

BATCH_FACTS_PROBE = (
    '#import "sections/batch-facts.typ": present-batch-facts\n'
    "#metadata(present-batch-facts()) <probe>\n"
)

YEAST_PRESENCE_PROBE = (
    '#import "sections/yeast.typ": present-yeast\n'
    "#metadata(present-yeast()) <probe>\n"
)

# The two gates the yeast layout branches on: a non-zero derate earns the
# subtraction row, and a diastaticus-positive strain earns the warning.
YEAST_GATES_PROBE = (
    '#import "sections/yeast.typ": diastaticus, presents-derate\n'
    "#metadata((sta1: diastaticus(), derate: presents-derate())) <probe>\n"
)


def test_batch_facts_is_present_with_the_realized_values() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert probe(root, BATCH_FACTS_PROBE) is True


def test_batch_facts_is_absent_without_a_realized_fact() -> None:
    bundle = fixture()
    del bundle["formatted"]["solver.batch.apparent_attenuation"]

    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), bundle)
        assert probe(root, BATCH_FACTS_PROBE) is False
        render(root, "batch-facts")


def test_batch_facts_renders_alone_and_in_the_full_report() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)

        render(root, "batch-facts")
        assert (root / "report.pdf").stat().st_size > 0

        render(root)
        assert (root / "report.pdf").stat().st_size > 0


def test_grist_tables_are_present_and_optional() -> None:
    source = (
        '#import "lib/format.typ": present-formatted-table\n'
        "#metadata((\n"
        '  major: present-formatted-table("grist.major_malts"),\n'
        '  trace: present-formatted-table("grist.trace_malts"),\n'
        '  sugars: present-formatted-table("batch.sugars"),\n'
        ")) <probe>\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert probe(root, source) == {"major": True, "trace": True, "sugars": True}

    bundle = fixture()
    del bundle["formatted_tables"]["grist.major_malts"]
    del bundle["formatted_tables"]["batch.sugars"]
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), bundle)
        assert probe(root, source) == {"major": False, "trace": True, "sugars": False}
        render(root, "batch-facts")


def test_summaries_are_present_and_print_the_frozen_cells() -> None:
    source = (
        '#import "lib/format.typ": formatted-summary, present-formatted-summary\n'
        "#metadata((\n"
        '  major: present-formatted-summary("grist.major_malts"),\n'
        '  sugars: present-formatted-summary("batch.sugars"),\n'
        '  overall: present-formatted-summary("overall"),\n'
        '  color: formatted-summary("overall").at("color").at("text"),\n'
        '  yield: formatted-summary("overall").at("extract_yield").at("text"),\n'
        ")) <probe>\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert probe(root, source) == {
            "major": True,
            "sugars": True,
            "overall": True,
            "color": "31.7 °L",
            "yield": "77.6%",
        }

    bundle = fixture()
    del bundle["formatted_summaries"]["overall"]
    presence = (
        '#import "lib/format.typ": present-formatted-summary\n'
        "#metadata((\n"
        '  major: present-formatted-summary("grist.major_malts"),\n'
        '  overall: present-formatted-summary("overall"),\n'
        ")) <probe>\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), bundle)
        assert probe(root, presence) == {"major": True, "overall": False}
        render(root, "batch-facts")


def test_volume_ledger_is_present_with_the_cascade_and_equipment() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert probe(root, PRESENCE_PROBE) is True


def test_volume_ledger_is_absent_without_the_cascade_output() -> None:
    bundle = fixture()
    outputs = bundle["state"]["valuation"]["solver.batch"]
    for key in [key for key in outputs if key.startswith("cascade.")]:
        del outputs[key]
    for path in [path for path in bundle["formatted"] if path.startswith("solver.batch.cascade.")]:
        del bundle["formatted"][path]

    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), bundle)
        assert probe(root, PRESENCE_PROBE) is False
        render(root, "volume-ledger")


def test_identity_values_resolve_from_the_component_snapshot() -> None:
    source = (
        '#import "lib/format.typ": formatted-number, formatted-text\n'
        "#metadata((\n"
        '  full: formatted-text("equipment.mash_dead_space_l"),\n'
        '  number: formatted-number("equipment.mash_dead_space_l"),\n'
        ")) <probe>\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        resolved = probe(root, source)

    assert resolved == {"full": "0.5 L", "number": "0.5"}


def test_volume_ledger_renders_alone_and_in_the_full_report() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)

        render(root, "volume-ledger")
        assert (root / "report.pdf").stat().st_size > 0

        render(root)
        assert (root / "report.pdf").stat().st_size > 0


def test_paper_auto_follows_the_display_units() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        metric = stage_root(Path(tmp), BUNDLE)
        assert page_size(metric) == A4

    with tempfile.TemporaryDirectory() as tmp:
        customary = stage_root(Path(tmp), us_customary(fixture()))
        assert page_size(customary) == US_LETTER


def test_paper_spec_overrides_the_unit_default() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert page_size(root, "letter") == US_LETTER

    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), us_customary(fixture()))
        assert page_size(root, "a4") == A4


def test_unknown_paper_fails_loudly() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        with pytest.raises(AssertionError, match="unknown paper"):
            page_size(root, "legal")


def test_the_vendored_font_resolves_without_system_fonts() -> None:
    completed = subprocess.run(
        [
            TYPST,
            "fonts",
            "--ignore-system-fonts",
            "--font-path",
            str(TEMPLATES / "fonts"),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    assert "IBM Plex Sans" in completed.stdout


def test_yeast_is_present_with_a_selected_strain() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert probe(root, YEAST_PRESENCE_PROBE) is True


def test_yeast_is_absent_without_a_selected_strain() -> None:
    bundle = fixture()
    del bundle["formatted"]["batch.yeast.name"]

    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), bundle)
        assert probe(root, YEAST_PRESENCE_PROBE) is False
        render(root, "yeast")


def test_the_derate_row_and_the_warning_follow_the_state() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)
        assert probe(root, YEAST_GATES_PROBE) == {"sta1": True, "derate": True}

    bundle = fixture()
    bundle["state"]["valuation"]["batch.attenuation_derate_points"] = 0
    bundle["state"]["valuation"]["batch.yeast"]["sta1"] = False
    bundle["formatted"]["batch.attenuation_derate_points"] = {"text": "0.0 pts"}

    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), bundle)
        assert probe(root, YEAST_GATES_PROBE) == {"sta1": False, "derate": False}
        render(root, "yeast")


def test_yeast_renders_alone_and_in_the_full_report() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = stage_root(Path(tmp), BUNDLE)

        render(root, "yeast")
        assert (root / "report.pdf").stat().st_size > 0

        render(root)
        assert (root / "report.pdf").stat().st_size > 0
