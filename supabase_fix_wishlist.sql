CREATE OR REPLACE FUNCTION public.save_movie_to_wishlist(
    p_tmdb_id   INTEGER,
    p_title     TEXT,
    p_poster_url TEXT,
    p_rating    FLOAT,
    p_year      INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO movies (tmdb_id, title, poster_url, rating, year)
    VALUES (p_tmdb_id, p_title, p_poster_url, p_rating, p_year)
    ON CONFLICT (tmdb_id) DO UPDATE SET
        title       = EXCLUDED.title,
        poster_url  = EXCLUDED.poster_url,
        rating      = EXCLUDED.rating,
        year        = EXCLUDED.year;

    INSERT INTO saved_movies (tmdb_id, user_id)
    VALUES (p_tmdb_id, auth.uid())
    ON CONFLICT DO NOTHING;
END;
$$;

NOTIFY pgrst, 'reload schema';
