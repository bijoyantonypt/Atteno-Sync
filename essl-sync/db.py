"""
essl-sync/db.py
All Supabase database operations for the eSSL sync service.
Uses the REST API (via requests) with the service-role key — no Deno/JS needed.
"""

import logging
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

SUPABASE_URL      = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_ROLE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {
    "apikey":        SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=ignore-duplicates,return=minimal",
}

# ── In-memory cache: device_user_id (str) → employee UUID ───────────────────
_employee_cache: dict[str, str | None] = {}

# ── Last sync timestamp stored in Supabase settings notes field ─────────────
_SYNC_KEY = "essl_last_sync"


def _rest(method: str, path: str, **kwargs) -> requests.Response:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    resp = requests.request(method, url, headers=HEADERS, timeout=15, **kwargs)
    resp.raise_for_status()
    return resp


def _resolve_employee_id(device_user_id: str, name_hint: str) -> str | None:
    """
    Map eSSL user_id → employees.id (UUID).
    Looks up employees.employee_code == device_user_id first,
    then falls back to full_name match using name_hint.
    Returns None if not found (event will be skipped).
    """
    if device_user_id in _employee_cache:
        return _employee_cache[device_user_id]

    # Primary: employee_code matches the device user ID
    resp = _rest("GET", f"employees?employee_code=eq.{device_user_id}&select=id&limit=1")
    rows = resp.json()
    if rows:
        emp_id = rows[0]["id"]
        _employee_cache[device_user_id] = emp_id
        return emp_id

    # Fallback: match by full_name (case-insensitive)
    if name_hint:
        resp = _rest(
            "GET",
            f"employees?full_name=ilike.{requests.utils.quote(name_hint)}&select=id&limit=1",
        )
        rows = resp.json()
        if rows:
            emp_id = rows[0]["id"]
            _employee_cache[device_user_id] = emp_id
            log.info(
                "Matched device user '%s' ('%s') by name to employee %s",
                device_user_id, name_hint, emp_id,
            )
            return emp_id

    log.warning(
        "No employee found for device user_id='%s' name='%s' — skipping.",
        device_user_id, name_hint,
    )
    _employee_cache[device_user_id] = None
    return None


def upsert_events(events: list[dict]) -> tuple[int, int]:
    """
    Resolves employee UUIDs and bulk-upserts attendance_events.
    Returns (inserted_count, skipped_count).
    """
    rows      = []
    skipped   = 0

    for ev in events:
        emp_id = _resolve_employee_id(
            ev["employee_device_user_id"],
            ev.get("employee_name_hint", ""),
        )
        if not emp_id:
            skipped += 1
            continue

        rows.append({
            "employee_id": emp_id,
            "event_type":  ev["event_type"],
            "captured_at": ev["captured_at"],
            "work_date":   ev["work_date"],
            "shift_code":  ev["shift_code"],
            "was_late":    ev["was_late"],
            "was_early":   ev["was_early"],
            "device_id":   ev["device_id"],
            "nonce":       ev["nonce"],
            "match_score": ev["match_score"],
            "source":      ev["source"],
            "synced_offline": ev["synced_offline"],
        })

    if not rows:
        return 0, skipped

    # Upsert in batches of 200 (Supabase REST safe limit)
    BATCH = 200
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        resp  = _rest("POST", "attendance_events", json=batch)
        # With "Prefer: return=minimal" and ignore-duplicates, 201 = all inserted, 200 = some dupes ignored
        inserted += len(batch)   # approximate; dupes silently ignored by DB UNIQUE constraint

    skipped += (len(events) - len(rows))
    return inserted, skipped


# ── Last-sync timestamp helpers (stored in a simple local file) ──────────────
_STATE_FILE = os.path.join(os.path.dirname(__file__), ".sync_state")


def get_last_sync_time() -> datetime | None:
    try:
        with open(_STATE_FILE) as f:
            return datetime.fromisoformat(f.read().strip())
    except (FileNotFoundError, ValueError):
        return None


def set_last_sync_time(ts: datetime):
    with open(_STATE_FILE, "w") as f:
        f.write(ts.astimezone(timezone.utc).isoformat())
