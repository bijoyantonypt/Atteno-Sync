"""
essl-sync/mapper.py
Maps raw eSSL/ZKTeco attendance records to the attendance_events schema.

IMPORTANT: direction is derived from the `punch` field, NOT `status`.
  punch: 0=Check-In, 1=Check-Out, 2=Break-Out, 3=Break-In, 4=OT-In, 5=OT-Out
A safety net (alternating IN/OUT per employee per day) is applied when
punch values are all zeros (some firmware batches).
"""

import hashlib
import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from config import FACTORY_TIMEZONE
from db import get_shifts, get_late_grace_minutes
from schemas import validate_event

log = logging.getLogger(__name__)

TZ = ZoneInfo(FACTORY_TIMEZONE)

# punch codes that mean "in"
_IN_PUNCHES  = {0, 2, 4}
_OUT_PUNCHES = {1, 3, 5}


def _minutes(h: int, m: int) -> int:
    return h * 60 + m


def _resolve_shift(clock_minutes: int, shifts: list[dict]) -> dict:
    """Pick the shift whose start_time is closest to the punch time."""
    return min(shifts, key=lambda s: abs(s["start_minutes"] - clock_minutes))


def _make_nonce(user_id: str, ts: datetime) -> str:
    """Deterministic UUID-shaped hash so the same punch never inserts twice."""
    raw = f"essl|{user_id}|{ts.isoformat()}"
    h = hashlib.sha256(raw.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-4{h[13:16]}-{h[16:20]}-{h[20:32]}"


def _derive_directions(raw_records: list[dict]) -> list[dict]:
    """
    Safety net: if every punch code in the batch is 0 (firmware reports
    nothing useful), assign IN/OUT by alternating per employee per day.
    """
    all_zero = all(r.get("punch", 0) == 0 for r in raw_records)
    if not all_zero:
        return raw_records

    log.warning("All punch codes are 0 — using alternation fallback.")
    grouped: dict[tuple[str, str], list[dict]] = {}
    for r in raw_records:
        key = (r["user_id"], r["timestamp"].strftime("%Y-%m-%d"))
        grouped.setdefault(key, []).append(r)

    for records in grouped.values():
        records.sort(key=lambda r: r["timestamp"])
        for idx, rec in enumerate(records):
            rec["punch"] = 0 if idx % 2 == 0 else 1
    return raw_records


def map_to_attendance_events(raw_records: list[dict], device_id: str) -> list[dict]:
    """Convert raw device records → validated attendance-event dicts."""
    shifts = get_shifts()
    grace  = get_late_grace_minutes()
    raw_records = _derive_directions(raw_records)

    events: list[dict] = []
    for r in raw_records:
        try:
            ts_local = r["timestamp"].replace(tzinfo=TZ)
            ts_utc   = ts_local.astimezone(timezone.utc)
            clock_min = _minutes(ts_local.hour, ts_local.minute)

            event_type = "in" if r.get("punch", 0) in _IN_PUNCHES else "out"
            shift = _resolve_shift(clock_min, shifts)

            was_late  = event_type == "in"  and clock_min > shift["start_minutes"] + grace
            was_early = event_type == "out" and clock_min < shift["end_minutes"]

            event = {
                "employee_device_user_id": r["user_id"],
                "employee_name_hint":      r.get("user_name", ""),
                "event_type":    event_type,
                "captured_at":   ts_utc.isoformat(),
                "work_date":     ts_local.strftime("%Y-%m-%d"),
                "shift_code":    shift["code"],
                "was_late":      was_late,
                "was_early":     was_early,
                "device_id":     device_id,
                "nonce":         _make_nonce(r["user_id"], ts_local),
                "match_score":   None,
                "source":        "essl",
                "synced_offline": False,
            }

            # Validate the DB-shaped subset (drop helper keys first)
            validate_event({k: v for k, v in event.items()
                            if k not in ("employee_device_user_id", "employee_name_hint")})
            events.append(event)

        except Exception as exc:
            log.error("Failed to map record for user %s: %s", r.get("user_id"), exc)

    return events
