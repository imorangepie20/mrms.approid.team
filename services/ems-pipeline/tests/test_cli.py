from ems_pipeline import cli


class FakeTransaction:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    def __enter__(self) -> "FakeTransaction":
        self.events.append("begin")
        return self

    def __exit__(self, *_: object) -> None:
        self.events.append("commit")


class FakeConnection:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.update: tuple[object, ...] | None = None

    def transaction(self) -> FakeTransaction:
        return FakeTransaction(self.events)

    def execute(self, _sql: str, values: tuple[object, ...]) -> None:
        self.update = values


def test_execute_run_commits_resolution_results_and_run_status() -> None:
    connection = FakeConnection()

    def fake_worker(*_args: object, **_kwargs: object) -> dict[str, int]:
        return {"matched": 2, "budget_exhausted": 0}

    counts, status = cli.execute_run(connection, "run-a", object(), fake_worker)

    assert counts["matched"] == 2
    assert status == "completed"
    assert connection.events == ["begin", "commit"]
    assert connection.update == ("completed", "run-a", "run-a")


def test_execute_run_pauses_bounded_canary() -> None:
    connection = FakeConnection()

    def fake_worker(*_args: object, **_kwargs: object) -> dict[str, int]:
        return {"matched": 0, "budget_exhausted": 0}

    _counts, status = cli.execute_run(connection, "run-b", object(), fake_worker, max_batches=1)

    assert status == "paused"
    assert connection.update == ("paused", "run-b", "run-b")


def test_parser_accepts_editorial_priority_for_bounded_run() -> None:
    args = cli.build_parser().parse_args([
        "run",
        "--run-id", "run-a",
        "--batch-size", "24",
        "--max-batches", "1",
        "--request-budget", "50",
        "--prioritize-editorial",
    ])

    assert args.prioritize_editorial is True
    assert args.batch_size == 24
    assert args.max_batches == 1
    assert args.request_budget == 50
    assert args.min_request_interval_seconds == 1.5


def test_parser_accepts_tidal_editorial_snapshot() -> None:
    args = cli.build_parser().parse_args([
        "select-tidal-editorial",
        "--snapshot-id", "tidal-editorial-20260922",
        "--work-root", "C:/data/tidal",
    ])

    assert args.command == "select-tidal-editorial"
    assert args.limit == 1000
    assert args.playlist_limit == 40


def test_parser_accepts_editorial_section_sync() -> None:
    args = cli.build_parser().parse_args([
        "sync-editorial-sections",
        "--dry-run",
        "--playlist-limit",
        "8",
    ])

    assert args.command == "sync-editorial-sections"
    assert args.dry_run is True
    assert args.playlist_limit == 8


def test_parser_accepts_bounded_audio_track_ids() -> None:
    args = cli.build_parser().parse_args([
        "analyze-audio",
        "--track-id", "11111111-1111-4111-8111-111111111111",
        "--track-id", "22222222-2222-4222-8222-222222222222",
        "--stage-limit", "2",
        "--max-batches", "2",
        "--request-budget", "5",
    ])

    assert args.track_id == [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
    ]


def test_parser_rejects_invalid_audio_track_id() -> None:
    try:
        cli.build_parser().parse_args(["analyze-audio", "--track-id", "not-a-uuid"])
    except SystemExit as error:
        assert error.code == 2
    else:
        raise AssertionError("invalid UUID must be rejected")
