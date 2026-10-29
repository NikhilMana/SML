"""Safety policy enforcement, schema allowlisting, and two-phase confirmation validation."""

import time
import uuid
from typing import Dict, Any, Tuple, Optional
from app.api.schemas.database_ops import CRUDOperationProposal

# Allowlisted entities and columns in the isolated eCommerce demo database
SCHEMA_ALLOWLIST = {
    "customers": {
        "columns": {"id", "name", "email", "city", "status", "created_at"},
        "required_for_insert": {"name", "email", "city"},
        "read_only": {"id", "created_at"},
    },
    "products": {
        "columns": {"id", "name", "category", "price", "stock", "is_active"},
        "required_for_insert": {"name", "category", "price"},
        "read_only": {"id"},
    },
    "orders": {
        "columns": {"id", "customer_id", "product_id", "quantity", "total_amount", "status", "order_date"},
        "required_for_insert": {"customer_id", "product_id", "total_amount"},
        "read_only": {"id", "order_date"},
    },
}

# Cache for pending destructive operation confirmations (token -> {proposal, expires_at})
_PENDING_CONFIRMATIONS: Dict[str, Dict[str, Any]] = {}
CONFIRMATION_TTL_SECONDS = 300  # 5 minutes validity


class OperationValidator:
    """Enforces strict security policies, input validation, and confirmation lifecycle."""

    @staticmethod
    def validate_proposal(proposal: CRUDOperationProposal) -> Tuple[bool, str]:
        """Validate operation against allowlist and safety rules."""
        table = proposal.target_entity.lower()
        if table not in SCHEMA_ALLOWLIST:
            return False, f"Entity '{table}' is not in the allowlisted schema."

        schema = SCHEMA_ALLOWLIST[table]
        valid_cols = schema["columns"]

        # Validate requested fields (only relevant for SELECT projections)
        if proposal.fields and proposal.operation_type == "SELECT":
            for field in proposal.fields:
                clean_field = field.split()[0].lower()
                if clean_field not in valid_cols and clean_field != "*":
                    return False, f"Column '{field}' is not a valid attribute of '{table}'."

        # Validate filter keys
        if proposal.filters:
            for filter_key in proposal.filters.keys():
                # Allow entity_id aliases (e.g. product_id on products)
                if filter_key in (f"{table.rstrip('s')}_id", f"{table}_id"):
                    continue
                base_col = filter_key.split("_")[0].lower()
                if base_col not in valid_cols and filter_key not in valid_cols:
                    return False, f"Filter condition on unknown column '{filter_key}' for table '{table}'."

        # Meaningful filters check (filters must contain at least one non-null, non-empty condition)
        has_meaningful_filters = bool(
            proposal.filters
            and any(v is not None and v != "" for v in proposal.filters.values())
        )

        # Specific operation rules
        if proposal.operation_type == "INSERT":
            if not proposal.data or not isinstance(proposal.data, dict):
                return False, f"INSERT operation requires a valid data object."
            required = schema["required_for_insert"]
            missing = required - set(proposal.data.keys())
            if missing:
                return False, f"Missing required fields for {table} insertion: {list(missing)}"

        elif proposal.operation_type == "UPDATE":
            if not has_meaningful_filters:
                return False, "SAFETY REJECTION: Bulk UPDATE without filter conditions is prohibited."
            if not proposal.data or not isinstance(proposal.data, dict):
                return False, "UPDATE operation requires new values in the 'data' field."

        elif proposal.operation_type == "DELETE":
            if not has_meaningful_filters:
                return False, "SAFETY REJECTION: Bulk DELETE without filter conditions is prohibited."

        return True, "Operation passed all safety policy checks."

    @staticmethod
    def assess_risk(proposal: CRUDOperationProposal) -> Tuple[bool, str]:
        """Determine whether the operation modifies state and requires manual user confirmation."""
        op = proposal.operation_type.upper()
        if op in {"UPDATE", "DELETE"}:
            return True, f"HIGH RISK: Destructive {op} mutation requires explicit user confirmation before committing."
        elif op == "INSERT":
            return False, "LOW RISK: Creation of new synthetic record."
        else:
            return False, "NO RISK: Read-only SELECT operation."

    @staticmethod
    def issue_confirmation(proposal: CRUDOperationProposal, preview_data: list) -> str:
        """Create a server-side confirmation token with an expiration timestamp."""
        token = str(uuid.uuid4())
        _PENDING_CONFIRMATIONS[token] = {
            "proposal": proposal,
            "preview_data": preview_data,
            "created_at": time.time(),
            "expires_at": time.time() + CONFIRMATION_TTL_SECONDS,
        }
        return token

    @staticmethod
    def retrieve_and_consume_confirmation(confirmation_id: str) -> Optional[CRUDOperationProposal]:
        """Validate and consume a confirmation token."""
        entry = _PENDING_CONFIRMATIONS.get(confirmation_id)
        if not entry:
            return None

        # Check expiration
        if time.time() > entry["expires_at"]:
            _PENDING_CONFIRMATIONS.pop(confirmation_id, None)
            return None

        # Consume token so it cannot be re-used
        _PENDING_CONFIRMATIONS.pop(confirmation_id, None)
        return entry["proposal"]


operation_validator = OperationValidator()
