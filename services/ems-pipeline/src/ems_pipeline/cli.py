from __future__ import annotations

import argparse
import os
from pathlib import Path


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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    work_root = args.work_root or (Path(os.environ["MUSICBRAINZ_WORK_ROOT"]) if os.environ.get("MUSICBRAINZ_WORK_ROOT") else None)
    if work_root is None:
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
    raise SystemExit(f"unsupported command: {args.command}")
