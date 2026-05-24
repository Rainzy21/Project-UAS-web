// Supabase credentials — anon key is intentionally public (safe to commit)
const SUPABASE_URL = "https://nwvvwghvdnbrltektuno.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dnZ3Z2h2ZG5icmx0ZWt0dW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MjQ2MDMsImV4cCI6MjA5NTIwMDYwM30.Brl67HzxcSoYrs9AtY8kVtofLLa0k9bJAdsmpIpb7Ns";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

supabase.auth.onAuthStateChange((event, session) => {
    const loginBtn = document.getElementById("login-trigger");
    const userDisplay = document.getElementById("user-display");

    if (session) {
        loginBtn?.classList.add("hidden");
        if (userDisplay) userDisplay.textContent = session.user.email;
    } else {
        loginBtn?.classList.remove("hidden");
        if (userDisplay) userDisplay.textContent = "";
    }
});

// Login form
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("login-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            document.getElementById("login-error").textContent = error.message;
        } else {
            document.getElementById("login-error").textContent = "";
            document.getElementById("login-modal").classList.add("hidden");
        }
    });

    // Signup form
    document.getElementById("signup-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("signup-name").value;
        const email = document.getElementById("signup-email").value;
        const password = document.getElementById("signup-password").value;

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name } },
        });

        if (error) {
            document.getElementById("signup-error").textContent = error.message;
        } else {
            document.getElementById("signup-modal").innerHTML =
                "<p class='text-white text-center p-8'>Check your email to confirm your account.</p>";
        }
    });

    // Logout button
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });
});
