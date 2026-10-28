"""Only the bundle service may construct a report bundle.

`schemas/report_bundle.py` validates transport shape and the canonical hash;
`services/bundle_integrity.py` adds the twelve cross-reference checks. A seam that
reaches for `ReportBundle.model_validate` or `ReportBundle(...)` directly skips
those checks, so the checked constructors are pinned here.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "backend" / "app"
OWNER = APP / "services" / "bundle_integrity.py"

BYPASS = re.compile(
    r"\bReportBundle\s*(?:\.\s*(?:model_validate|model_validate_json|model_construct)|(?=\())"
)
DEFINITION = re.compile(r"^\s*class\s+ReportBundle\b")


def test_only_the_integrity_service_constructs_a_bundle() -> None:
    offenders = []
    for path in sorted(APP.rglob("*.py")):
        if path == OWNER:
            continue
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if line.lstrip().startswith("#") or DEFINITION.match(line):
                continue
            if BYPASS.search(line):
                offenders.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    assert offenders == [], (
        "construct a report bundle through services.bundle_integrity.parse_bundle / "
        "seal_bundle so the cross-reference checks run:\n" + "\n".join(offenders)
    )
