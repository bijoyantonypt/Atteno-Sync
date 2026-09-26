"""
essl-sync/db.py
All Supabase database operations for the eSSL sync service.

Key fixes vs. earlier drafts:
  * Adds the missing get_db_connection() helper.
  * Uses ?on_conflict=nonce so duplicate punches are silently skipped (no 409 crash).
  * Accurate insert/skip counters.
  * Negative-cache entries expire so newly added employees can be matched.
"""

import logging
import time
from typing import Any

import requests

from config import (
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    LATE_GRACE_MINUTES,
    FACTORY_TIMEZONE,
)

log = logging.getLogger(__name__)

_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates,return=representation",
}

# ── Negative-cache: device_user_id → (employee_uuid | None, timestamp) ───────
_employee_cache: dict[str, tuple[str | None, float]] = {}
_CACHE_TTL = 300  # seconds — retry unmatched employees every 5 minutes

# ── Cached shift / settings data ─────────────────────────────────────────────
_shifts_cache: list[dict] | None = None
_grace_cache: int | None = None


# ══════════════════════════════════════════════════════════════════════════════
#  Low-level REST helper
# ══════════════════════════════════════════════════════════════════════════════

def get_db_connection() -> requests.Session:
    """Return a reusable HTTP session pre-configured for Supabase."""
    session = requests.Session()
    session.headers.update(_HEADERS)
    return session


def _rest(method: str, path: str, **kwargs) -> requests.Response:
    session = get_db_connection()
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    resp = session.request(method, url, timeout=20, **kwargs)
    resp.raise_for_status()
    return resp


# ══════════════════════════════════════════════════════════════════════════════
#  Reference data (shifts + settings), cached in memory
# ══════════════════════════════════════════════════════════════════════════════

def get_shifts() -> list[dict]:
    """Fetch shifts from Supabase and cache them in memory."""
    global _shifts_cache
    if _shifts_cache is not None:
        return _shifts_cache

    resp = _rest("GET", "shifts?select=code,start_minutes,end_minutes,break_minutes")
    _shifts_cache = resp.json()
    log.info("Loaded %d shifts from Supabase.", len(_shifts_cache))
    return _shifts_cache


def get_late_grace_minutes() -> int:
    """Read late_grace_minutes from the settings table (fallback to config)."""
    global _grace_cache
    if _grace_cache is not None:
        return _grace_cache
    try:
        resp = _rest("GET", "settings?select=late_grace_minutes&limit=1")
        rows = resp.json()
        _grace_cache = rows[0]["late_grace_minutes"] if rows else LATE_GRACE_MINUTES
    except Exception as exc:
        log.warning("Could not read settings table (%s); using config default.", exc)
        _grace_cache = LATE_GRACE_MINUTES
    return _grace_cache


# ══════════════════════════════════════════════════════════════════════════════
#  Employee resolution
# ══════════════════════════════════════════════════════════════════════════════

def resolve_employee_id(device_user_id: str, name_hint: str = "") -> str | None:
    """
    Map an eSSL device user_id → employees.id (UUID).
    1. Match employees.employee_code == device_user_id
    2. Fall back to full_name ilike match
    3. Cache result for _CACHE_TTL seconds (misses expire so new hires get picked up)
    """
    now = time.time()
    cached = _employee_cache.get(device_user_id)
    if cached and (now - cached[1]) < _CACHE_TTL:
        return cached[0]

    # 1. Match by employee_code
    resp = _rest(
        "GET",
        f"employees?employee_code=eq.{device_user_id}&select=id&limit=1",
    )
    rows = resp.json()
    if rows:
        emp_id = rows[0]["id"]
        _employee_cache[device_user_id] = (emp_id, now)
        return emp_id

    # 2. Fall back to name match (PostgREST uses * as a wildcard in ilike)
    if name_hint:
        safe_name = name_hint.replace("%", "").replace("*", "")
        resp = _rest(
            "GET",
            f"employees?full_name=ilike.*{safe_name}*&select=id&limit=1",
        )
        rows = resp.json()
        if rows:
            emp_id = rows[0]["id"]
            _employee_cache[device_user_id] = (emp_id, now)
            log.info("Matched device user '%s' to employee %s by name.", device_user_id, emp_id)
            return emp_id

    log.warning("No employee found for device user_id='%s' — skipping.", device_user_id)
    _employee_cache[device_user_id] = (None, now)   # negative-cache WITH TTL
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  Attendance-event upsert
# ══════════════════════════════════════════════════════════════════════════════

def upsert_events(events: list[dict]) -> dict:
    """
    Upsert a list of attendance events into Supabase.
    Duplicates (by nonce) are silently skipped thanks to ?on_conflict=nonce.
    Returns a dict with attempted / inserted / skipped counters.
    """
    rows: list[dict] = []
    skipped = 0

    for ev in events:
        emp_id = resolve_employee_id(
            ev.get("employee_device_user_id", ""),
            ev.get("employee_name_hint", ""),
        )
        if not emp_id:
            skipped += 1
            continue

        rows.append({
            "employee_id":    emp_id,
            "event_type":     ev["event_type"],
            "captured_at":    ev["captured_at"],
            "work_date":      ev["work_date"],
            "shift_code":     ev["shift_code"],
            "was_late":       ev["was_late"],
            "was_early":      ev["was_early"],
            "device_id":      ev["device_id"],
            "nonce":          ev["nonce"],
            "match_score":    ev.get("match_score"),
            "source":         ev["source"],
            "synced_offline": ev.get("synced_offline", False),
        })

    if not rows:
        return {"attempted": len(events), "inserted": 0, "skipped": skipped}

    BATCH = 200
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        resp = _rest(
            "POST",
            "attendance_events?on_conflict=nonce",
            json=batch,
        )
        # return=representation → response is the list of rows actually inserted
        try:
            inserted += len(resp.json())
        except ValueError:
            inserted += len(batch)

    return {
        "attempted": len(events),
        "inserted":  inserted,
        "skipped":   skipped + (len(rows) - inserted),
    }
