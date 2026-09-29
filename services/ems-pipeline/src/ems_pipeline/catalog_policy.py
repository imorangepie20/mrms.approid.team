from __future__ import annotations

import re
from typing import Any

from .select import Candidate
from .tidal import ResolveResult, ResolveStatus


EXCLUDED_ISRC_COUNTRIES = {"IL", "IN", "TR"}
INDIAN_LABEL_MARKERS = (
    "saregama india",
    "sony music entertainment india",
    "tips industries",
    "tips music",
    "times music india",
    "warner music india",
)
TURKISH_LABEL_MARKERS = (
    "bir numara müzik",
    "bir numara muzik",
    "kalan ses görüntü",
    "kalan ses goruntu",
    "moko yapım",
    "moko yapim",
    "seyhan müzik",
    "seyhan muzik",
)
ARABIC_SCRIPT = re.compile(r"[\u0600-\u06ff]")
HEBREW_SCRIPT = re.compile(r"[\u0590-\u05ff]")


def _metadata_text(metadata: dict[str, Any] | None, *path: str) -> str:
    value: Any = metadata
    for key in path:
        if not isinstance(value, dict):
            return ""
        value = value.get(key)
    return value if isinstance(value, str) else ""


def resolved_isrc(candidate: Candidate, result: ResolveResult) -> str | None:
    value = candidate.isrc or _metadata_text(result.source_metadata, "track", "isrc")
    normalized = value.strip().upper() if isinstance(value, str) else ""
    return normalized or None


def static_exclusion_reason(candidate: Candidate, result: ResolveResult) -> str | None:
    isrc = resolved_isrc(candidate, result)
    if isrc and len(isrc) >= 2 and isrc[:2] in EXCLUDED_ISRC_COUNTRIES:
        return f"{isrc[:2].lower()}_isrc"

    text = " ".join(filter(None, [
        result.title or candidate.title,
        result.artist or candidate.artist,
        result.album if result.album is not None else candidate.album,
    ]))
    if HEBREW_SCRIPT.search(text):
        return "hebrew_script"
    if ARABIC_SCRIPT.search(text):
        return "arabic_script"

    copyright_text = " ".join([
        _metadata_text(result.source_metadata, "track", "copyright", "text"),
        _metadata_text(result.source_metadata, "album", "copyright", "text"),
    ]).casefold()
    if any(marker in copyright_text for marker in INDIAN_LABEL_MARKERS):
        return "indian_label"
    if any(marker in copyright_text for marker in TURKISH_LABEL_MARKERS):
        return "turkish_label"
    return None


def persistent_exclusion_reason(
    connection: Any,
    *,
    tidal_id: str | None,
    isrc: str | None,
) -> str | None:
    row = connection.execute(
        """SELECT reason
             FROM ems_catalog_exclusions
            WHERE (%s IS NOT NULL AND tidal_id = %s)
               OR (%s IS NOT NULL AND isrc = %s)
            ORDER BY created_at
            LIMIT 1""",
        (tidal_id, tidal_id, isrc, isrc),
    ).fetchone()
    return str(row["reason"]) if row and row.get("reason") else None


def apply_catalog_policy(
    connection: Any,
    candidate: Candidate,
    result: ResolveResult,
) -> ResolveResult:
    if result.status != ResolveStatus.MATCHED:
        return result
    isrc = resolved_isrc(candidate, result)
    reason = static_exclusion_reason(candidate, result)
    if reason is None:
        reason = persistent_exclusion_reason(
            connection,
            tidal_id=result.tidal_id,
            isrc=isrc,
        )
    if reason is None:
        return result
    return ResolveResult(
        ResolveStatus.UNAVAILABLE,
        match_rule=result.match_rule,
        match_confidence=result.match_confidence,
        query_hash=result.query_hash,
        error_code=f"catalog_policy_excluded_{reason}",
    )
