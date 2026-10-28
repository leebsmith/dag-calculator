"""Render a report bundle with the vendored Typst templates.

The bundle is data; the template tree is code. Rendering copies the templates
into a temp root, writes the bundle beside them, and shells out to the pinned
Typst binary. No user-supplied path or Typst source reaches the compiler, and the
temp root is what confines the bundle.

Typst is deliberately not a Python dependency: this module expects the binary on
`PATH` (or `TYPST_BIN`) and checks its version against `templates/TYPST_VERSION`
on first use, so a mismatched toolchain fails loudly instead of typesetting a
different document.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.schemas.report_bundle import ReportBundle

TEMPLATES = Path(__file__).resolve().parents[1] / "templates"
PINNED_TYPST = (TEMPLATES / "TYPST_VERSION").read_text().strip()

FORMATS = ("pdf", "png")
PAPERS = ("auto", "a4", "letter")
DOC_KINDS = ("recipe",)

_TIMEOUT_S = 120


class ReportSpecError(ValueError):
    """The requested spec cannot be rendered; the route answers 422."""


class ReportRenderError(RuntimeError):
    """The renderer is unavailable or the template failed; the route answers 5xx."""

    def __init__(self, message: str, *, unavailable: bool = False) -> None:
        super().__init__(message)
        self.unavailable = unavailable


@dataclass(frozen=True)
class ReportSpec:
    """A validated render request."""

    doc_kind: str = "recipe"
    fmt: str = "pdf"
    sections: tuple[str, ...] = ()
    paper: str = "auto"
    page: int = 1

    @property
    def sections_input(self) -> str:
        """The `sections` input in the shape the template expects."""
        return ",".join(self.sections)


@dataclass(frozen=True)
class RenderedReport:
    """One rendered artifact plus the metadata a route exposes."""

    data: bytes
    media_type: str
    sections: tuple[str, ...]
    pages: int
    page: int
    key: str | None


def parse_spec(
    *,
    doc_kind: str = "recipe",
    fmt: str = "pdf",
    sections: str = "",
    paper: str = "auto",
    page: int = 1,
) -> ReportSpec:
    """Validate a raw spec. Unknown section ids are caught by the template."""
    if doc_kind not in DOC_KINDS:
        raise ReportSpecError(
            f"unknown doc_kind {doc_kind!r} (expected one of {', '.join(DOC_KINDS)})"
        )
    if fmt not in FORMATS:
        raise ReportSpecError(f"unknown format {fmt!r} (expected pdf or png)")
    if paper not in PAPERS:
        raise ReportSpecError(f"unknown paper {paper!r} (expected auto, a4 or letter)")
    if page < 1:
        raise ReportSpecError("page must be 1 or greater")
    requested = tuple(
        dict.fromkeys(part.strip() for part in sections.split(",") if part.strip())
    )
    return ReportSpec(
        doc_kind=doc_kind, fmt=fmt, sections=requested, paper=paper, page=page
    )


def render(bundle: ReportBundle, spec: ReportSpec) -> RenderedReport:
    """Compile one bundle. Raises :class:`ReportSpecError` for a 422-shaped input."""
    binary = _ready_typst()
    with tempfile.TemporaryDirectory(prefix="report-") as tmp:
        root = Path(tmp) / "report"
        shutil.copytree(TEMPLATES, root)
        (root / "report.json").write_text(
            json.dumps(bundle.model_dump(mode="json")), encoding="utf-8"
        )

        common = [
            "--root",
            str(root),
            "--font-path",
            str(root / "fonts"),
            "--ignore-system-fonts",
            "--input",
            "bundle=/report.json",
            "--input",
            f"sections={spec.sections_input}",
            "--input",
            f"paper={spec.paper}",
        ]
        if bundle.batch.frozen_at is not None:
            # A frozen bundle reprints byte-identically; a draft makes no claim.
            common += ["--creation-timestamp", str(int(bundle.batch.frozen_at))]

        meta = _metadata(binary, root, common)
        sections = tuple(meta.get("sections") or ())
        if not sections:
            raise ReportSpecError(
                "nothing to report: no requested section is present in this bundle"
            )
        pages = int(meta.get("pages") or 0)
        if pages < 1:
            raise ReportRenderError("renderer produced no pages")
        if spec.fmt == "png" and spec.page > pages:
            raise ReportSpecError(f"page {spec.page} is beyond the {pages}-page report")

        data, media_type = _compile(binary, root, common, spec)
        return RenderedReport(
            data=data,
            media_type=media_type,
            sections=sections,
            pages=pages,
            page=spec.page,
            # A preview embeds its compile time, so only a frozen bundle earns
            # an ETag (the same tag must mean the same representation).
            key=(
                _render_key(bundle, spec)
                if bundle.batch.frozen_at is not None
                else None
            ),
        )


def _metadata(
    binary: str, root: Path, common: list[str]
) -> dict[str, object]:
    completed = _run(
        [
            binary,
            "eval",
            "query(<report-meta>)",
            "--in",
            str(root / "report.typ"),
            *common,
        ]
    )
    try:
        payload = json.loads(completed.stdout)
        value = payload[0]["value"]
    except (IndexError, KeyError, TypeError, ValueError) as exc:
        raise ReportRenderError("renderer metadata is unreadable") from exc
    if not isinstance(value, dict):
        raise ReportRenderError("renderer metadata is not a map")
    return value


def _compile(
    binary: str, root: Path, common: list[str], spec: ReportSpec
) -> tuple[bytes, str]:
    if spec.fmt == "pdf":
        target = root / "report.pdf"
        _run(
            [
                binary,
                "compile",
                str(root / "report.typ"),
                str(target),
                "--format",
                "pdf",
                *common,
            ]
        )
        return target.read_bytes(), "application/pdf"

    target = root / "report.png"
    _run(
        [
            binary,
            "compile",
            str(root / "report.typ"),
            str(target),
            "--format",
            "png",
            "--pages",
            str(spec.page),
            *common,
        ]
    )
    return target.read_bytes(), "image/png"


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ReportRenderError(
            "typst is not installed; set TYPST_BIN or install the pinned version",
            unavailable=True,
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ReportRenderError("typst timed out") from exc

    if completed.returncode != 0:
        message = _failure_message(completed.stderr)
        if "report spec:" in completed.stderr:
            raise ReportSpecError(message)
        raise ReportRenderError(message)
    return completed


def _failure_message(stderr: str) -> str:
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    for line in lines:
        if "report spec:" in line:
            return line.split("report spec:", 1)[1].strip()
    for line in lines:
        if line.startswith("error:"):
            return line.removeprefix("error:").strip()
    return lines[0] if lines else "typst failed"


_ready: str | None = None


def _ready_typst() -> str:
    """Resolve the binary once and pin its version."""
    global _ready
    binary = os.environ.get("TYPST_BIN", "typst")
    if _ready == binary:
        return binary
    try:
        completed = subprocess.run(
            [binary, "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except FileNotFoundError as exc:
        raise ReportRenderError(
            "typst is not installed; set TYPST_BIN or install the pinned version",
            unavailable=True,
        ) from exc
    stdout = completed.stdout.strip()
    parts = stdout.split()
    # `typst 0.15.1 (9dfd3a08)` — the version is the second token.
    version = parts[1] if len(parts) >= 2 and parts[0] == "typst" else ""
    if completed.returncode != 0 or version != PINNED_TYPST:
        raise ReportRenderError(
            f"typst {version or 'unknown'} is not the pinned {PINNED_TYPST}",
            unavailable=True,
        )
    _ready = binary
    return binary


_templates_digest: str | None = None


def _templates_hash() -> str:
    """Hash the template tree once, so an edit changes the render key."""
    global _templates_digest
    if _templates_digest is None:
        digest = hashlib.sha256()
        for path in sorted(TEMPLATES.rglob("*")):
            if not path.is_file():
                continue
            digest.update(path.relative_to(TEMPLATES).as_posix().encode("utf-8"))
            digest.update(path.read_bytes())
        _templates_digest = digest.hexdigest()
    return _templates_digest


def _render_key(bundle: ReportBundle, spec: ReportSpec) -> str:
    """The ETag: bundle, template tree and spec, so any change revalidates."""
    material = "|".join(
        (
            bundle.content_hash,
            _templates_hash(),
            spec.doc_kind,
            spec.sections_input,
            spec.paper,
            spec.fmt,
            str(spec.page),
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]
