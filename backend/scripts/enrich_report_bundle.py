"""Enrich a downloaded report bundle with prose blocks for the local Typst loop.

The service runs the same enrichment before it writes its temporary bundle. This
script is the local equivalent: it reads the downloaded bundle, injects the
markdown AST into the known prose cells, and writes the disposable copy beside
the templates.

    cd backend && uv run python scripts/enrich_report_bundle.py <in> <out>
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.prose import enrich_bundle


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.source.read_text(encoding="utf-8"))
    args.target.write_text(
        json.dumps(enrich_bundle(payload)), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
