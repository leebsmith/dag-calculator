"""Copy the local emulator's user data into the production project.

Promotion is one-way and additive: documents are written under the target
user's uid, updates are last-write-wins on stored timestamps, and a document
that exists only in production is never deleted. Dry-run by default; ``--apply``
writes. The target uid is resolved by email at run time — uids are opaque and
project-scoped, so they are never configured or guessed.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from firebase_admin import auth, initialize_app
from google.auth.exceptions import DefaultCredentialsError
from google.cloud import firestore

COLLECTIONS = (
    "batches",
    "report_bundles",
    "brew_sessions",
    "catalog_items",
    "recipe_imports",
)
TIMESTAMP_FIELDS = ("updated_at", "created_at")

LOCAL_PROJECT = "demo-local"
DEFAULT_TARGET_PROJECT = "dag-calculator"
DEFAULT_SOURCE_HOST = "127.0.0.1:8080"
EMULATOR_HOST_ENV = "FIRESTORE_EMULATOR_HOST"

REPO_ROOT = Path(__file__).resolve().parents[2]
AUTH_EXPORT = REPO_ROOT / "emulator-data" / "auth_export" / "accounts.json"
USERS = "users"


@dataclass
class Plan:
    """One collection's pending promotion."""

    collection: str
    creates: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    updates: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    skipped: int = 0
    remote_only: int = 0
    newest: float | None = None

    @property
    def pending(self) -> int:
        return len(self.creates) + len(self.updates)


def load_source_uid(override: str | None) -> str:
    """The emulator's Google account uid, from the auth export or an override."""
    if override:
        return override
    if not AUTH_EXPORT.exists():
        raise SystemExit(
            f"promote: no auth export at {AUTH_EXPORT.relative_to(REPO_ROOT)}; "
            "run make save-data first or pass --source-uid"
        )
    payload = json.loads(AUTH_EXPORT.read_text(encoding="utf-8"))
    candidates: list[tuple[str, str]] = []
    for user in payload.get("users", []):
        providers = user.get("providerUserInfo") or []
        if any(provider.get("providerId") == "google.com" for provider in providers):
            candidates.append((str(user.get("email", "")), str(user.get("localId", ""))))
    if len(candidates) == 1:
        return candidates[0][1]
    listing = ", ".join(f"{email}={uid}" for email, uid in candidates) or "(none)"
    raise SystemExit(
        "promote: the auth export does not name a single Google account "
        f"({listing}); pass --source-uid"
    )


def timestamp_of(data: dict[str, Any]) -> float | None:
    """The record's comparable timestamp, or None when it carries none."""
    for name in TIMESTAMP_FIELDS:
        value = data.get(name)
        if isinstance(value, datetime):
            return value.timestamp()
        if isinstance(value, (int, float)):
            return float(value)
    return None


def decide(local: dict[str, Any], remote: dict[str, Any] | None) -> str:
    """Return create, update, or skip for one document."""
    if remote is None:
        return "create"
    local_stamp = timestamp_of(local)
    remote_stamp = timestamp_of(remote)
    if local_stamp is None or remote_stamp is None:
        return "skip"
    return "update" if local_stamp > remote_stamp else "skip"


def plan_collection(
    collection: str, source: Any, target: Any
) -> Plan:
    """Compare one collection between the emulator and production."""
    plan = Plan(collection=collection)
    remote_ids: set[str] = set()
    for document in source.stream():
        data = document.to_dict() or {}
        remote_snapshot = target.document(document.id).get()
        action = decide(data, remote_snapshot.to_dict() if remote_snapshot.exists else None)
        if action == "create":
            plan.creates.append((document.id, data))
        elif action == "update":
            plan.updates.append((document.id, data))
        else:
            plan.skipped += 1
        if remote_snapshot.exists:
            remote_ids.add(document.id)
        stamp = timestamp_of(data)
        if action != "skip" and stamp is not None:
            plan.newest = stamp if plan.newest is None else max(plan.newest, stamp)
    for document in target.stream():
        if document.id not in remote_ids:
            plan.remote_only += 1
    return plan


def apply_plan(plan: Plan, target: Any) -> None:
    """Write a plan's documents; never deletes."""
    for document_id, data in plan.creates + plan.updates:
        target.document(document_id).set(data)


def record_state(db: Any, *, source_uid: str, target_uid: str, plans: list[Plan]) -> None:
    """Write the single global audit document for this run."""
    db.collection("meta").document("promote_state").set(
        {
            "ran_at": datetime.now().astimezone(),
            "source_uid": source_uid,
            "target_uid": target_uid,
            "counts": {plan.collection: plan.pending for plan in plans},
        }
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-email", required=True)
    parser.add_argument("--target-uid", help="the production uid, when the Auth lookup is unavailable")
    parser.add_argument("--source-uid")
    parser.add_argument("--source-host", default=DEFAULT_SOURCE_HOST)
    parser.add_argument("--target-project", default=DEFAULT_TARGET_PROJECT)
    parser.add_argument("--only", choices=COLLECTIONS)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--status", action="store_true")
    options = parser.parse_args(argv)
    if options.apply and options.status:
        parser.error("--apply and --status are mutually exclusive")
    return options


def target_uid_for(email: str, project: str) -> str:
    """Resolve the production uid by email, refusing to invent an account."""
    try:
        initialize_app(options={"projectId": project})
        return auth.get_user_by_email(email).uid
    except auth.UserNotFoundError:
        raise SystemExit(
            f"promote: {email} has no account in {project}; sign in to production "
            "once, then retry"
        ) from None
    except DefaultCredentialsError:
        raise SystemExit(
            "promote: no application default credentials; run "
            "gcloud auth application-default login"
        ) from None
    except auth.InsufficientPermissionError:
        raise SystemExit(
            "promote: the current credentials cannot read Firebase Auth users; "
            "sign in to production and pass TARGET_UID=<uid from /session>"
        ) from None


def ensure_source_reachable(source: Any, host: str) -> None:
    """Fail clearly when the emulator is not running."""
    try:
        next(iter(source.collections()), None)
    except Exception:  # noqa: BLE001 — any transport failure means the same thing
        raise SystemExit(
            f"promote: the emulator at {host} is not reachable; start make local-dev first"
        ) from None


def main(argv: list[str] | None = None) -> int:
    options = parse_args(argv)
    if options.status:
        options.apply = False
    if options.target_project == LOCAL_PROJECT:
        raise SystemExit("promote: refusing to target the emulator project")

    source_uid = load_source_uid(options.source_uid)

    os.environ[EMULATOR_HOST_ENV] = options.source_host
    source_client = firestore.Client(project=LOCAL_PROJECT)
    os.environ.pop(EMULATOR_HOST_ENV, None)
    ensure_source_reachable(source_client, options.source_host)

    target_uid = options.target_uid or target_uid_for(options.target_email, options.target_project)
    if target_uid == source_uid:
        raise SystemExit("promote: the source and target uids are identical; refusing to copy")
    target_client = firestore.Client(project=options.target_project)

    chosen = (options.only,) if options.only else COLLECTIONS
    source_root = source_client.collection(USERS).document(source_uid)
    target_root = target_client.collection(USERS).document(target_uid)

    plans = [
        plan_collection(
            collection,
            source_root.collection(collection),
            target_root.collection(collection),
        )
        for collection in chosen
    ]

    for plan in plans:
        print(
            f"  {plan.collection:<16} create {len(plan.creates):>3}  "
            f"update {len(plan.updates):>3}  skip {plan.skipped:>3}  "
            f"prod-only {plan.remote_only:>3}"
        )

    pending = sum(plan.pending for plan in plans)
    if options.status:
        newest = [plan.newest for plan in plans if plan.newest is not None]
        stamp = (
            datetime.fromtimestamp(max(newest)).isoformat(timespec="seconds")
            if newest
            else "none"
        )
        print(f"promote-status: {pending} un-promoted document(s); newest {stamp}")
        return 0

    if not options.apply:
        print(f"promote: dry run — {pending} document(s) would be written; re-run with APPLY=1")
        return 0

    for plan in plans:
        apply_plan(plan, target_root.collection(plan.collection))
    record_state(target_client, source_uid=source_uid, target_uid=target_uid, plans=plans)
    print(f"promote: wrote {pending} document(s) to {options.target_project}/{target_uid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
