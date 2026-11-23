"""Promotion decisions: additive, timestamp-guarded, and never destructive."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from scripts import promote_local_data as promote


def test_a_missing_production_document_is_created() -> None:
    assert promote.decide({"updated_at": 1.0}, None) == "create"


def test_a_newer_local_document_wins() -> None:
    assert promote.decide({"updated_at": 2.0}, {"updated_at": 1.0}) == "update"


def test_an_equal_or_newer_production_document_is_skipped() -> None:
    assert promote.decide({"updated_at": 1.0}, {"updated_at": 1.0}) == "skip"
    assert promote.decide({"updated_at": 1.0}, {"updated_at": 2.0}) == "skip"


def test_a_document_without_a_timestamp_is_create_only() -> None:
    assert promote.decide({"name": "local"}, {"name": "remote"}) == "skip"


def test_timestamps_accept_numbers_and_datetimes() -> None:
    moment = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)

    assert promote.timestamp_of({"updated_at": 5}) == 5.0
    assert promote.timestamp_of({"created_at": moment}) == moment.timestamp()
    assert promote.timestamp_of({"updated_at": 5, "created_at": moment}) == 5.0
    assert promote.timestamp_of({"body": "x"}) is None


def test_an_explicit_source_uid_is_used_as_given() -> None:
    assert promote.load_source_uid("uid-from-flag") == "uid-from-flag"


def test_apply_and_status_are_mutually_exclusive() -> None:
    with pytest.raises(SystemExit):
        promote.parse_args(["--target-email", "a@x.org", "--apply", "--status"])


def test_only_accepts_a_known_collection() -> None:
    options = promote.parse_args(["--target-email", "a@x.org", "--only", "batches"])

    assert options.only == "batches"
    with pytest.raises(SystemExit):
        promote.parse_args(["--target-email", "a@x.org", "--only", "nope"])


def test_an_explicit_target_uid_is_accepted() -> None:
    options = promote.parse_args(
        ["--target-email", "a@x.org", "--target-uid", "uid-from-session"]
    )

    assert options.target_uid == "uid-from-session"


def test_targeting_the_emulator_project_is_refused() -> None:
    with pytest.raises(SystemExit, match="emulator project"):
        promote.main(["--target-email", "a@x.org", "--target-project", promote.LOCAL_PROJECT])


def test_the_plan_never_proposes_a_delete() -> None:
    assert not hasattr(promote.Plan, "deletes")
    assert promote.Plan(collection="batches").pending == 0
