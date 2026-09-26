"""
essl-sync/config.py
Central configuration loader with validation.
Reads from environment variables (.env) and fails fast if anything is missing.
"""

import os
from dotenv import load_dotenv

load_dotenv()


def _require(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value == "":
        raise ValueError(f"Missing required environment variable: {name}")
    return value


# ── eSSL Device ──────────────────────────────────────────────────────────────
ESSL_DEVICE_IP   = _require("ESSL_DEVICE_IP")
ESSL_DEVICE_PORT = int(os.getenv("ESSL_DEVICE_PORT", "4370"))
ESSL_COMM_KEY    = int(os.getenv("ESSL_COMM_KEY", "0"))
ESSL_TIMEOUT     = int(os.getenv("ESSL_TIMEOUT", "10"))
ESSL_DEVICE_ID   = _require("ESSL_DEVICE_ID")   # UUID of device row in Supabase

# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL        = _require("SUPABASE_URL").rstrip("/")
SUPABASE_SERVICE_KEY = _require("SUPABASE_SERVICE_ROLE_KEY")

# ── App ──────────────────────────────────────────────────────────────────────
FACTORY_TIMEZONE   = os.getenv("FACTORY_TIMEZONE", "Asia/Kolkata")
SYNC_INTERVAL_MIN  = int(os.getenv("SYNC_INTERVAL_MINUTES", "15"))
LATE_GRACE_MINUTES = int(os.getenv("LATE_GRACE_MINUTES", "5"))

# ── Security ─────────────────────────────────────────────────────────────────
SESSION_SECRET = _require("SESSION_SECRET", "change-me-in-production")
LOG_LEVEL      = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE       = os.getenv("LOG_FILE", "sync.log")

# ── Server ───────────────────────────────────────────────────────────────────
API_HOST = os.getenv("API_HOST", "127.0.0.1")   # local-only by default
API_PORT = int(os.getenv("API_PORT", "5000"))
