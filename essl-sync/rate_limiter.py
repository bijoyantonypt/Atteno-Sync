from functools import wraps
from flask import request, jsonify
import time

class RateLimiter:
    def __init__(self, default_limits={'per_minute': 100}):
        self.default_limits = default_limits
        self.request_counts = {}

    def limit(self, limit_key='per_minute', limit_value=None):
        def decorator(f):
            @wraps(f)
            def wrapped(*args, **kwargs):
                client_ip = request.remote_addr
                current_time = int(time.time())

                if client_ip not in self.request_counts:
                    self.request_counts[client_ip] = {}

                if limit_key not in self.request_counts[client_ip]:
                    self.request_counts[client_ip][limit_key] = {
                        'count': 0,
                        'window_start': current_time
                    }

                request_info = self.request_counts[client_ip][limit_key]

                # Reset counter if window has passed
                if current_time - request_info['window_start'] > 60:
                    request_info['count'] = 0
                    request_info['window_start'] = current_time

                # Apply limit
                limit = limit_value or self.default_limits.get(limit_key, 100)
                if request_info['count'] >= limit:
                    return jsonify({
                        'error': 'Rate limit exceeded',
                        'retry_after': 60 - (current_time - request_info['window_start'])
                    }), 429

                request_info['count'] += 1
                return f(*args, **kwargs)
            return wrapped
        return decorator

# Initialize rate limiter
rate_limiter = RateLimiter()
