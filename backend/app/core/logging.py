"""Structured logging setup for Local SLM Laboratory."""

import logging
import sys
from pathlib import Path


def setup_logging(debug: bool = True) -> logging.Logger:
    """Configure and return the root logger with clean formatting."""
    log_level = logging.DEBUG if debug else logging.INFO

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s:%(lineno)d] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)

    # Root logger
    logger = logging.getLogger("slm_lab")
    logger.setLevel(log_level)

    # Avoid duplicate handlers if reloaded
    if not logger.handlers:
        logger.addHandler(console_handler)

    # Keep third-party logs from dominating output
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    return logger


logger = setup_logging()
