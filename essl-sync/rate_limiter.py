"""
essl-sync/rate_limiter.py
Lightweight in-memory rate limiter (used if you don't want Flask-Limiter).
"""

import time
from functools import wraps
from flask import request, jsonify


class RateLimiter:
    def __init__(self, default_per_minute: int = 100):
        self.default = default_per_minute
        self.buckets: dict[str, dict] = {}

    def limit(self, per_minute: int | None = None):
        def decorator(fn):
            @wraps(fn)
            def wrapper(*args, **kwargs):
                ip = request.remote_addr or "unknown"
                now = int(time.time())
                bucket = self.buckets.setdefault(ip, {"count": 0, "start": now})

                if now - bucket["start"] >= 60:
                    bucket["count"] = 0
                    bucket["start"] = now

                limit = per_minute or self.default
                if bucket["count"] >= limit:
                    return jsonify({
                        "error": "rate limit exceeded",
                        "retry_after": 60 - (now - bucket["start"]),
                    }), 429

                bucket["count"] += 1
                return fn(*args, **kwargs)
            return wrapper
        return decorator


rate_limiter = RateLimiter()
