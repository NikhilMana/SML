"""Service coordinating natural-language interpretation, validation, and safe CRUD execution."""

import json
import time
import uuid
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.core.exceptions import SLMLabException, UnsafeDatabaseOperationException
from app.core.logging import logger
from app.db.models import DatabaseAssistantLog
from app.db.repositories.demo_repository import demo_repository
from app.api.schemas.database_ops import CRUDOperationProposal, InterpretationResponse, ExecutionResult
from app.services.operation_validator import operation_validator, SCHEMA_ALLOWLIST
from app.services.ollama_service import ollama_service


class DatabaseAssistantService:
    """Interprets natural language into structured operations with strict safety guardrails."""

    INTERPRETATION_SYSTEM_PROMPT = (
        "You are a database query planning engine. "
        "Your task is to translate natural language user requests into a single structured CRUD operation object. "
        "You NEVER write raw SQL strings. You MUST output ONLY valid JSON matching this exact schema:\n"
        "{\n"
        '  "operation_type": "SELECT" | "INSERT" | "UPDATE" | "DELETE",\n'
        '  "target_entity": "customers" | "products" | "orders",\n'
        '  "filters": { "column_name": value, "price_gte": number, "price_lte": number, "name_like": "str" },\n'
        '  "fields": ["id", "name"],\n'
        '  "data": { "column_name": "new_val" },\n'
        '  "order_by": "column_asc" | "column_desc",\n'
        '  "limit": 10,\n'
        '  "explanation": "Concise summary of intended operation"\n'
        "}\n\n"
        "Available Tables and Columns:\n"
        "- customers: id (int), name (str), email (str), city (str), status (str)\n"
        "- products: id (int), name (str), category (str), price (float), stock (int), is_active (bool)\n"
        "- orders: id (int), customer_id (int), product_id (int), quantity (int), total_amount (float), status (str)\n\n"
        "CRITICAL RULES:\n"
        "1. For UPDATE or DELETE, filters MUST specify target records. Never emit an empty or null filter for destructive operations.\n"
        "2. The primary key of each table is 'id' (e.g. for products, use 'id': 1 rather than 'product_id': 1).\n"
        "3. Output ONLY the JSON object. Do not include markdown ticks, preamble, or apologies."
    )

    async def interpret_prompt(
        self,
        db: Session,
        prompt: str,
        model_tag: str = "qwen2.5:3b",
    ) -> InterpretationResponse:
        """Query SLM to produce a structured CRUD operation proposal and validate its safety."""
        start_time = time.perf_counter()

        # Query model with JSON format enforced
        try:
            inference = await ollama_service.chat_completion(
                model=model_tag,
                messages=[{"role": "user", "content": f"Convert to structured DB operation: '{prompt}'"}],
                temperature=0.1,  # Low temperature for deterministic planning
                system_prompt=self.INTERPRETATION_SYSTEM_PROMPT,
                json_format=True,
            )
            raw_text = inference["content"].strip()
            latency_ms = inference.get("latency_ms", 0.0)
        except Exception as e:
            logger.error(f"Inference error during DB interpretation: {e}")
            return InterpretationResponse(
                user_prompt=prompt,
                model_tag=model_tag,
                is_valid=False,
                safety_check_passed=False,
                requires_confirmation=False,
                risk_assessment="Execution failed",
                error_message=f"Model inference failed: {str(e)}",
            )

        # Parse JSON
        try:
            # Strip accidental code ticks
            clean_json = raw_text
            if "```" in clean_json:
                import re
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_json)
                if match:
                    clean_json = match.group(1).strip()

            parsed_dict = json.loads(clean_json)
            proposal = CRUDOperationProposal.model_validate(parsed_dict)
        except Exception as err:
            logger.warning(f"Failed to parse model output into CRUDOperationProposal: {raw_text}")
            return InterpretationResponse(
                user_prompt=prompt,
                model_tag=model_tag,
                is_valid=False,
                safety_check_passed=False,
                requires_confirmation=False,
                risk_assessment="Invalid structure",
                error_message=f"Model generated invalid operation JSON: {str(err)}",
                raw_model_output=raw_text,
                latency_ms=latency_ms,
            )

        # Safety & Policy Validation
        is_safe, safety_reason = operation_validator.validate_proposal(proposal)
        if not is_safe:
            return InterpretationResponse(
                user_prompt=prompt,
                model_tag=model_tag,
                proposal=proposal,
                is_valid=True,
                safety_check_passed=False,
                requires_confirmation=False,
                risk_assessment="REJECTED BY SAFETY POLICY",
                error_message=safety_reason,
                raw_model_output=raw_text,
                latency_ms=latency_ms,
            )

        # Risk assessment & confirmation requirement
        requires_confirm, risk_desc = operation_validator.assess_risk(proposal)

        preview_records = []
        confirmation_id = None
        if requires_confirm:
            # Preview rows that will be altered/deleted
            preview_records = demo_repository.preview_affected_records(db=db, proposal=proposal)
            confirmation_id = operation_validator.issue_confirmation(proposal, preview_records)

        return InterpretationResponse(
            user_prompt=prompt,
            model_tag=model_tag,
            proposal=proposal,
            is_valid=True,
            safety_check_passed=True,
            requires_confirmation=requires_confirm,
            confirmation_id=confirmation_id,
            affected_records_preview=preview_records,
            risk_assessment=risk_desc,
            raw_model_output=raw_text,
            latency_ms=latency_ms,
        )

    async def execute_safe_operation(
        self,
        demo_db: Session,
        app_db: Session,
        proposal: CRUDOperationProposal,
        user_prompt: str,
        model_tag: str,
    ) -> ExecutionResult:
        """Execute non-destructive operation (SELECT, INSERT) or pre-authorized mutation."""
        t0 = time.perf_counter()

        is_safe, reason = operation_validator.validate_proposal(proposal)
        if not is_safe:
            raise UnsafeDatabaseOperationException(reason)

        op = proposal.operation_type.upper()
        if op == "SELECT":
            data, sql_used = demo_repository.execute_select(demo_db, proposal)
            affected_count = len(data)
        elif op == "INSERT":
            data, affected_count, sql_used = demo_repository.execute_insert(demo_db, proposal)
        elif op == "UPDATE":
            data, affected_count, sql_used = demo_repository.execute_update(demo_db, proposal)
        elif op == "DELETE":
            data, affected_count, sql_used = demo_repository.execute_delete(demo_db, proposal)
        else:
            raise SLMLabException(f"Unsupported operation type {op}")

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

        # Generate natural language summary
        summary = f"Successfully executed {op} on {proposal.target_entity} ({affected_count} row(s) returned/affected)."

        # Audit Log
        audit_log = DatabaseAssistantLog(
            id=str(uuid.uuid4()),
            user_prompt=user_prompt,
            model_tag=model_tag,
            operation_type=op,
            target_entity=proposal.target_entity,
            parsed_operation_json=proposal.model_dump_json(),
            is_valid=True,
            safety_check_passed=True,
            requires_confirmation=False,
            is_confirmed=True,
            executed_success=True,
            execution_result_json=json.dumps({"rows": affected_count}),
            latency_ms=elapsed_ms,
        )
        app_db.add(audit_log)
        app_db.commit()

        return ExecutionResult(
            operation_type=op,
            target_entity=proposal.target_entity,
            affected_rows=affected_count,
            data=data,
            natural_language_summary=summary,
            executed_sql_parameterized=sql_used,
            latency_ms=elapsed_ms,
            is_success=True,
        )

    async def confirm_and_execute(
        self,
        demo_db: Session,
        app_db: Session,
        confirmation_id: str,
    ) -> ExecutionResult:
        """Verify server-side confirmation token and commit destructive mutation."""
        proposal = operation_validator.retrieve_and_consume_confirmation(confirmation_id)
        if not proposal:
            raise SLMLabException(
                "Invalid, expired, or already-used confirmation token. Re-run your request to generate a new confirmation token.",
                status_code=400,
            )

        return await self.execute_safe_operation(
            demo_db=demo_db,
            app_db=app_db,
            proposal=proposal,
            user_prompt="[Confirmed Destructive Mutation]",
            model_tag="system:confirmed",
        )


database_assistant_service = DatabaseAssistantService()
