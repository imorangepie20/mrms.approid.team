from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from .importer import ManifestImporter, stage_candidates
from .select import Candidate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ems-pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    download = subparsers.add_parser("download")
    download.add_argument("--work-root", type=Path, default=None)
    canonical = subparsers.add_parser("download-canonical")
    canonical.add_argument("--work-root", type=Path, default=None)
    select = subparsers.add_parser("select")
    select.add_argument("--snapshot-id", required=True)
    select.add_argument("--work-root", type=Path, default=None)
    select.add_argument("--limit", type=int, default=1000)
    stage = subparsers.add_parser("stage")
    stage.add_argument("--manifest", type=Path, required=True)
    stage.add_argument("--candidates", type=Path, required=True)
    stage.add_argument("--run-id", default=None)
    stage.add_argument("--request-budget", type=int, default=1000)
    run = subparsers.add_parser("run")
    run.add_argument("--run-id", required=True)
    run.add_argument("--batch-size", type=int, default=50)
    run.add_argument("--max-batches", type=int, default=None)
    run.add_argument("--request-budget", type=int, default=None)
    return parser


def execute_run(
    connection: Any,
    run_id: str,
    catalog_client: Any,
    worker: Callable[..., dict[str, int]],
    *,
    batch_size: int = 50,
    max_batches: int | None = None,
) -> tuple[dict[str, int], str]:
    with connection.transaction():
        counts = worker(connection, run_id, catalog_client, batch_size=batch_size, max_batches=max_batches)
        status = "paused" if counts.get("budget_exhausted", 0) or max_batches is not None else "completed"
        connection.execute(
            "UPDATE ems_ingest_runs SET status = %s, matched_count = %s, heartbeat_at = now(), finished_at = now() WHERE id = %s",
            (status, counts.get("matched", 0), run_id),
        )
    return counts, status


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    work_root_arg = getattr(args, "work_root", None)
    work_root = work_root_arg or (Path(os.environ["MUSICBRAINZ_WORK_ROOT"]) if os.environ.get("MUSICBRAINZ_WORK_ROOT") else None)
    if args.command in {"download", "download-canonical", "select"} and work_root is None:
        raise SystemExit("MUSICBRAINZ_WORK_ROOT or --work-root is required")
    if args.command in {"download", "download-canonical"}:
        from .musicbrainz import MusicBrainzSnapshotClient

        client = MusicBrainzSnapshotClient()
        print(client.download_latest(work_root) if args.command == "download" else client.download_latest_canonical(work_root))
        return 0
    if args.command == "select":
        from .select import select_snapshot

        select_snapshot(work_root=work_root, snapshot_id=args.snapshot_id, limit=args.limit)
        return 0
    if args.command == "stage":
        validated = ManifestImporter.validate(args.manifest, args.candidates)
        run_id = args.run_id or str(uuid4())
        database_url = os.environ.get("DATABASE_URL", "").strip()
        if not database_url:
            raise SystemExit("DATABASE_URL is required")
        candidates = [
            Candidate(
                candidate_key=row["candidate_key"], recording_mbid=row.get("recording_mbid") or "", isrc=row.get("isrc") or None,
                title=row["title"], artist=row["artist"], album=row.get("album") or None,
                duration_ms=int(row["duration_ms"]) if row.get("duration_ms") else None,
                release_date=None, artist_region=None, selection_bucket=row["selection_bucket"], selection_score=float(row["selection_score"]),
            )
            for row in ManifestImporter.iter_candidates(args.candidates)
        ]
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                connection.execute(
                    """INSERT INTO ems_ingest_runs (id, run_type, snapshot_id, manifest_sha256, status, request_budget, requested_count, started_at)
                       VALUES (%s, 'tidal_resolve', %s, %s, 'pending', %s, %s, now())
                       ON CONFLICT (id) DO NOTHING""",
                    (run_id, validated.snapshot_id, validated.sha256, args.request_budget, len(candidates)),
                )
            staged = stage_candidates(connection, run_id, candidates)
        print(json.dumps({"run_id": run_id, "snapshot_id": validated.snapshot_id, "staged": staged, "request_budget": args.request_budget}, sort_keys=True))
        return 0
    if args.command == "run":
        from .tidal import TidalCatalogClient
        from .worker import run_worker

        database_url = os.environ.get("DATABASE_URL", "").strip()
        client_id = os.environ.get("TIDAL_CLIENT_ID", "").strip()
        client_secret = os.environ.get("TIDAL_CLIENT_SECRET", "").strip()
        if not database_url or not client_id or not client_secret:
            raise SystemExit("DATABASE_URL, TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET are required")
        budget = args.request_budget if args.request_budget is not None else int(os.environ.get("TIDAL_REQUEST_BUDGET", "1000"))
        with psycopg.connect(database_url, row_factory=dict_row) as connection:
            client = TidalCatalogClient(client_id, client_secret, request_budget=budget)
            counts, status = execute_run(connection, args.run_id, client, run_worker, batch_size=args.batch_size, max_batches=args.max_batches)
        print(json.dumps({"run_id": args.run_id, "status": status, "counts": counts}, sort_keys=True))
        return 0
    raise SystemExit(f"unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
