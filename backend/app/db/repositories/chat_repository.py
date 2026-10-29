"""Repository for persistent storage and retrieval of conversations and messages."""

import uuid
import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from app.db.models import Conversation, Message


class ChatRepository:
    """Encapsulates database operations for multi-turn conversations."""

    @staticmethod
    def create_conversation(
        db: Session,
        title: str = "New Conversation",
        model_tag: str = "qwen2.5:3b",
    ) -> Conversation:
        """Create and persist a new conversation."""
        conversation = Conversation(
            id=str(uuid.uuid4()),
            title=title,
            model_tag=model_tag,
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        return conversation

    @staticmethod
    def list_conversations(db: Session) -> List[Conversation]:
        """List all conversations ordered by recent activity."""
        stmt = select(Conversation).order_by(Conversation.updated_at.desc())
        return list(db.scalars(stmt).all())

    @staticmethod
    def get_conversation(db: Session, conversation_id: str) -> Optional[Conversation]:
        """Fetch conversation by ID including related messages."""
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        return db.scalar(stmt)

    @staticmethod
    def update_conversation(
        db: Session,
        conversation_id: str,
        title: Optional[str] = None,
        model_tag: Optional[str] = None,
    ) -> Optional[Conversation]:
        """Update conversation title or model tag."""
        conversation = ChatRepository.get_conversation(db, conversation_id)
        if not conversation:
            return None

        if title is not None:
            conversation.title = title.strip() or "Untitled Conversation"
        if model_tag is not None:
            conversation.model_tag = model_tag.strip()
        conversation.updated_at = datetime.datetime.now(datetime.timezone.utc)

        db.commit()
        db.refresh(conversation)
        return conversation

    @staticmethod
    def delete_conversation(db: Session, conversation_id: str) -> bool:
        """Delete conversation and all cascade messages."""
        conversation = ChatRepository.get_conversation(db, conversation_id)
        if not conversation:
            return False

        db.delete(conversation)
        db.commit()
        return True

    @staticmethod
    def add_message(
        db: Session,
        conversation_id: str,
        role: str,
        content: str,
        model_tag: Optional[str] = None,
        latency_ms: Optional[float] = None,
        ttft_ms: Optional[float] = None,
        tokens_per_second: Optional[float] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
    ) -> Message:
        """Append a message turn to the conversation and update the conversation timestamp."""
        message = Message(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            model_tag=model_tag,
            latency_ms=latency_ms,
            ttft_ms=ttft_ms,
            tokens_per_second=tokens_per_second,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        db.add(message)

        # Update parent conversation updated_at
        conversation = ChatRepository.get_conversation(db, conversation_id)
        if conversation:
            conversation.updated_at = datetime.datetime.now(datetime.timezone.utc)
            # If default title, generate a title from the first user message
            if role == "user" and (conversation.title == "New Conversation" or not conversation.title):
                clean_title = content.strip().split("\n")[0][:40]
                if clean_title:
                    conversation.title = clean_title

        db.commit()
        db.refresh(message)
        return message

    @staticmethod
    def clear_messages(db: Session, conversation_id: str) -> int:
        """Delete all messages in a conversation without deleting the conversation container."""
        stmt = delete(Message).where(Message.conversation_id == conversation_id)
        result = db.execute(stmt)

        conversation = ChatRepository.get_conversation(db, conversation_id)
        if conversation:
            conversation.updated_at = datetime.datetime.now(datetime.timezone.utc)

        db.commit()
        return result.rowcount


chat_repository = ChatRepository()
