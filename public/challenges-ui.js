(() => {
  const socket = window.chessSocket;
  const panel = document.createElement('section');
  panel.className = 'panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Game challenges';
  heading.style.marginTop = '0';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent =
    'Use Challenge beside an online player. Invitations last one minute.';
  const controls = document.createElement('div');
  controls.className = 'actions';
  panel.append(heading, status, controls);
  document.getElementById('lobby').before(panel);

  let pendingId = null;
  let waiting = false;
  let expiryTimer;

  function clear() {
    pendingId = null;
    waiting = false;
    clearTimeout(expiryTimer);
    controls.replaceChildren();
  }

  function expiresAt(time) {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => {
      clear();
      status.textContent = 'Challenge expired. You can send another.';
    }, Math.max(0, time - Date.now()));
  }

  window.sendClubChallenge = (targetId, name) => {
    if (waiting || pendingId) {
      status.textContent = 'Please finish the pending challenge first.';
      return;
    }
    const rated = document.getElementById('gameMode')?.value === 'rated';
    if (!confirm(
      `Challenge ${name} to a ${rated ? 'rated' : 'casual'} game?`
    )) return;

    waiting = true;
    status.textContent = 'Sending challenge…';
    socket.timeout(10000).emit(
      'challengeSend', {targetId, rated}, (error, result) => {
        waiting = false;
        if (error) {
          status.textContent =
            'No response yet. The invitation may have been sent; wait one minute before retrying.';
          return;
        }
        if (!result?.ok) {
          status.textContent = result?.error || 'Could not send challenge.';
          return;
        }
        pendingId = result.id;
        status.textContent =
          `Challenge sent to ${name}. Waiting for their answer…`;
        expiresAt(result.expires);
      }
    );
  };

  socket.on('challengeReceived', invite => {
    clear();
    pendingId = invite.id;
    status.textContent =
      `${invite.name} invites you to a ${invite.rated ? 'rated' : 'casual'} ` +
      'game — 15 minutes each, plus 10 seconds per move.';
    for (const [label, accept] of [['Accept', true], ['Decline', false]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (!accept) button.className = 'secondary';
      button.onclick = () => {
        const id = pendingId;
        if (!id || waiting) return;
        waiting = true;
        controls.querySelectorAll('button').forEach(b => {
          b.disabled = true;
        });
        socket.timeout(10000).emit(
          'challengeReply', {id, accept}, (error, result) => {
            if (pendingId !== id) return;
            waiting = false;
            if (error) {
              status.textContent =
                'Connection interrupted. Wait for the invitation to expire before trying again.';
              return;
            }
            if (!result?.ok) {
              clear();
              status.textContent =
                result?.error || 'Challenge is no longer available.';
            }
          }
        );
      };
      controls.append(button);
    }
    expiresAt(invite.expires);
  });

  socket.on('challengeClosed', result => {
    if (pendingId !== result.id) return;
    clear();
    status.textContent = result.message;
  });

  socket.on('challengeAccepted', result => {
    clear();
    status.textContent = 'Challenge accepted—opening your game…';
    window.joinClubRoom(result.room, result.token);
  });

  socket.on('disconnect', () => {
    clear();
    status.textContent = 'Disconnected. Pending challenges were cancelled.';
  });
})();
