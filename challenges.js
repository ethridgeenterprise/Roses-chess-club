import crypto from 'node:crypto';
import {gameOver} from './rules.js';

export function installChallenges(io, rooms, createRoom) {
  const invitations = new Map();

  function member(socket) {
    return socket?.connected &&
      socket.data.clubMemberExpires > Date.now()
      ? socket.data.clubMember : null;
  }

  function busy(id) {
    for (const room of rooms.values()) {
      // Ordinary rooms waiting for an opponent do not block challenges.
      if (!room.players.b && !room.challengeAllowed) continue;
      const belongs = ['w', 'b'].some(
        side => room.members?.[side]?.id === id ||
          room.challengeAllowed?.[side] === id
      );
      if (belongs && !room.timeout && !room.resigned && !gameOver(room))
        return true;
      if (belongs && room.members?.w && room.members?.b &&
          room.members.w.id !== room.members.b.id && !room.saved)
        return true;
    }
    return false;
  }

  function finish(invite, message) {
    invitations.delete(invite.id);
    for (const socketId of [invite.fromSocket, invite.toSocket]) {
      io.to(socketId).emit('challengeClosed', {
        id: invite.id, message
      });
    }
  }

  io.on('connection', socket => {
    socket.on('challengeSend', (payload, reply) => {
      if (typeof reply !== 'function') return;
      const from = member(socket);
      if (!from) return reply({ok:false,error:'Please log in first.'});
      if (typeof payload?.targetId !== 'string')
        return reply({ok:false,error:'Choose an online player.'});
      if (payload.targetId === from.id)
        return reply({ok:false,error:'Choose another player.'});

      const now = Date.now();
      if (now - (socket.data.lastChallenge || 0) < 3000)
        return reply({ok:false,error:'Please wait a few seconds.'});
      socket.data.lastChallenge = now;

      const target = [...io.sockets.sockets.values()].find(
        peer => member(peer)?.id === payload.targetId
      );
      if (!target)
        return reply({ok:false,error:'That player is no longer online.'});
      if (busy(from.id) || busy(payload.targetId))
        return reply({ok:false,error:'Finish existing games before challenging.'});

      for (const invite of invitations.values()) {
        if (invite.expires <= now) {
          finish(invite, 'Challenge expired.');
          continue;
        }
        if ([invite.fromId, invite.toId].some(
          id => id === from.id || id === payload.targetId
        )) return reply({ok:false,error:'A challenge is already pending.'});
      }

      const invite = {
        id:crypto.randomUUID(),
        fromId:from.id,
        toId:payload.targetId,
        fromSocket:socket.id,
        toSocket:target.id,
        rated:payload.rated === true,
        expires:now + 60000
      };
      invitations.set(invite.id, invite);
      target.emit('challengeReceived', {
        id:invite.id,
        name:from.display_name,
        rated:invite.rated,
        expires:invite.expires
      });
      reply({ok:true,id:invite.id,expires:invite.expires});
    });

    socket.on('challengeReply', (payload, reply) => {
      if (typeof reply !== 'function') return;
      const invite = invitations.get(payload?.id);
      const to = member(socket);
      if (!invite || !to || invite.toSocket !== socket.id ||
          invite.toId !== to.id)
        return reply({ok:false,error:'Challenge is no longer available.'});

      if (invite.expires <= Date.now()) {
        finish(invite, 'Challenge expired.');
        return reply({ok:false,error:'Challenge expired.'});
      }
      if (payload.accept !== true) {
        finish(invite, 'Challenge declined.');
        return reply({ok:true});
      }

      const sender = io.sockets.sockets.get(invite.fromSocket);
      const from = member(sender);
      if (!from || from.id !== invite.fromId ||
          busy(from.id) || busy(to.id)) {
        finish(invite, 'A player is no longer available.');
        return reply({ok:false,error:'A player is no longer available.'});
      }

      invitations.delete(invite.id);
      const game = createRoom({
        from, to, rated:invite.rated
      });
      sender.emit('challengeAccepted', {
        id:invite.id, room:game.id, token:game.token
      });
      socket.emit('challengeAccepted', {
        id:invite.id, room:game.id
      });
      reply({ok:true});
    });

    socket.on('disconnect', () => {
      for (const invite of invitations.values()) {
        if ([invite.fromSocket, invite.toSocket].includes(socket.id))
          finish(invite, 'Challenge cancelled because a player disconnected.');
      }
    });
  });

  setInterval(() => {
    for (const invite of invitations.values()) {
      if (invite.expires <= Date.now())
        finish(invite, 'Challenge expired.');
    }
  }, 1000).unref();
}
