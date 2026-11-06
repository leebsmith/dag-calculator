"""Delete committed import receipts whose batch no longer exists.

A committed receipt exists so the same document is not read twice. The batch
delete path removes it, but records deleted before that cascade existed, or a
partially failed delete, can leave one behind. Dry-run by default:

    cd backend && uv run python scripts/reconcile_import_receipts.py
    cd backend && uv run python scripts/reconcile_import_receipts.py --delete

With ``FIRESTORE_EMULATOR_HOST`` set the script targets the emulator; otherwise
it uses the configured Firebase project.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

SCAN_LIMIT = 10_000


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--delete",
        action="store_true",
        help="delete the orphaned receipts; without it the script only reports",
    )
    parser.add_argument("--uid", help="restrict the scan to one user")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    from app.database.firestore import get_db
    from app.repositories.batch_repo import BatchRepository
    from app.repositories.import_repo import ImportRepository
    from app.services.import_service import orphaned_receipts

    args = parse_args(argv)
    db = get_db()
    imports_repo = ImportRepository(db)
    batch_repo = BatchRepository(db)

    if args.uid:
        uids = [args.uid]
    else:
        uids = [doc.id for doc in db.collection("users").stream()]

    report: dict[str, Any] = {
        "users": len(uids),
        "scanned": 0,
        "orphans": [],
        "deleted": 0,
        "applied": args.delete,
    }

    for uid in uids:
        records = imports_repo.list(uid, limit=SCAN_LIMIT)
        batch_ids = {record["id"] for record in batch_repo.list_batches(uid)}
        orphans = orphaned_receipts(records, batch_ids)
        report["scanned"] += len(records)
        for record in orphans:
            report["orphans"].append(
                {
                    "uid": uid,
                    "import_id": record["id"],
                    "batch_id": record.get("batch_id"),
                    "filename": record.get("extract", {}).get("source", {}).get("filename"),
                }
            )
            if args.delete:
                imports_repo.delete(uid, record["id"])
                report["deleted"] += 1

    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
