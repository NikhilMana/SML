"""Pydantic schemas for natural-language database CRUD operations and confirmation."""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class CRUDOperationProposal(BaseModel):
    """Structured database operation produced by the language model and validated in Python."""

    operation_type: Literal["SELECT", "INSERT", "UPDATE", "DELETE"] = Field(
        ..., description="CRUD operation type"
    )
    target_entity: Literal["customers", "products", "orders"] = Field(
        ..., description="Allowlisted target database table"
    )
    filters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Filter conditions (e.g. {'city': 'Bengaluru'} or {'id': 4})",
    )
    fields: Optional[List[str]] = Field(
        None, description="Specific columns to retrieve or display"
    )
    data: Optional[Dict[str, Any]] = Field(
        None, description="Data payload for INSERT or UPDATE operations"
    )
    order_by: Optional[str] = Field(
        None, description="Optional sort column and direction, e.g. 'price_desc'"
    )
    limit: Optional[int] = Field(
        10, ge=1, le=50, description="Maximum row limit to prevent excessive query responses"
    )
    explanation: Optional[str] = Field(
        "No explanation provided", description="Model's concise reasoning for the proposed operation"
    )

    model_config = ConfigDict(extra="ignore")

    @field_validator("limit", mode="before")
    @classmethod
    def sanitize_limit(cls, v: Any) -> Optional[int]:
        """Sanitize negative limits, string values, or 0 to safe positive bounds."""
        if v is None or v == "":
            return 10
        try:
            val = int(v)
            if val <= 0:
                return 10
            return min(val, 50)
        except (ValueError, TypeError):
            return 10

    @model_validator(mode="before")
    @classmethod
    def sanitize_payload(cls, data: Any) -> Any:
        """Normalize primary key aliases (e.g. product_id -> id) and clean dummy fields."""
        if not isinstance(data, dict):
            return data

        target = str(data.get("target_entity", "")).lower()
        filters = data.get("filters")
        if isinstance(filters, dict):
            # Map common entity_id aliases to 'id'
            alias = f"{target.rstrip('s')}_id"
            if alias in filters and "id" not in filters:
                filters["id"] = filters.pop(alias)
            elif f"{target}_id" in filters and "id" not in filters:
                filters["id"] = filters.pop(f"{target}_id")

        # For UPDATE and DELETE, ignore placeholder fields like ['col1', 'col2']
        op = str(data.get("operation_type", "")).upper()
        if op in ("UPDATE", "DELETE") and "fields" in data:
            data["fields"] = None

        return data


class InterpretRequest(BaseModel):
    """User natural-language instruction to query or mutate the database."""

    prompt: str = Field(..., min_length=2, description="Natural language database command")
    model_tag: Optional[str] = Field("qwen2.5:3b", description="Model used for interpretation")


class InterpretationResponse(BaseModel):
    """Structured interpretation, safety check status, and confirmation token."""

    user_prompt: str
    model_tag: str
    proposal: Optional[CRUDOperationProposal] = None
    is_valid: bool
    safety_check_passed: bool
    requires_confirmation: bool
    confirmation_id: Optional[str] = None
    affected_records_preview: List[Dict[str, Any]] = []
    risk_assessment: str
    error_message: Optional[str] = None
    raw_model_output: Optional[str] = None
    latency_ms: Optional[float] = None


class ConfirmOperationRequest(BaseModel):
    """Submission of a server-validated confirmation ID to execute a destructive mutation."""

    confirmation_id: str = Field(..., description="Server-issued confirmation UUID token")


class ExecutionResult(BaseModel):
    """Result of an executed database query or committed mutation."""

    operation_type: str
    target_entity: str
    affected_rows: int
    data: List[Dict[str, Any]] = []
    natural_language_summary: str
    executed_sql_parameterized: str
    latency_ms: float
    is_success: bool


class TableColumnInfo(BaseModel):
    name: str
    type: str
    primary_key: bool
    nullable: bool


class TableSchemaInfo(BaseModel):
    table_name: str
    columns: List[TableColumnInfo]
    row_count: int
    sample_records: List[Dict[str, Any]]


class DatabaseSchemaResponse(BaseModel):
    database_name: str
    tables: List[TableSchemaInfo]
