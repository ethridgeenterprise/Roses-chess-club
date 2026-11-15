/*
 * GhostLabs Chat Engine v1.0
 * Copyright 2026 Ghost Labs
 * Real-time temporary messaging
 */

import {createChatModeration} from './chat-moderation.js';

export function installChat(io) {
  const moderation = createChatModeration();
  const rateLimits = new Map();

  const colors = new Set([
    '#ffffff',
    '#80ff80',
    '#ff80c0',
    '#80dfff',
    '#ffe680',
    '#ff8080',
    '#c9a0ff',
    '#ffb366'
  ]);

  function verified(socket) {
    return !!socket.data.clubMember &&
      socket.data.clubMemberExpires > Date.now();
  }

  io.on('connection', socket => {

    socket.on('ghostChat:join', async () => {
      const now = Date.now();

      if (!verified(socket)) return;

      if (now - (socket.data.lastChatJoin || 0) < 1000)
        return;

      socket.data.lastChatJoin = now;

      const revision = socket.data.chatRevision =
        (socket.data.chatRevision || 0) + 1;
      delete socket.data.ghostChat;

      if (!verified(socket))
        return socket.emit('ghostChat:ready', {ok:false});

      const memberId = socket.data.clubMember.id;

      try {
        const banned = await moderation.isBanned(memberId);

        if (socket.data.chatRevision !== revision ||
            !socket.connected || !verified(socket) ||
            socket.data.clubMember.id !== memberId)
          return;

        if (banned)
          return socket.emit('ghostChat:ready', {
            ok:false,
            error:'Your chat privileges have been suspended.'
          });

        socket.data.ghostChat = memberId;

        socket.emit('ghostChat:ready', {
          ok:true,
          admin:moderation.isAdmin(socket)
        });
      } catch (error) {
        socket.emit('ghostChat:ready', {
          ok:false,
          error:'Chat temporarily unavailable.'
        });
      }
    });

    socket.on('ghostChat:leave', () => {
      socket.data.chatRevision =
        (socket.data.chatRevision || 0) + 1;
      delete socket.data.ghostChat;
    });

    socket.on('ghostChat:ban', async (userId, reply) => {
      const ack = typeof reply === 'function'
        ? reply : () => {};

      if (!moderation.isAdmin(socket))
        return ack({ok:false, error:'Access denied.'});

      if (typeof userId !== 'string')
        return ack({ok:false, error:'Invalid member.'});

      try {
        await moderation.ban(socket, userId);

        for (const client of io.sockets.sockets.values()) {
          if (client.data.clubMember?.id === userId) {
            client.data.chatRevision =
              (client.data.chatRevision || 0) + 1;
            delete client.data.ghostChat;

            client.emit('ghostChat:ready', {
              ok:false,
              error:'Your chat privileges have been suspended.'
            });
          }
        }

        ack({ok:true});
      } catch (error) {
        ack({ok:false, error:'Unable to ban member.'});
      }
    });

    socket.on('ghostChat:unban', async (userId, reply) => {
      const ack = typeof reply === 'function'
        ? reply : () => {};

      if (!moderation.isAdmin(socket))
        return ack({ok:false, error:'Access denied.'});

      if (typeof userId !== 'string')
        return ack({ok:false, error:'Invalid member.'});

      try {
        await moderation.unban(socket, userId);
        ack({ok:true});
      } catch (error) {
        ack({ok:false, error:'Unable to unban member.'});
      }
    });

    socket.on('ghostChat:bans', async (reply) => {
      if (typeof reply !== 'function') return;

      if (!moderation.isAdmin(socket))
        return reply({ok:false, error:'Access denied.'});

      try {
        const bans = await moderation.listBans(socket);
        reply({ok:true, bans});
      } catch (error) {
        reply({ok:false, error:'Unable to load ban list.'});
      }
    });

    socket.on('ghostChat:send', (payload, reply) => {
      const ack = typeof reply === 'function'
        ? reply : () => {};

      if (!verified(socket) ||
          socket.data.ghostChat !== socket.data.clubMember.id)
        return ack({ok:false, error:'Join chat first.'});

      if (typeof payload?.text !== 'string')
        return ack({ok:false, error:'Invalid message.'});

      const text = payload.text.trim();

      if (!text || text.length > 500)
        return ack({ok:false, error:'Message must be 1–500 characters.'});

      const member = socket.data.clubMember;
      const now = Date.now();
      const last = rateLimits.get(member.id) || 0;

      if (now - last < 1500)
        return ack({ok:false, error:'Please slow down.'});

      rateLimits.set(member.id, now);

      const message = {
        sender: member.display_name,
        senderId: member.id,
        text,
        color: colors.has(payload.color)
          ? payload.color : '#ffffff',
        bold: payload.bold === true,
        italic: payload.italic === true,
        underline: payload.underline === true,
        timestamp: now,
        expiresAt: now + 120000
      };

      for (const client of io.sockets.sockets.values()) {
        if (verified(client) &&
            client.data.ghostChat === client.data.clubMember.id) {
          client.emit('ghostChat:message', message);
        }
      }

      ack({ok:true});
    });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();

    for (const [id, time] of rateLimits) {
      if (now - time > 60000)
        rateLimits.delete(id);
    }
  }, 60000);

  cleanup.unref();
}
