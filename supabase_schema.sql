-- Run in Supabase Dashboard → SQL Editor (or: ./scripts/apply_supabase_schema.sh)
-- Creates tables required by the FastAPI backend (see backend-migration.md).

-- Profiles (mirrors auth.users 1:1)
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name       text,
  created_at timestamptz DEFAULT now()
);

-- Movie cache (populated by save_movie_to_wishlist RPC / backend)
CREATE TABLE IF NOT EXISTS public.movies (
  tmdb_id    integer PRIMARY KEY,
  title      text NOT NULL,
  overview   text,
  poster_url text,
  rating     numeric,
  year       integer,
  language   text,
  genres     jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'movies' AND policyname = 'movies_select_authenticated'
  ) THEN
    CREATE POLICY "movies_select_authenticated" ON public.movies
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'movies' AND policyname = 'movies_select_anon'
  ) THEN
    CREATE POLICY "movies_select_anon" ON public.movies
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Saved movies / wishlist
CREATE TABLE IF NOT EXISTS public.saved_movies (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  tmdb_id  integer NOT NULL REFERENCES public.movies ON DELETE CASCADE,
  note     text,
  tag      text,
  saved_at timestamptz DEFAULT now(),
  UNIQUE (user_id, tmdb_id)
);

-- AI recommendation history
CREATE TABLE IF NOT EXISTS public.recommendation_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  preferences jsonb,
  ai_response jsonb,
  tmdb_ids    jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Preference presets
CREATE TABLE IF NOT EXISTS public.preference_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  name        text NOT NULL,
  preferences jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, created_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Row Level Security
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_movies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_presets  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'own rows'
  ) THEN
    CREATE POLICY "own rows" ON public.profiles USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_movies' AND policyname = 'own rows'
  ) THEN
    CREATE POLICY "own rows" ON public.saved_movies USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recommendation_logs' AND policyname = 'own rows'
  ) THEN
    CREATE POLICY "own rows" ON public.recommendation_logs USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'preference_presets' AND policyname = 'own rows'
  ) THEN
    CREATE POLICY "own rows" ON public.preference_presets USING (auth.uid() = user_id);
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
