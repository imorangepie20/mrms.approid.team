from ems_pipeline.worker import HealthGate, claim_candidates, retry_delay


class FakeCursor:
    def __init__(self) -> None:
        self.sql = ""
        self.values = None

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, values: object = None) -> None:
        self.sql = sql
        self.values = values

    def fetchall(self) -> list[dict[str, str]]:
        return [{"id": "candidate-a"}]


class FakeTransaction:
    def __enter__(self) -> "FakeTransaction":
        return self

    def __exit__(self, *_: object) -> None:
        return None


class FakeConnection:
    def __init__(self) -> None:
        self.cursor_value = FakeCursor()

    def transaction(self) -> FakeTransaction:
        return FakeTransaction()

    def cursor(self) -> FakeCursor:
        return self.cursor_value


def test_claim_candidates_uses_skip_locked_and_expired_leases() -> None:
    connection = FakeConnection()
    claimed = claim_candidates(connection, "run-a", batch_size=16)

    assert claimed == [{"id": "candidate-a"}]
    assert "FOR UPDATE SKIP LOCKED" in connection.cursor_value.sql
    assert "lease_expires_at" in connection.cursor_value.sql
    assert connection.cursor_value.values == ("run-a", 16, 300)


def test_health_gate_pauses_when_disk_or_dependency_is_unhealthy() -> None:
    gate = HealthGate(max_disk_used_percent=70)
    assert gate.can_run(disk_used_percent=69, database_ready=True, embedding_ready=True)
    assert not gate.can_run(disk_used_percent=70, database_ready=True, embedding_ready=True)
    assert not gate.can_run(disk_used_percent=10, database_ready=False, embedding_ready=True)
    assert not gate.can_run(disk_used_percent=10, database_ready=True, embedding_ready=False)


def test_retry_delay_prefers_retry_after_and_caps_exponential_backoff() -> None:
    assert retry_delay(attempt=4, retry_after_seconds=7) == 7
    assert retry_delay(attempt=20, retry_after_seconds=None) == 3600
