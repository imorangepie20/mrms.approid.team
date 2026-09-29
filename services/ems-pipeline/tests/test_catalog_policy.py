from ems_pipeline.catalog_policy import apply_catalog_policy, static_exclusion_reason
from ems_pipeline.select import Candidate
from ems_pipeline.tidal import ResolveResult, ResolveStatus


def candidate(*, isrc: str | None = None, title: str = "Track", artist: str = "Artist") -> Candidate:
    return Candidate(
        candidate_key="candidate-a",
        recording_mbid=None,
        isrc=isrc,
        title=title,
        artist=artist,
        album="Album",
        duration_ms=180_000,
        release_date=None,
        artist_region=None,
        selection_bucket="canonical",
        selection_score=0.8,
    )


def matched(**values: object) -> ResolveResult:
    return ResolveResult(
        ResolveStatus.MATCHED,
        tidal_id=str(values.pop("tidal_id", "tidal-a")),
        title=str(values.pop("title", "Track")),
        artist=str(values.pop("artist", "Artist")),
        album=str(values.pop("album", "Album")),
        **values,
    )


class ExclusionConnection:
    def __init__(self, reason: str | None = None) -> None:
        self.reason = reason
        self.values = None

    def execute(self, _sql: str, values: object = None) -> "ExclusionConnection":
        self.values = values
        return self

    def fetchone(self):
        return {"reason": self.reason} if self.reason else None


def test_static_policy_excludes_configured_isrc_countries() -> None:
    assert static_exclusion_reason(candidate(isrc="INH100069430"), matched()) == "in_isrc"
    assert static_exclusion_reason(candidate(isrc="TR0330603709"), matched()) == "tr_isrc"
    assert static_exclusion_reason(candidate(isrc="IL7532613655"), matched()) == "il_isrc"


def test_static_policy_excludes_arabic_hebrew_scripts_and_confirmed_labels() -> None:
    assert static_exclusion_reason(candidate(title="نجوم الليل"), matched(title="نجوم الليل")) == "arabic_script"
    assert static_exclusion_reason(candidate(title="שיר המשאלות"), matched(title="שיר המשאלות")) == "hebrew_script"
    assert static_exclusion_reason(candidate(), matched(source_metadata={
        "track": {"copyright": {"text": "Moko Yapım"}},
    })) == "turkish_label"
    assert static_exclusion_reason(candidate(), matched(source_metadata={
        "album": {"copyright": {"text": "Saregama India Ltd"}},
    })) == "indian_label"


def test_static_policy_does_not_treat_unrelated_latin_music_as_turkish() -> None:
    assert static_exclusion_reason(candidate(isrc="DEUM71012345", title="Süchtig"), matched(title="Süchtig")) is None
    assert static_exclusion_reason(candidate(isrc="FR0X82500016", title="Je t'ai aimée"), matched(title="Je t'ai aimée")) is None
    assert static_exclusion_reason(candidate(isrc="USUM72412380", title="Heart Of A Woman"), matched(title="Heart Of A Woman")) is None


def test_persistent_identity_tombstone_excludes_an_otherwise_allowed_match() -> None:
    connection = ExclusionConnection("regional_cleanup")
    result = apply_catalog_policy(connection, candidate(isrc="GBABC1234567"), matched(tidal_id="123"))

    assert result.status == ResolveStatus.UNAVAILABLE
    assert result.error_code == "catalog_policy_excluded_regional_cleanup"
    assert connection.values == ("123", "123", "GBABC1234567", "GBABC1234567")


def test_allowed_match_passes_through_unchanged() -> None:
    connection = ExclusionConnection()
    result = matched(tidal_id="123")

    assert apply_catalog_policy(connection, candidate(isrc="GBABC1234567"), result) is result
