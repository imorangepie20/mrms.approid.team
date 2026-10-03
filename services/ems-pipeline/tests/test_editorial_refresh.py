from unittest.mock import Mock, patch

import pytest
import psycopg

from ems_pipeline import editorial_refresh
from ems_pipeline.editorial_sections import EditorialMembership, SECTION_DEFINITIONS
from ems_pipeline.editorial_sections import project_editorial_sections
from test_editorial_sections import RecordingConnection


def test_playable_projection_filters_latest_kr_stream_before_limit():
    db = RecordingConnection([])
    assert project_editorial_sections(db, SECTION_DEFINITIONS, [], playable_only=True)[0].joined == ()
    sql = db.statements[0]
    assert "a.region = 'KR'" in sql and "a.capability = 'STREAM'" in sql
    assert "ORDER BY a.observed_at DESC, a.id DESC LIMIT 1" in sql
    assert "latest.playable = true" in sql


def test_idle_queue_does_not_call_provider_or_write_memberships():
    db = Mock()
    db.execute.return_value.fetchone.return_value = None
    with patch.object(editorial_refresh, "TidalCatalogClient") as provider:
        assert not editorial_refresh.service_editorial_refresh(db)
    provider.assert_not_called()
    assert all('ems_track_sections' not in call.args[0] for call in db.execute.call_args_list)


def test_provider_failure_only_finishes_job_with_safe_code(monkeypatch):
    monkeypatch.setenv('TIDAL_CLIENT_ID', 'test')
    monkeypatch.setenv('TIDAL_CLIENT_SECRET', 'test')
    db = Mock()
    db.execute.return_value.fetchone.side_effect = [{'id': 'job'}, {'snapshot': {'sections': [], 'memberships': []}}]
    with patch.object(editorial_refresh, 'TidalCatalogClient', side_effect=ValueError('do not log credentials')):
        assert editorial_refresh.service_editorial_refresh(db)
    last = db.execute.call_args
    assert last.args[1] == ('valueerror', 'job')
    assert "status='failed'" in last.args[0]
    assert all(not call.args[0].lstrip().startswith('DELETE') for call in db.execute.call_args_list)


def test_database_error_reaches_reconnect_boundary():
    db = Mock()
    db.execute.return_value.fetchone.side_effect = [{'id': 'job'}, psycopg.OperationalError('connection lost')]
    with pytest.raises(psycopg.OperationalError):
        editorial_refresh.service_editorial_refresh(db)


def test_empty_discovery_blocks_all_sections_instead_of_removing_existing():
    db = RecordingConnection([])
    preview = editorial_refresh.build_preview(db, [], {'sections': [], 'memberships': []})
    assert not preview['canApply']
    assert len(preview['sections']) == 5
    assert all(section['tracks'] == [] for section in preview['sections'])
    assert db.transaction_count == 0
