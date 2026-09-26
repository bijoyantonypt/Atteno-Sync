# essl-sync/sync.py (relevant excerpt)

import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.FileHandler("sync.log", mode="a"),
        logging.StreamHandler(sys.stdout),   # also visible in Actions log
    ],
)
log = logging.getLogger(__name__)

def main():
    try:
        run_sync()
    except Exception as exc:
        log.exception("Fatal error during sync: %s", exc)
        sys.exit(1)   # non-zero exit → GitHub Actions step fails → retry/notify triggers
    sys.exit(0)

if __name__ == "__main__":
    main()
