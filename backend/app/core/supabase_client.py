from typing import Optional

from supabase import Client, create_client

from app.core.config import settings

supabase_admin: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)

supabase_anon: Optional[Client] = None
if settings.SUPABASE_ANON_KEY:
    supabase_anon = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


def get_user_client(access_token: str) -> Client:
    """Return a Supabase client scoped to the user's JWT (RLS enforced)."""
    if not settings.SUPABASE_ANON_KEY:
        raise RuntimeError("SUPABASE_ANON_KEY is required for user-scoped queries")
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
        options={
            "global": {"headers": {"Authorization": f"Bearer {access_token}"}},
        },
    )
