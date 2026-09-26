"""
essl-sync/mapper.py
Maps raw eSSL/ZKTeco attendance records to the attendance_events schema
used by Atteno-Sync (work_date, shift_code, was_late, was_early, etc.).
"""

import hashlib
import os
from datetime import timezone, datetime
from zoneinfo import ZoneInfo
from schemas import validate_attendance_event

# ── Shift definitions (must match your Supabase shifts table) ───────────────
SHIFTS = [
    {"code": "A", "start": (8,  0),  "end": (17, 15), "break_min": 75},
    {"code": "B", "start": (9,  0),  "end": (18, 15), "break_min": 75},
]
LATE_GRACE_MINUTES = 5
FACTORY_TZ = ZoneInfo(os.getenv("FACTORY_TIMEZONE", "Asia/Kolkata"))


def _minutes(h: int, m: int) -> int:
    return h * 60 + m


def _resolve_shift(clock_in_minutes: int) -> dict:
    """Pick the shift whose start is closest to the clock-in time."""
    return min(
        SHIFTS,
        key=lambda s: abs(_minutes(*s["start"]) - clock_in_minutes),
    )


def _make_nonce(user_id: str, ts: datetime) -> str:
    """Deterministic UUID-like nonce so re-runs are idempotent (no duplicates)."""
    raw = f"essl|{user_id}|{ts.isoformat()}"
    h   = hashlib.sha256(raw.encode()).hexdigest()
    # Format as UUID v4-ish (just for shape compatibility)
    return f"{h[0:8]}-{h[8:12]}-4{h[13:16]}-{h[16:20]}-{h[20:32]}"

def map_to_attendance_events(raw_records: list[dict], device_id: str) -> list[dict]:
    events = []

    for r in raw_records:
        try:
            event = {
                "employee_id": _resolve_employee_id(r["user_id"], r.get("user_name", "")),
                "event_type": "in" if r["punch"] in (0, 2, 4) else "out",
                "captured_at": r["timestamp"].astimezone(timezone.utc).isoformat(),
                "work_date": r["timestamp"].strftime("%Y-%m-%d"),
                "shift_code": _resolve_shift(r["timestamp"].hour * 60 + r["timestamp"].minute)["code"],
                "was_late": _is_late(r["punch"], r["timestamp"]),
                "was_early": _is_early(r["punch"], r["timestamp"]),
                "device_id": device_id,
                "nonce": _make_nonce(r["user_id"], r["timestamp"]),
                "source": "essl"
            }

            validated_event = validate_attendance_event(event)
            events.append(validated_event)

        except Exception as e:
            log.error(f"Failed to validate event for user {r['user_id']}: {str(e)}")
            continue

    return events
