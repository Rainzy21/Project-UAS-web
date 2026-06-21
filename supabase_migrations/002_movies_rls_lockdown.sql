-- Movies table: read-only for clients; writes via save_movie_to_wishlist RPC only.
-- Run after supabase_schema.sql and supabase_fix_wishlist.sql (RPC).

ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated insert on movies" ON public.movies;
DROP POLICY IF EXISTS "Allow authenticated update on movies" ON public.movies;
DROP POLICY IF EXISTS "movies_select_authenticated" ON public.movies;
DROP POLICY IF EXISTS "movies_select_anon" ON public.movies;

CREATE POLICY "movies_select_authenticated"
ON public.movies
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "movies_select_anon"
ON public.movies
FOR SELECT
TO anon
USING (true);

NOTIFY pgrst, 'reload schema';
