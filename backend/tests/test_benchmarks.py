"""Unit and integration tests for the Unified Benchmark Engine."""

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import AppSessionLocal
from app.db.models import BenchmarkRun, BenchmarkResult
from app.services.benchmark_service import benchmark_service

client = TestClient(app)


def test_benchmark_datasets_exist_and_valid():
    """Verify all 3 standardized benchmark suites are present and properly formatted."""
    datasets_dir = Path(__file__).resolve().parent.parent / "app" / "evaluation" / "datasets"

    # Chatbot
    chat_file = datasets_dir / "chatbot_benchmarks.json"
    assert chat_file.exists()
    with open(chat_file, "r", encoding="utf-8") as f:
        chat_data = json.load(f)
        assert len(chat_data.get("tasks", [])) >= 8

    # RAG
    rag_file = datasets_dir / "rag_benchmarks.json"
    assert rag_file.exists()
    with open(rag_file, "r", encoding="utf-8") as f:
        rag_data = json.load(f)
        assert len(rag_data.get("tasks", [])) >= 4
        assert len(rag_data.get("sample_knowledge_base", [])) >= 1

    # Database
    db_file = datasets_dir / "database_benchmarks.json"
    assert db_file.exists()
    with open(db_file, "r", encoding="utf-8") as f:
        db_data = json.load(f)
        assert len(db_data.get("tasks", [])) >= 8


def test_benchmark_api_endpoints():
    """Verify runs listing, empty model validation, and summary structure."""
    # Empty models list rejected
    res_bad = client.post("/api/benchmarks/run", json={"model_tags": []})
    assert res_bad.status_code == 400

    # Get runs list
    res_runs = client.get("/api/benchmarks/runs")
    assert res_runs.status_code == 200
    assert isinstance(res_runs.json(), list)

    # Get summary
    res_summary = client.get("/api/benchmarks/summary")
    assert res_summary.status_code == 200
    assert "models" in res_summary.json()


def test_benchmark_csv_export():
    """Verify RFC-4180 CSV export generation."""
    db = AppSessionLocal()
    try:
        # Create a mock run and result
        run_id = "test-export-run"
        mock_run = BenchmarkRun(
            id=run_id,
            run_name="Test Export Run",
            suite_name="chat",
            model_tags_json=json.dumps(["qwen2.5:3b"]),
            status="completed",
            total_cases=1,
            completed_cases=1,
            failed_cases=0,
        )
        db.add(mock_run)

        mock_res = BenchmarkResult(
            id="test-res-1",
            run_id=run_id,
            model_tag="qwen2.5:3b",
            application_type="chat",
            task_id="chat_01",
            prompt="Hello world",
            score=1.0,
            is_success=True,
            latency_ms=120.5,
            tokens_per_second=65.2,
        )
        db.add(mock_res)
        db.commit()

        # Test service export
        csv_str = benchmark_service.export_run_csv(db, run_id)
        assert "Run ID" in csv_str
        assert "Tokens/Sec" in csv_str
        assert "qwen2.5:3b" in csv_str
        assert "120.5" in csv_str

        # Test API endpoint
        res = client.get(f"/api/benchmarks/export/{run_id}?format=csv")
        assert res.status_code == 200
        assert "text/csv" in res.headers["content-type"]
    finally:
        # Cleanup mock records
        db.query(BenchmarkResult).filter(BenchmarkResult.run_id == "test-export-run").delete()
        db.query(BenchmarkRun).filter(BenchmarkRun.id == "test-export-run").delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_ensure_rag_benchmark_document():
    """Verify that _ensure_rag_benchmark_document executes and indexes the benchmark document."""
    db = AppSessionLocal()
    try:
        doc_id = await benchmark_service._ensure_rag_benchmark_document(db)
        assert doc_id is not None
        assert len(doc_id) > 0
    finally:
        db.close()

