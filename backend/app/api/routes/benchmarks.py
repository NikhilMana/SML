"""API routes for launching benchmark suites, tracking runs, querying comparison summaries, and exporting data."""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db.session import get_app_db
from app.services.benchmark_service import benchmark_service

router = APIRouter(prefix="/benchmarks", tags=["benchmarks"])


class CreateBenchmarkRunRequest(BaseModel):
    model_tags: List[str] = Field(
        default=["qwen2.5:3b"],
        description="List of model tags to evaluate sequentially (e.g. ['qwen2.5:3b', 'llama3.2:3b'])",
    )
    suite_name: str = Field(
        default="all",
        description="Suite to evaluate: 'all', 'chat', 'rag', or 'database'",
    )
    run_name: Optional[str] = Field(
        None,
        description="Optional human-readable label for this benchmark run",
    )


@router.post("/run")
async def start_benchmark_run(
    request: CreateBenchmarkRunRequest,
    db: Session = Depends(get_app_db),
):
    """Trigger a new sequential benchmark evaluation across selected models."""
    if not request.model_tags:
        raise HTTPException(status_code=400, detail="At least one model_tag must be provided.")

    run_id = await benchmark_service.create_run(
        app_db=db,
        model_tags=request.model_tags,
        suite_name=request.suite_name,
        run_name=request.run_name,
    )
    return {"run_id": run_id, "status": "running", "message": "Sequential benchmark run initiated in background"}


@router.get("/runs")
async def list_benchmark_runs(
    limit: int = 20,
    db: Session = Depends(get_app_db),
):
    """Retrieve history of benchmark runs with progress and scores."""
    return benchmark_service.get_runs(app_db=db, limit=limit)


@router.get("/runs/{run_id}")
async def get_benchmark_run(
    run_id: str,
    db: Session = Depends(get_app_db),
):
    """Get detailed telemetry and task evaluations for a specific benchmark run."""
    details = benchmark_service.get_run_details(app_db=db, run_id=run_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"Benchmark run '{run_id}' not found")
    return details


@router.get("/summary")
async def get_benchmark_comparison_summary(
    db: Session = Depends(get_app_db),
):
    """Retrieve aggregated cross-model comparative benchmarks for dashboard charts and tables."""
    return benchmark_service.get_comparison_summary(app_db=db)


@router.get("/export/{run_id}")
async def export_benchmark_results(
    run_id: str,
    format: str = Query("json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_app_db),
):
    """Export benchmark run results to JSON, CSV, or PDF format."""
    details = benchmark_service.get_run_details(app_db=db, run_id=run_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"Benchmark run '{run_id}' not found")

    if format == "csv":
        csv_data = benchmark_service.export_run_csv(app_db=db, run_id=run_id)
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=benchmark_{run_id}.csv"},
        )

    if format == "pdf":
        pdf_data = benchmark_service.export_run_pdf(app_db=db, run_id=run_id)
        return Response(
            content=pdf_data,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=benchmark_analysis_{run_id}.pdf"},
        )

    return details


@router.delete("/runs/{run_id}")
async def delete_benchmark_run(
    run_id: str,
    db: Session = Depends(get_app_db),
):
    """Delete a benchmark run and its associated task records."""
    from sqlalchemy import select
    from app.db.models import BenchmarkRun

    run = db.scalar(select(BenchmarkRun).where(BenchmarkRun.id == run_id))
    if not run:
        raise HTTPException(status_code=404, detail="Benchmark run not found")
    db.delete(run)
    db.commit()
    return {"status": "deleted", "run_id": run_id}

