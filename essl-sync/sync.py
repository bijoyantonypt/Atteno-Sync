# essl-sync/sync.py (relevant excerpt)

import logging
import sys
from dotenv import load_dotenv
import os
from flask import Flask
from rate_limiter import rate_limiter
from logging.handlers import RotatingFileHandler
from ssl_config import configure_ssl
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, Counter, Gauge

# Metrics
REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP Requests', ['method', 'endpoint', 'http_status'])
ACTIVE_CONNECTIONS = Gauge('active_connections', 'Number of active connections to the device')

@app.route('/metrics')
def metrics():
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}

@app.before_request
def before_request():
    request.start_time = time.time()

@app.after_request
def after_request(response):
    request_latency = time.time() - request.start_time
    REQUEST_COUNT.labels(request.method, request.path, response.status_code).inc()
    return response

app = Flask(__name__)
configure_ssl(app)

@app.route('/api/attendance', methods=['GET'])
@rate_limiter.limit(limit_key='per_minute', limit_value=100)
def get_attendance():
    # Your existing code
    pass

if __name__ == '__main__':
    context = ('essl-sync/ssl/cert.pem', 'essl-sync/ssl/key.pem')
    app.run(host='0.0.0.0', port=5000, ssl_context=context)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler("sync.log", mode="a"),
        logging.StreamHandler(sys.stdout),   # also visible in Actions log
    ],
)
log = logging.getLogger(__name__)

# Configure logging
log_formatter = logging.Formatter('%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s')
log_file = 'essl-sync/sync.log'

# Create rotating log handler
log_handler = RotatingFileHandler(log_file, mode='a', maxBytes=5*1024*1024, backupCount=2, encoding=None, delay=0)
log_handler.setFormatter(log_formatter)
log_handler.setLevel(logging.INFO)

# Get the root logger and add handler
app.logger.addHandler(log_handler)
app.logger.setLevel(logging.INFO)

# Example usage
app.logger.info('Starting eSSL sync service')

# Add validation for required environment variables
required_vars = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'ESSL_DEVICE_IP', 'ESSL_DEVICE_PORT',
    'SESSION_SECRET'
]

missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")

@app.route('/health', methods=['GET'])
def health_check():
    try:
        # Check database connection
        db = get_db_connection()
        db.close()

        # Check device connectivity
        zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=TIMEOUT)
        conn = zk.connect()
        conn.disconnect()

        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'device': 'connected'
        }), 200

    except Exception as e:
        app.logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 500


def main():
    try:
        run_sync()
    except Exception as exc:
        log.exception("Fatal error during sync: %s", exc)
        sys.exit(1)   # non-zero exit → GitHub Actions step fails → retry/notify triggers
    sys.exit(0)

if __name__ == "__main__":
    main()
