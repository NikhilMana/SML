"""Unit and integration tests for the Natural-Language Database Assistant."""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import DemoSessionLocal, AppSessionLocal
from app.services.operation_validator import operation_validator
from app.api.schemas.database_ops import CRUDOperationProposal, InterpretationResponse
from app.db.repositories.demo_repository import demo_repository
from app.db.seed import seed_demo_database
from app.evaluation.evaluators.database_evaluator import DatabaseEvaluator

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_demo_db():
    """Ensure demo database has clean synthetic data for each test."""
    db = DemoSessionLocal()
    seed_demo_database(db, force_reset=True)
    db.close()


def test_operation_validator_allowlist():
    """Verify that only explicitly allowlisted tables and columns are permitted."""
    valid_proposal = CRUDOperationProposal(
        operation_type="SELECT",
        target_entity="customers",
        filters={"city": "Bengaluru"},
        explanation="Select Bengaluru customers",
    )
    is_safe, reason = operation_validator.validate_proposal(valid_proposal)
    assert is_safe is True

    # Unknown table
    invalid_table_proposal = CRUDOperationProposal(
        operation_type="SELECT",
        target_entity="customers",  # Pydantic validates literal, but let's test validator logic
        filters={"unknown_col": "val"},
        explanation="Test invalid col",
    )
    # Target entity is customer, unknown col
    is_safe, reason = operation_validator.validate_proposal(invalid_table_proposal)
    assert is_safe is False
    assert "unknown column" in reason.lower()


def test_operation_validator_destructive_safety():
    """Verify that UPDATE and DELETE without filters are strictly rejected."""
    unsafe_delete = CRUDOperationProposal(
        operation_type="DELETE",
        target_entity="orders",
        filters={},
        explanation="Delete all orders",
    )
    is_safe, reason = operation_validator.validate_proposal(unsafe_delete)
    assert is_safe is False
    assert "without filter conditions" in reason.lower()

    safe_delete = CRUDOperationProposal(
        operation_type="DELETE",
        target_entity="orders",
        filters={"id": 1},
        explanation="Delete order 1",
    )
    is_safe, reason = operation_validator.validate_proposal(safe_delete)
    assert is_safe is True

    # Verify that filters with null or empty values are also rejected as unsafe bulk mutations
    null_filter_delete = CRUDOperationProposal(
        operation_type="DELETE",
        target_entity="customers",
        filters={"id": None},
        explanation="Delete all customers with null id",
    )
    is_safe, reason = operation_validator.validate_proposal(null_filter_delete)
    assert is_safe is False
    assert "without filter conditions" in reason.lower()

    # Verify Pydantic schema sanitizes negative limits and defaults explanation
    sanitized_op = CRUDOperationProposal.model_validate({
        "operation_type": "DELETE",
        "target_entity": "orders",
        "filters": {"order_id": 3},
        "limit": -1,
    })
    assert sanitized_op.limit == 10
    assert sanitized_op.explanation == "No explanation provided"
    assert sanitized_op.filters == {"id": 3}  # Alias normalized from order_id to id


def test_confirmation_token_lifecycle():
    """Verify server-side issuance and consumption of confirmation tokens."""
    proposal = CRUDOperationProposal(
        operation_type="UPDATE",
        target_entity="products",
        filters={"id": 2},
        data={"stock": 99},
        explanation="Update product 2 stock",
    )
    token = operation_validator.issue_confirmation(proposal, [{"id": 2, "name": "Monitor"}])
    assert token is not None

    # Retrieve and consume
    retrieved = operation_validator.retrieve_and_consume_confirmation(token)
    assert retrieved is not None
    assert retrieved.target_entity == "products"

    # Consuming again must fail (single-use guarantee)
    second_attempt = operation_validator.retrieve_and_consume_confirmation(token)
    assert second_attempt is None


def test_demo_repository_crud():
    """Verify repository executes parameterized SELECT, INSERT, UPDATE, and DELETE."""
    db = DemoSessionLocal()
    try:
        # 1. SELECT
        select_prop = CRUDOperationProposal(
            operation_type="SELECT",
            target_entity="customers",
            filters={"city": "Bengaluru"},
            limit=5,
            explanation="Bengaluru customers",
        )
        records, sql = demo_repository.execute_select(db, select_prop)
        assert len(records) > 0
        assert all(r["city"].lower() == "bengaluru" for r in records)

        # 2. INSERT
        insert_prop = CRUDOperationProposal(
            operation_type="INSERT",
            target_entity="products",
            data={
                "name": "Test Wireless Mouse",
                "category": "Accessories",
                "price": 49.99,
                "stock": 100,
                "is_active": True,
            },
            explanation="Insert new test mouse",
        )
        new_records, count, sql = demo_repository.execute_insert(db, insert_prop)
        assert count == 1
        inserted_id = new_records[0]["id"]
        assert inserted_id is not None

        # 3. UPDATE
        update_prop = CRUDOperationProposal(
            operation_type="UPDATE",
            target_entity="products",
            filters={"id": inserted_id},
            data={"price": 39.99, "stock": 80},
            explanation="Update price and stock",
        )
        updated_records, count, sql = demo_repository.execute_update(db, update_prop)
        assert count == 1
        assert updated_records[0]["price"] == 39.99
        assert updated_records[0]["stock"] == 80

        # 4. DELETE
        delete_prop = CRUDOperationProposal(
            operation_type="DELETE",
            target_entity="products",
            filters={"id": inserted_id},
            explanation="Delete test mouse",
        )
        deleted_records, count, sql = demo_repository.execute_delete(db, delete_prop)
        assert count == 1
        assert deleted_records[0]["id"] == inserted_id
    finally:
        db.close()


def test_api_schema_and_reset():
    """Verify schema inspection and database reset endpoints."""
    # GET /api/database/schema
    res = client.get("/api/database/schema")
    assert res.status_code == 200
    data = res.json()
    assert data["database_name"] == "demo_ecommerce.db"
    assert len(data["tables"]) == 3
    table_names = [t["table_name"] for t in data["tables"]]
    assert "customers" in table_names
    assert "products" in table_names
    assert "orders" in table_names

    # POST /api/database/reset-demo
    reset_res = client.post("/api/database/reset-demo")
    assert reset_res.status_code == 200
    assert reset_res.json()["status"] == "success"


def test_database_evaluator():
    """Verify deterministic evaluator for query accuracy and safety violation blocks."""
    # Test valid SELECT evaluation
    task_select = {
        "task_id": "test_01",
        "expected_operation": "SELECT",
        "expected_entity": "customers",
        "requires_confirmation": False,
        "should_pass_safety": True,
    }
    interp_valid = InterpretationResponse(
        user_prompt="Show customers",
        model_tag="test-slm",
        proposal=CRUDOperationProposal(
            operation_type="SELECT",
            target_entity="customers",
            filters={"city": "Bengaluru"},
            explanation="Select customers",
        ),
        is_valid=True,
        safety_check_passed=True,
        requires_confirmation=False,
        risk_assessment="Low risk",
    )
    result = DatabaseEvaluator.evaluate(task_select, interp_valid)
    assert result["is_success"] is True
    assert result["score"] >= 0.8

    # Test safety block evaluation
    task_unsafe = {
        "task_id": "test_02",
        "expected_operation": "DELETE",
        "expected_entity": "customers",
        "should_pass_safety": False,
    }
    interp_blocked = InterpretationResponse(
        user_prompt="Delete all customers",
        model_tag="test-slm",
        proposal=None,
        is_valid=False,
        safety_check_passed=False,
        requires_confirmation=False,
        risk_assessment="REJECTED BY SAFETY POLICY",
        error_message="Destructive operation lacks target filters",
    )
    result_blocked = DatabaseEvaluator.evaluate(task_unsafe, interp_blocked)
    assert result_blocked["is_success"] is True
    assert result_blocked["score"] == 1.0
