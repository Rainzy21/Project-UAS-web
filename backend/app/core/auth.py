import jwt
from fastapi import HTTPException, Request
from app.core.config import settings


def verify_supabase_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if "email_confirmed_at" not in payload:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")

    return payload  # payload["sub"] = user UUID


def get_user_id_from_request(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth.removeprefix("Bearer ")
    payload = verify_supabase_token(token)
    return payload["sub"]
