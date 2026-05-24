from __future__ import annotations

"""Shared FastAPI dependencies."""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User


def get_current_user_id(request: Request) -> str:
    """Extract user_id from request.state (set by AuthMiddleware)."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail={"error": True, "code": "UNAUTHORIZED", "message": "Authentication required", "status": 401})
    return user_id


def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> User:
    """Fetch the authenticated user row from the DB."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail={"error": True, "code": "UNAUTHORIZED", "message": "User not found", "status": 401})
    return user
