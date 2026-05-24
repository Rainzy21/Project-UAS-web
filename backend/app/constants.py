"""B17 — Application-wide allowlist constants and limits."""

ALLOWED_GENRES: set[str] = {
    "Action",
    "Drama",
    "Comedy",
    "Horror",
    "Sci-fi",
    "Romance",
    "Thriller",
    "Animation",
}

ALLOWED_MOODS: set[str] = {
    "Feel good",
    "Dark & intense",
    "Thrilling",
    "Emotional",
    "Lighthearted",
}

ALLOWED_ERAS: set[str] = {
    "Classic",
    "80s-90s",
    "2000s",
    "2010s",
    "Recent",
    "Any",
}

ALLOWED_LANGUAGES: set[str] = {
    "English",
    "Korean",
    "Spanish",
    "French",
    "Japanese",
    "Any",
}

ALLOWED_WATCHING_WITH: set[str] = {
    "Solo",
    "Partner",
    "Friends",
    "Family",
}

MAX_PRESETS_PER_USER: int = 20
