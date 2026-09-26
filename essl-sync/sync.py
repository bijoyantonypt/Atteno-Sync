"""
essl-sync/sync.py
Fetches raw attendance logs from the eSSL X990 (ZKTeco protocol) and
inserts them into Supabase as attendance_events with source='essl'.

Run continuously:  python sync.py
Run once:          python sync.py --once
"""

import argparse
import logging
import os
import time
from datetime import datetime, timezone

import schedule
from dotenv import load_dotenv
from zk import ZK, const

from db import upsert_events, get_last_sync_time, set_last_sync_time
from mapper import map_to_attendance_events

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

DEVICE_IP   = os.environ["ESSL_DEVICE_IP"]
DEVICE_PORT = int(os.getenv("ESSL_DEVICE_PORT", "4370"))
TIMEOUT     = int(os.getenv("ESSL_TIMEOUT", "10"))
DEVICE_ID   = os.environ["ESSL_DEVICE_ID"]   # UUID in your devices table


def fetch_from_device() -> list[dict]:
    """Connect to eSSL X990, pull raw attendance records, return list of dicts."""
    zk   = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=TIMEOUT, ommit_ping=False)
    conn = None
    try:
        log.info("Connecting to eSSL X990 at %s:%s …", DEVICE_IP, DEVICE_PORT)
        conn = zk.connect()
        conn.disable_device()           # pause device during read for safety

        attendances = conn.get_attendance()
        users       = {u.user_id: u.name for u in conn.get_users()}

        log.info("Fetched %d raw records from device.", len(attendances))

        records = []
        for att in attendances:
            records.append({
                "user_id":    str(att.user_id),
                "user_name":  users.get(att.user_id, f"User-{att.user_id}"),
                "timestamp":  att.timestamp,           # naive datetime (device local)
                "status":     att.status,              # 0 = IN, 1 = OUT (verify on your firmware)
                "punch":      att.punch,
            })
        return records

    except Exception as exc:
        log.error("Device fetch failed: %s", exc)
        return []
    finally:
        if conn:
            conn.enable_device()
            conn.disconnect()


def run_sync():
    """Full sync cycle: fetch → map → upsert."""
    log.info("── Sync cycle starting ──────────────────────")
    last_sync = get_last_sync_time()
    log.info("Last successful sync: %s", last_sync or "never")

    raw = fetch_from_device()
    if not raw:
        log.warning("No records fetched — skipping upsert.")
        return

    # Filter to only new records (incremental sync)
    if last_sync:
        new_raw = [r for r in raw if r["timestamp"] > last_sync]
        log.info("%d new records after %s", len(new_raw), last_sync)
    else:
        new_raw = raw
        log.info("First sync — processing all %d records.", len(new_raw))

    if not new_raw:
        log.info("Nothing new to sync.")
        set_last_sync_time(datetime.now(timezone.utc))
        return

    events = map_to_attendance_events(new_raw, DEVICE_ID)
    inserted, skipped = upsert_events(events)
    log.info("Upserted: %d  |  Skipped/duplicate: %d", inserted, skipped)

    set_last_sync_time(datetime.now(timezone.utc))
    log.info("── Sync cycle complete ──────────────────────")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    if args.once:
        run_sync()
    else:
        interval = int(os.getenv("SYNC_INTERVAL_MINUTES", "15"))
        log.info("Scheduler started — syncing every %d minutes.", interval)
        schedule.every(interval).minutes.do(run_sync)
        run_sync()          # run immediately on start
        while True:
            schedule.run_pending()
            time.sleep(30)
