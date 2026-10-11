"""Entrypoint backward-compatibility shim for AgriConnect AI Service.

The canonical application entrypoint is defined in `app.main:app`.
Start the application using:
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"""

from app.main import app

__all__ = ["app"]
