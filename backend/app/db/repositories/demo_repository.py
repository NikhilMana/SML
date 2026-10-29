"""SQLAlchemy execution repository translating structured CRUD proposals into parameterized queries."""

from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, desc, asc
from app.db.models import DemoCustomer, DemoProduct, DemoOrder
from app.api.schemas.database_ops import CRUDOperationProposal

MODEL_MAP = {
    "customers": DemoCustomer,
    "products": DemoProduct,
    "orders": DemoOrder,
}


class DemoRepository:
    """Safely constructs and executes ORM queries against the isolated eCommerce demo database."""

    @staticmethod
    def _model_to_dict(obj: Any) -> Dict[str, Any]:
        """Convert SQLAlchemy model instance to clean JSON-serializable dict."""
        res = {}
        for col in obj.__table__.columns:
            val = getattr(obj, col.name)
            if hasattr(val, "isoformat"):
                val = val.isoformat()
            res[col.name] = val
        return res

    @classmethod
    def _apply_filters(cls, stmt: Any, model: Any, filters: Dict[str, Any]) -> Any:
        """Apply parameterized filter clauses safely without string concatenation."""
        conditions = []
        for key, value in filters.items():
            # Normalize entity_id aliases to 'id' if matching target model (e.g. product_id on products)
            if key in (f"{model.__tablename__.rstrip('s')}_id", f"{model.__tablename__}_id") and hasattr(model, "id"):
                key = "id"

            if not hasattr(model, key):
                # Handle operators like price_gte, price_lte, name_like
                if "_" in key:
                    col_name, op = key.rsplit("_", 1)
                    if hasattr(model, col_name):
                        col = getattr(model, col_name)
                        if op == "gte":
                            conditions.append(col >= value)
                        elif op == "lte":
                            conditions.append(col <= value)
                        elif op == "gt":
                            conditions.append(col > value)
                        elif op == "lt":
                            conditions.append(col < value)
                        elif op == "like":
                            conditions.append(col.ilike(f"%{value}%"))
                continue

            col = getattr(model, key)
            if isinstance(value, str):
                conditions.append(col.ilike(value))
            else:
                conditions.append(col == value)

        if conditions:
            stmt = stmt.where(and_(*conditions))
        return stmt

    @classmethod
    def execute_select(
        cls,
        db: Session,
        proposal: CRUDOperationProposal,
    ) -> Tuple[List[Dict[str, Any]], str]:
        """Execute parameterized SELECT query with limits and sorting."""
        model = MODEL_MAP[proposal.target_entity.lower()]
        stmt = select(model)

        # Filters
        if proposal.filters:
            stmt = cls._apply_filters(stmt, model, proposal.filters)

        # Sorting
        if proposal.order_by:
            parts = proposal.order_by.lower().split("_")
            col_name = parts[0]
            direction = parts[1] if len(parts) > 1 else "asc"
            if hasattr(model, col_name):
                col = getattr(model, col_name)
                stmt = stmt.order_by(desc(col) if direction == "desc" else asc(col))

        # Enforce max limit
        limit_val = min(proposal.limit or 10, 50)
        stmt = stmt.limit(limit_val)

        # Execute
        results = db.scalars(stmt).all()
        data = [cls._model_to_dict(r) for r in results]
        parameterized_sql = str(stmt.compile(compile_kwargs={"literal_binds": False}))

        return data, parameterized_sql

    @classmethod
    def preview_affected_records(
        cls,
        db: Session,
        proposal: CRUDOperationProposal,
    ) -> List[Dict[str, Any]]:
        """Fetch records that would be altered or deleted by a mutation."""
        model = MODEL_MAP[proposal.target_entity.lower()]
        stmt = select(model)
        if proposal.filters:
            stmt = cls._apply_filters(stmt, model, proposal.filters)
        stmt = stmt.limit(20)
        results = db.scalars(stmt).all()
        return [cls._model_to_dict(r) for r in results]

    @classmethod
    def execute_insert(
        cls,
        db: Session,
        proposal: CRUDOperationProposal,
    ) -> Tuple[List[Dict[str, Any]], int, str]:
        """Insert a validated new record into the target table."""
        model = MODEL_MAP[proposal.target_entity.lower()]
        clean_data = {k: v for k, v in proposal.data.items() if hasattr(model, k) and k != "id"}

        new_obj = model(**clean_data)
        db.add(new_obj)
        db.commit()
        db.refresh(new_obj)

        inserted_data = [cls._model_to_dict(new_obj)]
        sql_desc = f"INSERT INTO {proposal.target_entity} ({', '.join(clean_data.keys())}) VALUES (:params)"
        return inserted_data, 1, sql_desc

    @classmethod
    def execute_update(
        cls,
        db: Session,
        proposal: CRUDOperationProposal,
    ) -> Tuple[List[Dict[str, Any]], int, str]:
        """Apply updates to rows matching filter conditions."""
        model = MODEL_MAP[proposal.target_entity.lower()]
        stmt = select(model)
        if proposal.filters:
            stmt = cls._apply_filters(stmt, model, proposal.filters)

        records = list(db.scalars(stmt).all())
        if not records:
            return [], 0, f"UPDATE {proposal.target_entity} (0 rows matched)"

        clean_data = {k: v for k, v in proposal.data.items() if hasattr(model, k) and k != "id"}
        updated_rows = []
        for obj in records:
            for k, v in clean_data.items():
                setattr(obj, k, v)
            updated_rows.append(obj)

        db.commit()
        for obj in updated_rows:
            db.refresh(obj)

        data = [cls._model_to_dict(r) for r in updated_rows]
        sql_desc = f"UPDATE {proposal.target_entity} SET {', '.join([f'{k} = :{k}' for k in clean_data.keys()])} WHERE :conditions"
        return data, len(data), sql_desc

    @classmethod
    def execute_delete(
        cls,
        db: Session,
        proposal: CRUDOperationProposal,
    ) -> Tuple[List[Dict[str, Any]], int, str]:
        """Delete records matching filter conditions."""
        model = MODEL_MAP[proposal.target_entity.lower()]
        stmt = select(model)
        if proposal.filters:
            stmt = cls._apply_filters(stmt, model, proposal.filters)

        records = list(db.scalars(stmt).all())
        if not records:
            return [], 0, f"DELETE FROM {proposal.target_entity} (0 rows matched)"

        deleted_snapshots = [cls._model_to_dict(r) for r in records]
        for obj in records:
            db.delete(obj)

        db.commit()
        sql_desc = f"DELETE FROM {proposal.target_entity} WHERE :conditions"
        return deleted_snapshots, len(deleted_snapshots), sql_desc

    @classmethod
    def get_schema_summary(cls, db: Session) -> List[Dict[str, Any]]:
        """Return table schemas, row counts, and sample records for the UI explorer."""
        summaries = []
        for name, model in MODEL_MAP.items():
            cols = [
                {
                    "name": col.name,
                    "type": str(col.type),
                    "primary_key": col.primary_key,
                    "nullable": col.nullable,
                }
                for col in model.__table__.columns
            ]
            row_count = db.query(model).count()
            samples = db.query(model).limit(3).all()
            summaries.append({
                "table_name": name,
                "columns": cols,
                "row_count": row_count,
                "sample_records": [cls._model_to_dict(s) for s in samples],
            })
        return summaries


demo_repository = DemoRepository()
