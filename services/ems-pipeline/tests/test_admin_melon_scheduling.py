from __future__ import annotations

from unittest.mock import Mock, patch

import psycopg
import pytest

from ems_pipeline import admin_ingestion, melon
from ems_pipeline.tidal import CatalogRequestPaused


@pytest.mark.parametrize("error", [None, CatalogRequestPaused("paused"), ValueError("melon_access_blocked")])
def test_service_melon_runs_one_tick_and_isolates_provider_failures(error) -> None:
    db = Mock()
    db.execute.return_value.fetchone.return_value = {"id": "melon-job"}
    with patch.object(melon, "process_job", side_effect=error) as process, \
         patch.object(melon, "fail_job") as fail:
        assert admin_ingestion._service_melon_job(db)
    process.assert_called_once_with(db, "melon-job")
    if isinstance(error, ValueError):
        fail.assert_called_once_with(db, "melon-job", error)
    else:
        fail.assert_not_called()
    sql = db.execute.call_args.args[0]
    assert "status IN ('pending', 'running')" in sql
    assert "next_batch_at <= now()" in sql
    assert "next_tidal_retry_at <= now()" in sql


def test_no_eligible_melon_job_does_not_interrupt_tidal() -> None:
    db = Mock()
    db.execute.return_value.fetchone.return_value = None
    with patch.object(melon, "process_job") as process:
        assert not admin_ingestion._service_melon_job(db)
    process.assert_not_called()


def test_database_failure_reaches_existing_worker_reconnect_boundary() -> None:
    db = Mock()
    db.execute.return_value.fetchone.return_value = {"id": "melon-job"}
    with patch.object(melon, "process_job", side_effect=psycopg.OperationalError("test")), \
         patch.object(melon, "fail_job") as fail, pytest.raises(psycopg.OperationalError):
        admin_ingestion._service_melon_job(db)
    fail.assert_not_called()


def test_running_tidal_job_gives_melon_a_turn_between_candidates(monkeypatch) -> None:
    db = Mock()
    db.execute.return_value.fetchone.return_value = {"playlists": []}
    turns = []
    monkeypatch.setenv("TIDAL_CLIENT_ID", "test")
    monkeypatch.setenv("TIDAL_CLIENT_SECRET", "test")
    monkeypatch.setattr(admin_ingestion, "TidalCatalogClient", Mock())
    monkeypatch.setattr(admin_ingestion, "_job_status", Mock(side_effect=["running", "running", "completed"]))
    monkeypatch.setattr(admin_ingestion, "_wait_for_disk", Mock())
    monkeypatch.setattr(admin_ingestion, "_set_phase", Mock())
    monkeypatch.setattr(admin_ingestion, "_record_progress", Mock())
    monkeypatch.setattr(admin_ingestion, "service_editorial_refresh", lambda _: turns.append("editorial"))
    monkeypatch.setattr(admin_ingestion, "_service_melon_job", lambda _: turns.append("melon"))
    monkeypatch.setattr(admin_ingestion, "run_worker", lambda *args, **kwargs: (turns.append("tidal") or {"not_found": 1}))
    admin_ingestion.process_job(db, "tidal-job")
    assert turns == ["editorial", "melon", "tidal", "editorial", "melon", "tidal"]
