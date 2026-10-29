"""SQLAlchemy 2.x ORM models for Application database and Demo eCommerce database."""

import datetime
from typing import List, Optional
from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base, DemoBase


# ============================================================================
# Application Database Models (Conversations, Documents, Benchmarks, Logs)
# ============================================================================


class Conversation(Base):
    """Stores user conversations with local SLMs."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), default="New Conversation")
    model_tag: Mapped[str] = mapped_column(String(100), default="qwen2.5:3b")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc),
    )

    # Relationships
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    """Stores individual conversational turns, latency, and token metrics."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))  # "user", "assistant", "system"
    content: Mapped[str] = mapped_column(Text)
    model_tag: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Metrics captured during inference
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ttft_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tokens_per_second: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    # Relationship
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")


class Document(Base):
    """Metadata for uploaded and indexed RAG documents."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)  # pdf, txt, md, docx
    status: Mapped[str] = mapped_column(String(50), default="indexed")  # indexing, indexed, failed
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    # Relationships
    chunks: Mapped[List["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    """Granular passages extracted from documents and indexed in ChromaDB."""

    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Chroma vector ID
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    char_length: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    # Relationship
    document: Mapped["Document"] = relationship("Document", back_populates="chunks")


class BenchmarkRun(Base):
    """Orchestrates an evaluation run across models and test suites."""

    __tablename__ = "benchmark_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_name: Mapped[str] = mapped_column(String(255), nullable=False)
    suite_name: Mapped[str] = mapped_column(String(100), default="all")  # all, chat, rag, database
    model_tags_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON list of models evaluated
    status: Mapped[str] = mapped_column(String(50), default="running")  # running, completed, cancelled, failed
    total_cases: Mapped[int] = mapped_column(Integer, default=0)
    completed_cases: Mapped[int] = mapped_column(Integer, default=0)
    failed_cases: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    summary_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    results: Mapped[List["BenchmarkResult"]] = relationship(
        "BenchmarkResult", back_populates="run", cascade="all, delete-orphan"
    )


class BenchmarkResult(Base):
    """Detailed record of a single benchmark case evaluated against a specific model."""

    __tablename__ = "benchmark_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("benchmark_runs.id", ondelete="CASCADE"), index=True
    )
    model_tag: Mapped[str] = mapped_column(String(100), index=True)
    application_type: Mapped[str] = mapped_column(String(50), index=True)  # chat, rag, database
    task_id: Mapped[str] = mapped_column(String(100))
    prompt: Mapped[str] = mapped_column(Text)
    raw_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Performance metrics
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ttft_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tokens_per_second: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Evaluation outcomes
    is_success: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0.0 to 1.0 or normalized metric
    metrics_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Detailed sub-metrics
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    # Relationship
    run: Mapped["BenchmarkRun"] = relationship("BenchmarkRun", back_populates="results")


class DatabaseAssistantLog(Base):
    """Audit log of natural-language CRUD interpretations and policy checks."""

    __tablename__ = "database_assistant_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    operation_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # SELECT, INSERT, etc.
    target_entity: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # customers, products, orders
    parsed_operation_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    safety_check_passed: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    executed_success: Mapped[bool] = mapped_column(Boolean, default=False)
    execution_result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )


# ============================================================================
# Demo Database Models (Synthetic eCommerce for Controlled NL CRUD Testing)
# ============================================================================


class DemoCustomer(DemoBase):
    """Customer entity for natural-language queries and mutations."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active")  # active, inactive, vip
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    orders: Mapped[List["DemoOrder"]] = relationship(
        "DemoOrder", back_populates="customer", cascade="all, delete-orphan"
    )


class DemoProduct(DemoBase):
    """Product entity for inventory queries, price filters, and catalog updates."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    orders: Mapped[List["DemoOrder"]] = relationship("DemoOrder", back_populates="product")


class DemoOrder(DemoBase):
    """Order transaction entity linking customers to products."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="completed")  # pending, completed, cancelled
    order_date: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    customer: Mapped["DemoCustomer"] = relationship("DemoCustomer", back_populates="orders")
    product: Mapped["DemoProduct"] = relationship("DemoProduct", back_populates="orders")
