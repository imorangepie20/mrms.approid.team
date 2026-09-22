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
    assert connection.update == ("completed", 2, "run-a")
