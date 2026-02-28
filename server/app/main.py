import asyncio
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.logging_config import get_logger, setup_logging
from app.middleware.request_logging import RequestLoggingMiddleware
from app.routers import health_router, triage_router, websocket_router
from app.routers import auth_router, patient_router, ai_router, audit_router
from app.services.mysql_db import MySQLPatientDB
from app.services.triage_engine import TriageEngine

import sys

# Global application state accessible by routers
app_state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle manager."""
    settings = get_settings()
    setup_logging(log_level=settings.log_level, log_format=settings.log_format)
    logger = get_logger("app.main")

    logger.info(
        "application_starting",
        app_name=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        voxtral_model=settings.voxtral_model,
        triage_model=settings.triage_model,
    )

    # Initialize services
    engine = TriageEngine(settings)
    app_state["triage_engine"] = engine

    # MySQL patient database (required — no in-memory fallback)
    db = MySQLPatientDB()
    try:
        await db.connect()
        logger.info("mysql_database_connected")
    except Exception as exc:
        logger.error("mysql_connection_failed", error=str(exc))
        print(f"\n❌ MySQL connection failed: {exc}")
        print("Make sure MySQL is running and the credentials in .env are correct.")
        sys.exit(1)
    app_state["patient_db"] = db

    # Start session cleanup background task
    cleanup_task = asyncio.create_task(engine.start_cleanup_loop())
    app_state["cleanup_task"] = cleanup_task

    logger.info("application_ready")

    yield

    # Shutdown
    logger.info("application_shutting_down")

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

    await engine.shutdown()
    await db.close()
    app_state.clear()

    logger.info("application_stopped")


def create_app() -> FastAPI:
    """Factory function to create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Real-time paramedic copilot that uses Mistral Voxtral for live audio "
            "transcription and Mistral Large for structured medical triage extraction."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request logging
    app.add_middleware(RequestLoggingMiddleware)

    # Routers
    app.include_router(health_router.router)
    app.include_router(auth_router.router)
    app.include_router(patient_router.router)
    app.include_router(ai_router.router)
    app.include_router(audit_router.router)
    app.include_router(triage_router.router)
    app.include_router(websocket_router.router)

    return app


app = create_app()
