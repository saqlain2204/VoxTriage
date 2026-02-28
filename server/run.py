"""VoxTriage Backend Server Entry Point.

Usage:
    python run.py
    python run.py --host 0.0.0.0 --port 8000 --reload
"""

import argparse
import sys

import uvicorn

from app.config import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="VoxTriage Backend Server")
    parser.add_argument("--host", type=str, default=None, help="Bind host")
    parser.add_argument("--port", type=int, default=None, help="Bind port")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument("--workers", type=int, default=1, help="Number of workers")
    parser.add_argument("--log-level", type=str, default=None, help="Uvicorn log level")
    args = parser.parse_args()

    settings = get_settings()

    host = args.host or settings.host
    port = args.port or settings.port
    log_level = (args.log_level or settings.log_level).lower()

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=args.reload,
        workers=args.workers,
        log_level=log_level,
        ws_ping_interval=30,
        ws_ping_timeout=10,
        ws_max_size=10 * 1024 * 1024,
    )


if __name__ == "__main__":
    main()
