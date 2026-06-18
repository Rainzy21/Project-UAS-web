// Shared frontend config — keep in sync with root .env Supabase project
// OAuth: enable Google in Supabase; redirect URL = http://localhost:5500/auth-callback.html
// Dev origin: use localhost only (origin-guard.js redirects 127.0.0.1 → localhost)
window.APP_CONFIG = {
    API_BASE: 'http://localhost:8000',
    TMDB_API_KEY: '0d07ead93082f0dd1514a2e777e28905',
    SUPABASE_URL: 'https://fyogufwysrxbgdgqzdqt.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5b2d1Znd5c3J4YmdkZ3F6ZHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTU5MTgsImV4cCI6MjA5NzA5MTkxOH0.HehqJMYmZA95-6FoTeuk6fCM8LSZC0WLM3C1-wpS9QM',
};
