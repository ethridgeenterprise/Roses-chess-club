import {createClient} from '@supabase/supabase-js';

export function installLeaderboard(app) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const db = url && key ? createClient(url, key, {
    auth: {persistSession:false, autoRefreshToken:false}
  }) : null;

  let cached = null;
  let expires = 0;
  let pending = null;

  async function load() {
    if (cached && Date.now() < expires) return cached;
    if (!pending) {
      pending = (async () => {
        if (!db) throw new Error('Database unavailable');
        const {data, error} = await db.from('profiles')
          .select('display_name,avatar,rating,rated_games')
          .gt('rated_games', 0)
          .order('rating', {ascending:false})
          .order('display_name', {ascending:true})
          .order('id', {ascending:true})
          .limit(25)
          .abortSignal(AbortSignal.timeout(8000));
        if (error) throw error;
        cached = data.map(player => ({
          name: player.display_name,
          avatar: player.avatar,
          rating: player.rating,
          ratedGames: player.rated_games
        }));
        expires = Date.now() + 30000;
        return cached;
      })().finally(() => { pending = null; });
    }
    return pending;
  }

  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const players = await load();
      res.set('Cache-Control', 'no-store');
      res.json({players});
    } catch {
      res.status(503).json({
        error:'The leaderboard is temporarily unavailable. Please try again shortly.'
      });
    }
  });
}
