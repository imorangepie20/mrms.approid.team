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


def preview_fixture(candidate_count=24):
    rows, members, old = [], [], []
    sections = [{'id': f'section-{d.slug}', 'slug': d.slug} for d in SECTION_DEFINITIONS]
    for section in sections:
        for rank in range(candidate_count):
            track_id = f"{section['slug']}-{rank}"
            rows.append({'id': track_id, 'tidal_id': track_id, 'isrc': track_id.upper(), 'title': track_id, 'artist': 'fixture'})
            members.append(EditorialMembership(section['slug'], track_id, track_id.upper(), rank, 'playlist-'+section['slug'], section['slug']))
            if rank < 12:
                old.append({'section_id': section['id'], 'track_id': track_id})
    db = Mock()
    db.execute.return_value.fetchall.return_value = rows
    return db, members, {'sections': sections, 'memberships': old}


def test_refresh_same_provider_candidates_selects_unfeatured_tracks_in_source_order():
    db, members, snapshot = preview_fixture()
    preview = editorial_refresh.build_preview(db, members, snapshot)
    assert preview['canApply']
    for section in preview['sections']:
        assert [t['id'] for t in section['tracks']] == [f"{section['slug']}-{i}" for i in range(12, 24)]
        assert [t['rank'] for t in section['tracks']] == list(range(12))
        assert section['addedCount'] == section['removedCount'] == 12
        assert all(t['sourcePlaylistId'] == 'playlist-'+section['slug'] for t in section['tracks'])
    assert all(not call.args[0].lstrip().startswith(('INSERT', 'UPDATE', 'DELETE')) for call in db.execute.call_args_list)


@pytest.mark.parametrize('candidate_count,expected_indices,added', [
    (15, [12, 13, 14, *range(9)], 3),
    (12, list(range(12)), 0),
    (6, list(range(6)), 0),
])
def test_refresh_fills_shortage_from_current_tracks_without_shuffling(candidate_count, expected_indices, added):
    db, members, snapshot = preview_fixture(candidate_count)
    preview = editorial_refresh.build_preview(db, members, snapshot)
    assert preview['canApply']
    for section in preview['sections']:
        assert [t['id'] for t in section['tracks']] == [f"{section['slug']}-{i}" for i in expected_indices]
        assert section['addedCount'] == added
        assert section['removedCount'] == added


def test_rotation_uses_resolved_isrc_id_and_avoids_tracks_current_in_other_sections():
    db, members, snapshot = preview_fixture()
    # A provider ID may differ from the EMS ID. Classify the resolved track as current.
    members[0] = EditorialMembership('new-releases', 'alternate-id', 'NEW-RELEASES-0', 0, 'playlist-new-releases', 'new-releases')
    snapshot['memberships'].append({'section_id': 'section-focus', 'track_id': 'new-releases-12'})
    # Same EMS track also qualifies for Jazz; it must only be selected once.
    members.append(EditorialMembership('seasonal-jazz', 'new-releases-13', 'NEW-RELEASES-13', -1, 'playlist-jazz', 'jazz'))
    preview = editorial_refresh.build_preview(db, members, snapshot)
    selected = [t['id'] for s in preview['sections'] for t in s['tracks']]
    new = preview['sections'][0]['tracks']
    assert new[0]['id'] == 'new-releases-13'
    assert new[-1]['id'] == 'new-releases-0'
    assert len(selected) == len(set(selected)) == 60


def test_cli_projection_retains_original_top_rank_selection():
    db, members, _ = preview_fixture()
    projected = project_editorial_sections(db, SECTION_DEFINITIONS, members)
    assert [str(track_id) for _, track_id in projected[0].joined] == [f'new-releases-{i}' for i in range(12)]
