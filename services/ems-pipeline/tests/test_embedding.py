from ems_pipeline.embedding import build_embedding_text, embed_ems_batch


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, sql, values=None):
        self.calls.append((sql, values))
        if sql.lstrip().upper().startswith("SELECT"):
            return FakeResult(self.rows)
        return FakeResult([])


def test_build_embedding_text_keeps_only_catalog_metadata():
    assert build_embedding_text({"title": "Track", "artist": "Artist", "album": "Album"}) == "Track | Artist | Album"
    assert build_embedding_text({"title": "Track", "artist": "Artist", "album": None}) == "Track | Artist"


def test_embed_ems_batch_persists_completed_vectors_for_active_tracks():
    connection = FakeConnection([
        {"id": "track-a", "title": "Track A", "artist": "Artist A", "album": "Album A"},
        {"id": "track-b", "title": "Track B", "artist": "Artist B", "album": None},
    ])

    result = embed_ems_batch(
        connection,
        lambda texts: [[0.1] * 768 for _ in texts],
        limit=2,
    )

    assert result == {"embedded": 2, "remaining": 2}
    assert len(connection.calls) == 3
    assert "status = 'completed'" in connection.calls[1][0]
    assert connection.calls[1][1][0] == "track-a"
    assert connection.calls[2][1][0] == "track-b"
