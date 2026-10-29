"""Pytest configuration, fixtures, and mocked services for automated tests."""

import os
import sys
from pathlib import Path

# Ensure backend root is always on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from typing import Generator
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.main import app

from app.core.config import settings
from app.db.session import Base, DemoBase, get_app_db, get_demo_db
from app.db.seed import seed_demo_database

# Use in-memory SQLite for high-speed, isolated test execution
TEST_APP_DB_URL = "sqlite:///:memory:"
test_app_engine = create_engine(TEST_APP_DB_URL, connect_args={"check_same_thread": False})
TestingAppSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_app_engine)

TEST_DEMO_DB_URL = "sqlite:///:memory:"
test_demo_engine = create_engine(TEST_DEMO_DB_URL, connect_args={"check_same_thread": False})
TestingDemoSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_demo_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_databases():
    """Create all tables in memory once for the test session."""
    Base.metadata.create_all(bind=test_app_engine)
    DemoBase.metadata.create_all(bind=test_demo_engine)
    yield
    Base.metadata.drop_all(bind=test_app_engine)
    DemoBase.metadata.drop_all(bind=test_demo_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide a clean isolated application database session for a single test."""
    connection = test_app_engine.connect()
    transaction = connection.begin()
    session = TestingAppSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def demo_db_session() -> Generator[Session, None, None]:
    """Provide a seeded demo database session for CRUD tests."""
    connection = test_demo_engine.connect()
    transaction = connection.begin()
    session = TestingDemoSessionLocal(bind=connection)

    # Seed with standard eCommerce synthetic data
    seed_demo_database(session, force_reset=False)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session: Session, demo_db_session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with overridden database dependencies."""
    def override_get_app_db():
        return db_session

    def override_get_demo_db():
        return demo_db_session

    app.dependency_overrides[get_app_db] = override_get_app_db
    app.dependency_overrides[get_demo_db] = override_get_demo_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
