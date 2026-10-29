"""Database session and connection management for both Application and Demo databases."""

from pathlib import Path
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

# Base class for SQLAlchemy ORM models
Base = declarative_base()
DemoBase = declarative_base()


def get_sqlite_path(db_url: str) -> str:
    """Normalize sqlite URL to absolute file path for reliable local handling."""
    if db_url.startswith("sqlite:///"):
        rel_or_abs = db_url.replace("sqlite:///", "")
        base_dir = Path(__file__).resolve().parent.parent.parent
        p = (base_dir / rel_or_abs).resolve() if not Path(rel_or_abs).is_absolute() else Path(rel_or_abs)
        p.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{p.as_posix()}"
    return db_url


# Application DB engine & session
app_db_url_clean = get_sqlite_path(settings.APP_DB_URL)
app_engine = create_engine(
    app_db_url_clean,
    connect_args={"check_same_thread": False},
    echo=False,
)
AppSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=app_engine)

# Demo eCommerce DB engine & session (Isolated from app DB)
demo_db_url_clean = get_sqlite_path(settings.DEMO_DB_URL)
demo_engine = create_engine(
    demo_db_url_clean,
    connect_args={"check_same_thread": False},
    echo=False,
)
DemoSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=demo_engine)


def get_app_db() -> Generator[Session, None, None]:
    """Dependency for providing application database sessions to FastAPI routes."""
    db = AppSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_demo_db() -> Generator[Session, None, None]:
    """Dependency for providing demo CRUD database sessions to FastAPI routes."""
    db = DemoSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_databases() -> None:
    """Create all tables in both databases if they do not exist."""
    # Ensure all models are imported before creating tables
    import app.db.models  # noqa: F401

    Base.metadata.create_all(bind=app_engine)
    DemoBase.metadata.create_all(bind=demo_engine)
