BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_games (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id)
        ON DELETE CASCADE,
    difficulty integer NOT NULL
        CHECK (difficulty BETWEEN 1 AND 5),
    side text NOT NULL
        CHECK (side IN ('w', 'b')),
    result text NOT NULL
        CHECK (result IN ('1-0', '0-1', '1/2-1/2')),
    pgn text NOT NULL,
    finished_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_games
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.practice_games FROM anon, authenticated;
GRANT SELECT, INSERT ON public.practice_games TO authenticated;

DROP POLICY IF EXISTS "Members can view their practice games"
ON public.practice_games;

CREATE POLICY "Members can view their practice games"
ON public.practice_games
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members can save their practice games"
ON public.practice_games;

CREATE POLICY "Members can save their practice games"
ON public.practice_games
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS practice_games_user_history
ON public.practice_games (user_id, finished_at DESC);

CREATE TABLE IF NOT EXISTS public.academy_progress (
    user_id uuid NOT NULL REFERENCES auth.users(id)
        ON DELETE CASCADE,
    category text NOT NULL,
    challenge_id text NOT NULL,
    completed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, category, challenge_id)
);

ALTER TABLE public.academy_progress
ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.academy_progress FROM anon, authenticated;
GRANT SELECT, INSERT ON public.academy_progress TO authenticated;

DROP POLICY IF EXISTS "Members can view their Academy progress"
ON public.academy_progress;

CREATE POLICY "Members can view their Academy progress"
ON public.academy_progress
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Members can record their Academy progress"
ON public.academy_progress;

CREATE POLICY "Members can record their Academy progress"
ON public.academy_progress
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
