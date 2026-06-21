// Copy to config.js for local dev (config.js is gitignored):
//   cp frontend/Static/js/config.example.js frontend/Static/js/config.js
// Production: use scripts/inject-config.sh to substitute placeholders at deploy.
window.APP_CONFIG = {
    API_BASE: 'http://localhost:8000',
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_ANON_KEY: 'your-anon-key',
};
