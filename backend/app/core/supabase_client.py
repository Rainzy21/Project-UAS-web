from typing import Optional

from supabase import create_client, Client
from app.core.config import settings

supabase_admin: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)

supabase_anon: Optional[Client] = None
if settings.SUPABASE_ANON_KEY:
    supabase_anon = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
