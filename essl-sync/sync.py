"""
essl-sync/sync.py
Fetches attendance from the eSSL X990 and upserts it into Supabase.

Run modes:
  python sync.py            # continuous scheduler (every SYNC_INTERVAL_MINUTES)
  python sync.py --once     # single run, then exit (used by GitHub Actions)
  python sync.py --serve    # run Flask API + scheduler together
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

import schedule
from flask import Flask, jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from zk import ZK
from zk.exception import ZKErrorResponse, ZKNetworkError

from config import (
    ESSL_DEVICE_IP, ESSL_DEVICE_PORT, ESSL_COMM_KEY, ESSL_TIMEOUT,
    ESSL_DEVICE_ID, SYNC_INTERVAL_MIN, LOG_FILE, LOG_LEVEL,
    API_HOST, API_PORT,
)
from db import upsert_events
from mapper import map_to_attendance_events

# ══════════════════════════════════════════════════════════════════════════════
#  Logging
# ══════════════════════════════════════════════════════════════════════════════

logger = logging.getLogger()
logger.setLevel(LOG_LEVEL.upper())
_fmt = logging.Formatter("%(asctime)s  %(levelname)-8s  %(message)s",
                         datefmt="%Y-%m-%d %H:%M:%S")
logger.addHandler(logging.StreamHandler(sys.stdout))
logger.addHandler(RotatingFileHandler(LOG_FILE, maxBytes=5_000_000,
                                      backupCount=3, encoding="utf-8"))
log = logging.getLogger("sync")

app = Flask(__name__)
limiter = Limiter(get_remote_address, app=app, default_limits=["120 per minute"])

# ══════════════════════════════════════════════════════════════════════════════
#  Device I/O
# ══════════════════════════════════════════════════════════════════════════════

def _connect_device():
    zk = ZK(
        ESSL_DEVICE_IP,
        port=ESSL_DEVICE_PORT,
        timeout=ESSL_TIMEOUT,
        password=ESSL_COMM_KEY,
        force_udp=False,
        ommit_ping=False,
    )
    return zk.connect()


def fetch_from_device() -> list[dict]:
    """Connect to the X990, fetch punches + names, return a list of dicts."""
    conn = None
    try:
        log.info("Connecting to eSSL X990 at %s:%s …", ESSL_DEVICE_IP, ESSL_DEVICE_PORT)
        conn = _connect_device()
        conn.disable_device()

        users = {u.user_id: u.name for u in conn.get_users()}
        attendances = conn.get_attendance()

        log.info("Fetched %d raw records.", len(attendances))

        return [{
            "user_id":   str(a.user_id),
            "user_name": users.get(a.user_id, f"User-{a.user_id}"),
            "timestamp": a.timestamp,       # naive, device-local
            "punch":     a.punch,           # direction code
            "status":    a.status,          # verification mode (not direction)
        } for a in attendances]

    except (ZKNetworkError, ZKErrorResponse) as exc:
        log.error("Device communication error: %s", exc)
        return []
    except Exception as exc:
        log.exception("Unexpected device error: %s", exc)
        return []
    finally:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
#  Sync cycle
# ══════════════════════════════════════════════════════════════════════════════

def run_sync() -> dict:
    """One full fetch → map → upsert cycle. Returns a result summary dict."""
    log.info("── Sync cycle starting ─────────────────────")
    started = datetime.now(timezone.utc)

    raw = fetch_from_device()
    if not raw:
        log.warning("No records fetched from device.")
        return {"status": "no_data", "inserted": 0}

    events = map_to_attendance_events(raw, ESSL_DEVICE_ID)
    log.info("Mapped %d valid events.", len(events))

    result = upsert_events(events)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()

    log.info(
        "Done in %.1fs — attempted=%d inserted=%d skipped=%d",
        elapsed, result["attempted"], result["inserted"], result["skipped"],
    )
    log.info("── Sync cycle complete ─────────────────────")
    return {"status": "ok", **result, "elapsed_seconds": elapsed}


# ══════════════════════════════════════════════════════════════════════════════
#  Flask API (LAN-only by default)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/health", methods=["GET"])
@limiter.exempt
def health():
    """Simple liveness probe — does NOT touch the device (keeps it cheap)."""
    return jsonify({"status": "healthy", "service": "essl-sync",
                    "time": datetime.now(timezone.utc).isoformat()}), 200


@app.route("/api/attendance/sync", methods=["POST"])
@limiter.limit("5 per minute")
def trigger_sync():
    """Manually trigger a sync (protected by shared secret header)."""
    from config import SESSION_SECRET
    if request.headers.get("X-Sync-Secret") != SESSION_SECRET:
        return jsonify({"error": "unauthorized"}), 401
    result = run_sync()
    return jsonify(result), 200


def serve():
    """Run the scheduler in a background thread + Flask API in the foreground."""
    import threading
    def _loop():
        schedule.every(SYNC_INTERVAL_MIN).minutes.do(run_sync)
        run_sync()
        while True:
            schedule.run_pending()
            time.sleep(30)

    threading.Thread(target=_loop, daemon=True).start()
    log.info("API listening on %s:%s", API_HOST, API_PORT)
    app.run(host=API_HOST, port=API_PORT, debug=False)


# ══════════════════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="eSSL X990 → Supabase sync")
    parser.add_argument("--once",  action="store_true", help="Run once and exit")
    parser.add_argument("--serve", action="store_true", help="Run API + scheduler")
    args = parser.parse_args()

    if args.serve:
        serve()
    elif args.once:
        try:
            result = run_sync()
            sys.exit(0 if result["status"] == "ok" else 1)
        except Exception as exc:
            log.exception("Fatal error: %s", exc)
            sys.exit(1)
    else:
        log.info("Scheduler started — every %d minutes.", SYNC_INTERVAL_MIN)
        schedule.every(SYNC_INTERVAL_MIN).minutes.do(run_sync)
        run_sync()
        while True:
            schedule.run_pending()
            time.sleep(30)
