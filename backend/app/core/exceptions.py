"""Custom exception classes and HTTP exception handlers for Local SLM Laboratory."""

from fastapi import Request, status
from fastapi.responses import JSONResponse


class SLMLabException(Exception):
    """Base exception for all application errors."""

    def __init__(self, message: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR, details: dict = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class ModelUnavailableException(SLMLabException):
    """Raised when an Ollama model is missing, unloaded, or unreachable."""

    def __init__(self, model_name: str, message: str = None):
        msg = message or f"Model '{model_name}' is not available or Ollama service is unreachable."
        super().__init__(
            message=msg,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details={"model": model_name, "solution": f"Run 'ollama pull {model_name}' or start ollama service."},
        )


class ModelInferenceTimeoutException(SLMLabException):
    """Raised when local inference exceeds configured timeout."""

    def __init__(self, model_name: str, timeout_seconds: int):
        super().__init__(
            message=f"Inference on model '{model_name}' timed out after {timeout_seconds} seconds.",
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            details={"model": model_name, "timeout_seconds": timeout_seconds},
        )


class DocumentProcessingException(SLMLabException):
    """Raised when document ingestion or parsing fails."""

    def __init__(self, filename: str, reason: str):
        super().__init__(
            message=f"Failed to process document '{filename}': {reason}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"filename": filename, "reason": reason},
        )


class UnsafeDatabaseOperationException(SLMLabException):
    """Raised when natural-language CRUD proposal fails safety policy checks."""

    def __init__(self, reason: str, operation_proposal: dict = None):
        super().__init__(
            message=f"Unsafe database operation rejected: {reason}",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"reason": reason, "proposal": operation_proposal or {}},
        )


class ResourceConstraintException(SLMLabException):
    """Raised when memory or hardware constraints prevent an action."""

    def __init__(self, message: str):
        super().__init__(
            message=message,
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            details={"type": "resource_constraint"},
        )


async def slm_lab_exception_handler(request: Request, exc: SLMLabException) -> JSONResponse:
    """FastAPI global exception handler for SLMLabException."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.message,
            "details": exc.details,
            "path": request.url.path,
        },
    )
