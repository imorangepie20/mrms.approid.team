from __future__ import annotations

import inspect
from pathlib import Path
from typing import Any

import pytest

from ems_pipeline import lastfm, music_attributes, music_attributes_mb, source_routines

VERSION = "20261028-001500"


class Result:
    def __init__(self, row: dict[str, Any] | None) -> None:
        self.row = row

    def fetchone(self) -> dict[str, Any] | None:
        return self.row


class FakeConnection:
    def __init__(self, pending: int = 3) -> None:
        self.pending = pending
        self.statements: list[tuple[str, Any]] = []

    def execute(self, sql: str, params: Any = None) -> Result:
        self.statements.append((sql, params))
        if "source_key = 'musicbrainz_core'" in sql:
            return Result({"last_version": VERSION})
        if "AS count" in sql:
            return Result({"count": self.pending})
        return Result(None)

    def routine_updates(self) -> list[tuple[str, Any]]:
        return [(sql, params) for sql, params in self.statements if "UPDATE ems_source_routines" in sql]


class FakeClient:
    def download_derived(self, work_root: Path, version: str) -> Path:
        return work_root / "derived"


@pytest.fixture
def attribute_run(monkeypatch, tmp_path):
    calls: list[bool] = []
    monkeypatch.setattr(source_routines, "_available_disk", lambda *args: True)
    monkeypatch.setattr(source_routines, "_core_files", lambda work_root, version: work_root / "core")
    monkeypatch.setattr(music_attributes_mb, "collect_musicbrainz_attributes", lambda core, derived, version: {"scanned": 3})

    def fake_resolve(connection, only_stale=True):
        calls.append(only_stale)
        return {"resolved": 3}

    monkeypatch.setattr(music_attributes, "resolve_all", fake_resolve)

    def run(previous_version: str | None) -> FakeConnection:
        connection = FakeConnection()
        source_routines._check_music_attributes(
            connection, tmp_path, FakeClient(), {"source_key": "music_attributes", "last_version": previous_version}
        )
        return connection

    return run, calls


def test_new_core_snapshot_re_resolves_everything(attribute_run):
    run, calls = attribute_run
    connection = run("20261001-001500")
    assert calls == [False]
    assert any(params and VERSION in params for _, params in connection.routine_updates())


def test_first_run_without_previous_version_re_resolves_everything(attribute_run):
    run, calls = attribute_run
    run(None)
    assert calls == [False]


def test_same_core_snapshot_only_resolves_stale_rows(attribute_run):
    run, calls = attribute_run
    run(VERSION)
    assert calls == [True]


def test_collect_marks_rewritten_track_rows_stale():
    source = inspect.getsource(music_attributes_mb.collect_musicbrainz_attributes)
    assert "resolved_at = NULL" in source


def _run_lastfm(monkeypatch, fetched: dict[str, Any]) -> FakeConnection:
    monkeypatch.setenv("LASTFM_API_KEY", "secret-key-123")
    monkeypatch.setattr(lastfm, "fetch_lastfm_artist_tags", lambda: fetched)
    monkeypatch.setattr(music_attributes, "resolve_all", lambda connection, only_stale=True: {"resolved": 0})
    connection = FakeConnection()
    source_routines._check_lastfm_artist_tags(connection)
    return connection


@pytest.mark.parametrize(
    ("stopped", "code"), [("key_invalid", "lastfm_key_invalid"), ("consecutive_failures", "lastfm_unavailable")]
)
def test_lastfm_breaker_records_key_free_error_code(monkeypatch, capsys, stopped, code):
    fetched = {"requested": 2, "ok": 1, "not_found": 0, "failed": 1, "stopped_reason": stopped}
    connection = _run_lastfm(monkeypatch, fetched)
    sql, params = connection.routine_updates()[-1]
    assert "status = 'failed'" in sql and params[0] == code
    output = capsys.readouterr().out
    assert code in output and "secret-key-123" not in output


@pytest.mark.parametrize("stopped", [None, "time_budget"])
def test_lastfm_finished_or_budgeted_run_marks_success(monkeypatch, stopped):
    fetched = {"requested": 5, "ok": 5, "not_found": 0, "failed": 0, "stopped_reason": stopped}
    connection = _run_lastfm(monkeypatch, fetched)
    sql, params = connection.routine_updates()[-1]
    assert "last_success_at = now()" in sql and "error_code = NULL" in sql
