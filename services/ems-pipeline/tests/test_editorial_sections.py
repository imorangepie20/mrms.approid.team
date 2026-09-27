import pytest

from ems_pipeline.editorial_sections import (
    SECTION_DEFINITIONS,
    EditorialSectionSyncGateError,
    EditorialMembership,
    discover_editorial_memberships,
    rank_section_tracks,
    sync_editorial_sections,
    sync_editorial_sections_guarded,
)
from ems_pipeline.tidal_popularity import EditorialRequestBudgetExceeded
from ems_pipeline.tidal_popularity import (
    EditorialPlaylist,
    EditorialTrack,
    resolve_next_page_url,
)


class RecordingTransaction:
    def __init__(self, connection: "RecordingConnection") -> None:
        self.connection = connection

    def __enter__(self) -> "RecordingTransaction":
        self.connection.transaction_count += 1
        self.connection.transaction_events.append("begin")
        return self

    def __exit__(self, exc_type: object, *_: object) -> None:
        self.connection.transaction_events.append(
            "rollback" if exc_type is not None else "commit"
        )
        return None


class RecordingResult:
    def __init__(self, rows: list[dict[str, str]]) -> None:
        self.rows = rows

    def fetchall(self) -> list[dict[str, str]]:
        return self.rows

    def fetchone(self) -> dict[str, str]:
        return {"id": "section-a"}


class RecordingConnection:
    def __init__(self, track_rows: list[dict[str, str]]) -> None:
        self.track_rows = track_rows
        self.statements: list[str] = []
        self.values: list[object] = []
        self.transaction_count = 0
        self.transaction_events: list[str] = []

    def transaction(self) -> RecordingTransaction:
        return RecordingTransaction(self)

    def execute(self, sql: str, values: object = None) -> RecordingResult:
        self.statements.append(sql)
        self.values.append(values)
        if sql.lstrip().upper().startswith("SELECT ID, TIDAL_ID"):
            return RecordingResult(self.track_rows)
        return RecordingResult([])


class FailingWriteConnection(RecordingConnection):
    def __init__(
        self,
        track_rows: list[dict[str, str]],
        *,
        fail_after_membership_inserts: int,
    ) -> None:
        super().__init__(track_rows)
        self.fail_after_membership_inserts = fail_after_membership_inserts
        self.membership_inserts = 0

    def execute(self, sql: str, values: object = None) -> RecordingResult:
        result = super().execute(sql, values)
        if "INSERT INTO ems_track_sections" in sql:
            self.membership_inserts += 1
            if self.membership_inserts > self.fail_after_membership_inserts:
                raise RuntimeError("simulated membership write failure")
        return result


def test_definitions_keep_approved_copy_and_order() -> None:
    assert [(item.slug, item.title) for item in SECTION_DEFINITIONS] == [
        ("new-releases", "신곡 퍼레이드"),
        ("seasonal-jazz", "시원한 가을 바람과 함께, 재즈"),
        ("night-rnb", "도시의 밤을 채우는 R&B"),
        ("feel-good", "기분 좋은 리듬이 필요할 때"),
        ("focus", "잠깐, 음악에만 집중"),
    ]


def test_rank_section_tracks_deduplicates_isrc_and_keeps_provenance() -> None:
    memberships = rank_section_tracks(
        "night-rnb",
        [
            EditorialTrack("tidal-low", "ISRC-A", "Song", "Artist", "Album", 180000, 0.4, 100),
            EditorialTrack("tidal-high", "isrc-a", "Song", "Artist", "Album", 180000, 0.9, 1000),
        ],
        playlist_id="playlist-a",
        playlist_name="R&B Hits",
    )

    assert memberships == [
        EditorialMembership(
            section_slug="night-rnb",
            tidal_id="tidal-high",
            isrc="ISRC-A",
            rank=0,
            source_playlist_id="playlist-a",
            source_playlist_name="R&B Hits",
        )
    ]


def test_pagination_rejects_external_repeated_and_oversized_sequences() -> None:
    with pytest.raises(ValueError, match="origin"):
        resolve_next_page_url(
            "https://openapi.tidal.com/v2",
            "https://evil.test/steal",
            set(),
            page_count=1,
        )


def test_discovery_prefers_recent_new_editorial_and_playlist_position(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old = EditorialPlaylist(
        "old",
        "Best New Tracks Archive",
        100_000,
        updated_at="2026-08-01T00:00:00Z",
    )
    recent = EditorialPlaylist(
        "recent",
        "Best New Tracks",
        100,
        updated_at="2026-09-22T00:00:00Z",
    )

    def fake_playlists(_client: object, _token: str, queries: tuple[str, ...]):
        return [old, recent] if queries == SECTION_DEFINITIONS[0].queries else []

    def fake_tracks(_client: object, _token: str, playlist: EditorialPlaylist, **_kwargs: object):
        if playlist.playlist_id == "old":
            return [
                EditorialTrack(
                    "old-a", "ISRC-A", "A", "Artist", "Album", 180000,
                    1.0, playlist.followers, playlist_position=0,
                )
            ]
        return [
            EditorialTrack(
                "recent-a", "ISRC-A", "A", "Artist", "Album", 180000,
                0.8, playlist.followers, playlist_position=5,
            ),
            EditorialTrack(
                "recent-b", "ISRC-B", "B", "Artist", "Album", 180000,
                0.8, playlist.followers, playlist_position=0,
            ),
        ]

    monkeypatch.setattr(
        "ems_pipeline.editorial_sections.fetch_editorial_playlists",
        fake_playlists,
    )
    monkeypatch.setattr(
        "ems_pipeline.editorial_sections.fetch_playlist_tracks",
        fake_tracks,
    )

    memberships = discover_editorial_memberships(object(), "token")
    new_releases = [
        item for item in memberships if item.section_slug == "new-releases"
    ]

    assert [item.tidal_id for item in new_releases] == ["recent-b", "recent-a"]
    assert {item.source_playlist_id for item in new_releases} == {"recent"}


def test_discovery_returns_collected_sections_when_request_budget_is_exhausted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "ems_pipeline.editorial_sections.fetch_editorial_playlists",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            EditorialRequestBudgetExceeded("editorial request budget exhausted")
        ),
    )

    assert discover_editorial_memberships(object(), "token") == []


def test_sync_replaces_one_section_atomically_and_matches_tidal_id_before_isrc() -> None:
    connection = RecordingConnection(
        track_rows=[
            {"id": "track-a", "tidal_id": "tidal-a", "isrc": "ISRC-A"},
        ]
    )

    result = sync_editorial_sections(
        connection,
        SECTION_DEFINITIONS[:1],
        [
            EditorialMembership(
                "new-releases",
                "tidal-a",
                "ISRC-A",
                0,
                "playlist-a",
                "Best New Tracks",
            ),
        ],
        dry_run=False,
    )

    sql = "\n".join(connection.statements)
    assert "INSERT INTO ems_editorial_sections" in sql
    assert "DELETE FROM ems_track_sections" in sql
    assert "INSERT INTO ems_track_sections" in sql
    assert connection.transaction_count == 1
    assert result["new-releases"].stored == 1


def test_sync_caps_joined_and_stored_memberships_at_twelve_tracks() -> None:
    track_rows = [
        {"id": f"track-{index}", "tidal_id": f"tidal-{index}", "isrc": f"ISRC-{index}"}
        for index in range(13)
    ]
    memberships = [
        EditorialMembership(
            "new-releases",
            f"tidal-{index}",
            f"ISRC-{index}",
            index,
            "playlist-a",
            "Best New Tracks",
        )
        for index in reversed(range(13))
    ]
    connection = RecordingConnection(track_rows=track_rows)

    result = sync_editorial_sections(
        connection,
        SECTION_DEFINITIONS[:1],
        memberships,
        dry_run=False,
    )

    membership_inserts = [
        statement
        for statement in connection.statements
        if "INSERT INTO ems_track_sections" in statement
    ]
    assert result["new-releases"].discovered == 13
    assert result["new-releases"].joined == 12
    assert result["new-releases"].stored == 12
    assert len(membership_inserts) == 12
    stored_ranks = [
        values[2]
        for statement, values in zip(connection.statements, connection.values, strict=True)
        if "INSERT INTO ems_track_sections" in statement
    ]
    assert stored_ranks == list(range(12))


def test_dry_run_applies_global_dedupe_before_each_section_limit() -> None:
    track_rows = [
        {"id": f"track-{index}", "tidal_id": f"tidal-{index}", "isrc": f"ISRC-{index}"}
        for index in range(18)
    ]
    memberships = [
        EditorialMembership(
            "new-releases",
            f"tidal-{index}",
            f"ISRC-{index}",
            index,
            "playlist-new",
            "Best New Tracks",
        )
        for index in range(12)
    ] + [
        EditorialMembership(
            "seasonal-jazz",
            f"tidal-{index}",
            f"ISRC-{index}",
            index,
            "playlist-jazz",
            "Jazz",
        )
        for index in range(18)
    ]
    connection = RecordingConnection(track_rows)

    result = sync_editorial_sections_guarded(
        connection,
        SECTION_DEFINITIONS[:2],
        memberships,
        dry_run=True,
    )

    assert (
        result["new-releases"].discovered,
        result["new-releases"].joined,
        result["new-releases"].stored,
    ) == (12, 12, 0)
    assert (
        result["seasonal-jazz"].discovered,
        result["seasonal-jazz"].joined,
        result["seasonal-jazz"].stored,
    ) == (18, 6, 0)
    assert connection.transaction_count == 0


def test_guarded_sync_rejects_insufficient_sections_before_any_write() -> None:
    connection = RecordingConnection(
        track_rows=[
            {"id": "track-a", "tidal_id": "tidal-a", "isrc": "ISRC-A"},
        ]
    )

    with pytest.raises(EditorialSectionSyncGateError, match="ready_sections=0"):
        sync_editorial_sections_guarded(
            connection,
            SECTION_DEFINITIONS,
            [
                EditorialMembership(
                    "new-releases",
                    "tidal-a",
                    "ISRC-A",
                    0,
                    "playlist-a",
                    "Best New Tracks",
                ),
            ],
            dry_run=False,
        )

    assert not any(
        statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
        for statement in connection.statements
    )


def test_guarded_sync_rolls_back_all_sections_after_mid_write_failure() -> None:
    definitions = SECTION_DEFINITIONS[:4]
    track_rows: list[dict[str, str]] = []
    memberships: list[EditorialMembership] = []
    for section_index, definition in enumerate(definitions):
        for rank in range(6):
            index = section_index * 6 + rank
            track_rows.append(
                {
                    "id": f"track-{index}",
                    "tidal_id": f"tidal-{index}",
                    "isrc": f"ISRC-{index}",
                }
            )
            memberships.append(
                EditorialMembership(
                    definition.slug,
                    f"tidal-{index}",
                    f"ISRC-{index}",
                    rank,
                    f"playlist-{section_index}",
                    definition.title,
                )
            )
    connection = FailingWriteConnection(
        track_rows,
        fail_after_membership_inserts=6,
    )

    with pytest.raises(RuntimeError, match="simulated membership write failure"):
        sync_editorial_sections_guarded(
            connection,
            definitions,
            memberships,
            dry_run=False,
        )

    assert connection.transaction_count == 1
    assert connection.transaction_events == ["begin", "rollback"]


def test_sync_dry_run_performs_no_write() -> None:
    connection = RecordingConnection(track_rows=[])

    sync_editorial_sections(connection, SECTION_DEFINITIONS, [], dry_run=True)

    assert not any(
        statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
        for statement in connection.statements
    )
