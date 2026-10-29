"""API endpoints for Natural-Language Database Assistant, schema explorer, and safe CRUD."""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from app.db.session import get_app_db, get_demo_db
from app.db.models import DatabaseAssistantLog
from app.db.seed import seed_demo_database
from app.db.repositories.demo_repository import demo_repository
from app.api.schemas.database_ops import (
    InterpretRequest,
    InterpretationResponse,
    ConfirmOperationRequest,
    ExecutionResult,
    CRUDOperationProposal,
    DatabaseSchemaResponse,
    TableSchemaInfo,
    TableColumnInfo,
)
from app.services.database_assistant_service import database_assistant_service
from app.core.logging import logger

router = APIRouter(prefix="/database", tags=["database-assistant"])


class ExecuteDirectRequest(BaseModel):
    proposal: CRUDOperationProposal
    user_prompt: str
    model_tag: str


@router.get("/schema", response_model=DatabaseSchemaResponse)
async def get_database_schema(db: Session = Depends(get_demo_db)):
    """Return schema, row counts, and sample records for the eCommerce demo database."""
    summaries = demo_repository.get_schema_summary(db)
    table_infos = []
    for s in summaries:
        cols = [TableColumnInfo(**c) for c in s["columns"]]
        table_infos.append(
            TableSchemaInfo(
                table_name=s["table_name"],
                columns=cols,
                row_count=s["row_count"],
                sample_records=s["sample_records"],
            )
        )
    return DatabaseSchemaResponse(database_name="demo_ecommerce.db", tables=table_infos)


@router.post("/interpret", response_model=InterpretationResponse)
async def interpret_instruction(
    request: InterpretRequest,
    db: Session = Depends(get_demo_db),
):
    """Translate natural language prompt into a structured, validated CRUD proposal."""
    return await database_assistant_service.interpret_prompt(
        db=db,
        prompt=request.prompt,
        model_tag=request.model_tag or "qwen2.5:3b",
    )


@router.post("/execute", response_model=ExecutionResult)
async def execute_operation(
    request: ExecuteDirectRequest,
    demo_db: Session = Depends(get_demo_db),
    app_db: Session = Depends(get_app_db),
):
    """Execute a validated non-destructive operation (SELECT, INSERT)."""
    return await database_assistant_service.execute_safe_operation(
        demo_db=demo_db,
        app_db=app_db,
        proposal=request.proposal,
        user_prompt=request.user_prompt,
        model_tag=request.model_tag,
    )


@router.post("/confirm", response_model=ExecutionResult)
async def confirm_and_execute(
    request: ConfirmOperationRequest,
    demo_db: Session = Depends(get_demo_db),
    app_db: Session = Depends(get_app_db),
):
    """Commit a pending destructive mutation using a verified server-issued confirmation token."""
    return await database_assistant_service.confirm_and_execute(
        demo_db=demo_db,
        app_db=app_db,
        confirmation_id=request.confirmation_id,
    )


@router.post("/reset-demo")
async def reset_demo_database_endpoint(db: Session = Depends(get_demo_db)):
    """Reset the isolated demo eCommerce database back to its original synthetic state."""
    res = seed_demo_database(db, force_reset=True)
    logger.info("Demo database reset and re-seeded successfully.")
    return {"status": "success", "message": "Demo database re-seeded successfully", "details": res}


@router.get("/logs")
async def get_database_audit_logs(
    limit: int = 50,
    app_db: Session = Depends(get_app_db),
):
    """Retrieve audit history of interpreted and executed database operations."""
    stmt = select(DatabaseAssistantLog).order_by(desc(DatabaseAssistantLog.created_at)).limit(limit)
    logs = app_db.scalars(stmt).all()
    return [
        {
            "id": l.id,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "user_prompt": l.user_prompt,
            "model_tag": l.model_tag,
            "operation_type": l.operation_type,
            "target_entity": l.target_entity,
            "parsed_operation": l.parsed_operation_json,
            "is_valid": l.is_valid,
            "safety_check_passed": l.safety_check_passed,
            "is_confirmed": l.is_confirmed,
            "executed_success": l.executed_success,
            "latency_ms": l.latency_ms,
        }
        for l in logs
    ]
