"""
essl-sync/mapper.py
Maps raw eSSL/ZKTeco attendance records to the attendance_events schema
used by Atteno-Sync (work_date, shift_code, was_late, was_early, etc.).
"""

import hashlib
import os
from datetime import timezone, datetime
from zoneinfo import ZoneInfo

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
    """
    raw_records: output of fetch_from_device() in sync.py
    device_id:   UUID of the eSSL device row in Supabase devices table
    Returns a list of dicts ready to upsert into attendance_events.
    """
    events = []

    for r in raw_records:
        # ── 1. Localise timestamp ────────────────────────────────────────────
        ts_naive: datetime = r["timestamp"]                        # device sends naive local time
        ts_local = ts_naive.replace(tzinfo=FACTORY_TZ)            # attach factory tz
        ts_utc   = ts_local.astimezone(timezone.utc)

        local_h  = ts_local.hour
        local_m  = ts_local.minute
        clock_min = _minutes(local_h, local_m)
        work_date = ts_local.strftime("%Y-%m-%d")

        # ── 2. Determine event_type ──────────────────────────────────────────
        # eSSL X990 status: 0 = Check-In, 1 = Check-Out
        # Verify these values against your specific firmware if punches look wrong
        status = r.get("status", 0)
        event_type = "in" if status == 0 else "out"

        # ── 3. Resolve shift ─────────────────────────────────────────────────
        shift = _resolve_shift(clock_min)

        # ── 4. Late / early flags ────────────────────────────────────────────
        shift_start_min = _minutes(*shift["start"])
        shift_end_min   = _minutes(*shift["end"])

        was_late  = event_type == "in"  and clock_min > shift_start_min + LATE_GRACE_MINUTES
        was_early = event_type == "out" and clock_min < shift_end_min

        # ── 5. Build event dict ──────────────────────────────────────────────
        events.append({
            "employee_device_user_id": r["user_id"],     # resolved to UUID in db.py
            "employee_name_hint":      r["user_name"],   # used only for lookup fallback
            "event_type":    event_type,
            "captured_at":   ts_utc.isoformat(),
            "work_date":     work_date,
            "shift_code":    shift["code"],
            "was_late":      was_late,
            "was_early":     was_early,
            "device_id":     device_id,
            "nonce":         _make_nonce(r["user_id"], ts_local),
            "match_score":   None,
            "source":        "essl",
            "synced_offline": False,
        })

    return events
