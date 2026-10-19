import {gameOver} from './rules.js';

import {createClient} from '@supabase/supabase-js';

export function installPresence(io, rooms) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const db = url && key ? createClient(url, key, {
    auth: {persistSession:false, autoRefreshToken:false}
  }) : null;

  function roster() {
    const members = new Map();
    for (const socket of io.sockets.sockets.values()) {
      const member = socket.data.clubMember;
      if (!member) continue;
      const r = rooms.get(socket.data.room);
      const seated = r && r.sockets[socket.data.color] === socket.id;
      const playing = !!(seated && r.players.b &&
        !r.timeout && !r.resigned && !gameOver(r));
      const existing = members.get(member.id);
      members.set(member.id, {
        id:member.id,
        name:member.display_name,
        avatar:member.avatar,
        playing:playing || !!existing?.playing
      });
    }
    return [...members.values()]
      .sort((a,b) => a.name.localeCompare(b.name));
  }

  function broadcast() {
    const list = roster();
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.clubMember) socket.emit('clubOnline', list);
    }
  }

  io.on('connection', socket => {
    let version = 0;
    let lastAttempt = 0;
    socket.on('identify', async (payload, reply) => {
      const ack = typeof reply === 'function' ? reply : () => {};
      const current = ++version;
      const token = payload?.accessToken;
      if (!token) {
        delete socket.data.clubMember;
        socket.emit('clubOnline', []);
        broadcast();
        return ack({ok:true});
      }
      if (typeof token !== 'string' || token.length > 16384)
        return ack({ok:false,error:'Invalid login token.'});
      if (Date.now()-lastAttempt < 500)
        return ack({ok:false,error:'Please wait a moment and refresh.'});
      lastAttempt = Date.now();
      delete socket.data.clubMember;
      broadcast();

      try {
        if (!db) throw new Error('Account connection is not configured on Render.');
        const {data:auth, error:authError} = await db.auth.getUser(token);
        if (authError || !auth.user) throw new Error('Please log in again.');
        const {data:profile, error} = await db.from('profiles')
          .select('id,display_name,avatar')
          .eq('id', auth.user.id).single();
        if (error || !profile) throw new Error('Player profile could not load.');
        if (current !== version || !socket.connected) return ack({ok:false});
        socket.data.clubMember = profile;
        // Remove expired sessions from the online directory.
        const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        socket.data.clubMemberExpires = Number(claims.exp) * 1000;
        ack({ok:true});
        broadcast();
      } catch (error) {
        if (current === version) delete socket.data.clubMember;
        ack({ok:false,error:error.message || 'Could not verify login.'});
        broadcast();
      }
    });
    socket.on('disconnect', () => {
      version++;
      broadcast();
    });
  });

  const timer = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.clubMember &&
          socket.data.clubMemberExpires <= Date.now()) {
        delete socket.data.clubMember;
      }
    }
    broadcast();
  }, 3000);
  timer.unref();
}
