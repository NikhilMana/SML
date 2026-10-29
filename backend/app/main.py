"""Main FastAPI application entrypoint for Local SLM Laboratory."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import logger
from app.core.exceptions import SLMLabException, slm_lab_exception_handler
from app.db.session import init_databases
from app.api.routes import health, models, chat, rag, database_assistant, benchmarks


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager initializing storage, database tables, and logging."""
    logger.info("Initializing Local SLM Laboratory backend...")
    settings.ensure_directories()
    init_databases()
    logger.info(f"Databases initialized. App DB: {settings.APP_DB_URL}, Demo DB: {settings.DEMO_DB_URL}")
    yield
    logger.info("Local SLM Laboratory backend shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Educational benchmarking and experimentation laboratory for Small Language Models (SLMs).",
    lifespan=lifespan,
)

# CORS middleware for local frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",  # Local development flexibility
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(SLMLabException, slm_lab_exception_handler)

# Include API routers
app.include_router(health.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
app.include_router(database_assistant.router, prefix="/api")
app.include_router(benchmarks.router, prefix="/api")


@app.get("/api")
async def root_api():
    """Root API endpoint returning system identity."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "docs_url": "/docs",
    }
