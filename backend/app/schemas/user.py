from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


# ── Registration / Login ────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


# ── Output ──────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    email_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Tokens ──────────────────────────────────────────────────────────────────

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Account management ──────────────────────────────────────────────────────

class DeleteAccountRequest(BaseModel):
    current_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateNameRequest(BaseModel):
    name: str

