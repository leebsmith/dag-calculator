"""Verify the deployed revision's ALLOWED_EMAILS matches backend/allowlist.txt.

Run after `gcloud run deploy` so a config drift is a failed deploy rather than a
silent lockout (or, worse, a stale entry that keeps working). Reads the revision
that traffic actually points at, not the newest created one: after a traffic
rollback those differ.

Exit codes: 0 match, 1 mismatch (prints the rollback command), 2 inspection
failed.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ENV_NAME = "ALLOWED_EMAILS"
DEFAULT_PREVIOUS_FILE = Path(".local/deploy-previous-revision")


def parse_allowlist(text: str) -> set[str]:
    """Parse the allowlist file into normalized addresses."""
    emails: set[str] = set()
    for line in text.splitlines():
        entry = line.split("#", 1)[0].strip().lower()
        if entry:
            emails.add(entry)
    return emails


def split_env_value(value: str | None) -> set[str]:
    """Parse a comma/semicolon/space separated env value into normalized addresses."""
    if not value:
        return set()
    text = value
    for separator in (";", "\n", "\t", " "):
        text = text.replace(separator, ",")
    return {part.strip().lower() for part in text.split(",") if part.strip()}


def serving_revision(service: dict) -> str | None:
    """Return the revision carrying the most traffic."""
    traffic = (service.get("status") or {}).get("traffic") or []
    best: tuple[float, str] | None = None
    for entry in traffic:
        name = entry.get("revisionName")
        if not isinstance(name, str) or not name:
            continue
        percent = entry.get("percent", 0)
        weight = float(percent) if isinstance(percent, (int, float)) else 0.0
        if best is None or weight > best[0]:
            best = (weight, name)
    return best[1] if best else None


def env_value(revision: dict, name: str = ENV_NAME) -> str | None:
    """Return an environment variable's value from a revision description."""
    containers = ((revision.get("spec") or {}).get("containers") or [])
    for container in containers:
        for entry in container.get("env") or []:
            if entry.get("name") == name:
                value = entry.get("value")
                return value if isinstance(value, str) else None
    return None


def gcloud_json(args: list[str]) -> dict:
    completed = subprocess.run(
        ["gcloud", *args, "--format=json"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "gcloud failed")
    return json.loads(completed.stdout or "{}")


def previous_revision(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


def rollback_command(*, service: str, region: str, project: str, revision: str) -> str:
    return (
        f"gcloud run services update-traffic {service} "
        f"--region {region} --project {project} --to-revisions={revision}=100"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", default="backend/allowlist.txt")
    parser.add_argument("--service", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--previous-file", default=str(DEFAULT_PREVIOUS_FILE))
    parser.add_argument(
        "--print-serving",
        action="store_true",
        help="print the serving revision and exit (used before a deploy)",
    )
    options = parser.parse_args(argv)

    if options.print_serving:
        try:
            service = gcloud_json(
                [
                    "run",
                    "services",
                    "describe",
                    options.service,
                    "--region",
                    options.region,
                    "--project",
                    options.project,
                ]
            )
        except (RuntimeError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
            print(f"allowlist drift: cannot inspect the service: {exc}", file=sys.stderr)
            return 2
        revision_name = serving_revision(service)
        if revision_name is None:
            return 1
        print(revision_name)
        return 0

    try:
        expected = parse_allowlist(Path(options.file).read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"allowlist drift: cannot read {options.file}: {exc}", file=sys.stderr)
        return 2
    if not expected:
        print(f"allowlist drift: {options.file} has no addresses", file=sys.stderr)
        return 2

    try:
        service = gcloud_json(
            [
                "run",
                "services",
                "describe",
                options.service,
                "--region",
                options.region,
                "--project",
                options.project,
            ]
        )
        revision_name = serving_revision(service)
        if revision_name is None:
            print("allowlist drift: the service reports no serving revision", file=sys.stderr)
            return 2
        revision = gcloud_json(
            [
                "run",
                "revisions",
                "describe",
                revision_name,
                "--region",
                options.region,
                "--project",
                options.project,
            ]
        )
    except (RuntimeError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        print(f"allowlist drift: cannot inspect the service: {exc}", file=sys.stderr)
        return 2

    actual = split_env_value(env_value(revision))
    if expected == actual:
        print(f"allowlist drift: {revision_name} matches {options.file} ({len(expected)} address(es))")
        return 0

    print(
        f"allowlist drift: {revision_name} does not match {options.file}\n"
        f"  expected: {', '.join(sorted(expected)) or '(none)'}\n"
        f"  deployed: {', '.join(sorted(actual)) or '(none)'}",
        file=sys.stderr,
    )
    previous = previous_revision(Path(options.previous_file))
    if previous and previous != revision_name:
        print(
            "roll back with:\n  "
            + rollback_command(
                service=options.service,
                region=options.region,
                project=options.project,
                revision=previous,
            ),
            file=sys.stderr,
        )
    else:
        print("no previous revision recorded; redeploy with the file fixed", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
