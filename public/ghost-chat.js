/*
 * GhostLabs Chat Engine v1.0
 * Client interface — Ghost Labs 2026
 */

function installGhostChat() {
  const layout = document.getElementById('clubLayout');
  const socket = window.chessSocket;
  const lobby = document.getElementById('lobby');

  if (!layout || !socket || !lobby) {
    setTimeout(installGhostChat, 250);
    return;
  }

  const panel = document.createElement('aside');
  panel.id = 'ghostChatPanel';
  panel.className = 'panel';

  panel.innerHTML = `
    <div class="gc-heading">
      <img src="/ghostlabs-chat.svg" alt="Ghost Labs">
      <h2>Ghost Chat</h2>
    </div>
    <div class="gc-brand">GhostLabs Chat Engine v1.0</div>

    <div class="gc-console">
      <div id="gcStatus" class="gc-status">
        ● Connecting...
      </div>

      <div id="gcMessages" role="log"
           aria-live="polite"></div>

      <div class="gc-toolbar">
        <button type="button" id="gcUnmute"
          title="Restore all muted players">🔊 Unmute all</button>
        <button type="button" id="gcClear"
          title="Clear your chat screen">🗑 Clear</button>
        <button type="button" data-format="bold"
          aria-label="Bold"><b>B</b></button>
        <button type="button" data-format="italic"
          aria-label="Italic"><i>I</i></button>
        <button type="button" data-format="underline"
          aria-label="Underline"><u>U</u></button>
        <select id="gcColor" aria-label="Text color">
          <option value="#ffffff">White</option>
          <option value="#80ff80">Green</option>
          <option value="#ff80c0">Pink</option>
          <option value="#80dfff">Blue</option>
          <option value="#ffe680">Gold</option>
          <option value="#ff8080">Red</option>
          <option value="#c9a0ff">Purple</option>
          <option value="#ffb366">Orange</option>
        </select>
        <button type="button" id="gcEmoji"
          aria-label="Emojis">😊</button>
      </div>

      <div id="gcEmojiTray" hidden></div>

      <form id="gcForm">
        <textarea id="gcInput" maxlength="500"
          rows="2" placeholder="Type a message..."
          aria-label="Chat message" disabled></textarea>
        <button id="gcSend" type="submit" disabled>
          Send ➤
        </button>
      </form>
    </div>

    <section id="gcAdmin" hidden>
      <h3>🛡 GhostLabs Administration</h3>

      <label for="gcMember">Select member</label>
      <select id="gcMember">
        <option value="">Select a player</option>
      </select>

      <button type="button" id="gcBan">
        Ban Member
      </button>

      <button type="button" id="gcShowBans">
        Banned Members
      </button>

      <div id="gcBanList"></div>
      <div id="gcAdminStatus" role="status"></div>
    </section>

    <p class="gc-note">
      Friendly conversation. Friendly competition.
      Messages disappear after two minutes.
    </p>
  `;

  layout.append(panel);

  const footer = document.querySelector('.ghostlabs-footer');
  if (footer) layout.after(footer);

  const $ = id => document.getElementById(id);
  const messages = $('gcMessages');
  const input = $('gcInput');
  const format = {
    bold:false,
    italic:false,
    underline:false
  };

  let ready = false;
  let isAdmin = false;
  const mutedUsers = new Set();

  $('gcUnmute').addEventListener('click', () => {
    mutedUsers.clear();
    $('gcStatus').textContent = 'All players unmuted';
  });

  $('gcClear').addEventListener('click', () => {
    messages.replaceChildren();
  });

  function setReady(ok, admin = false, error = '') {
    isAdmin = ok && admin;
    $('gcAdmin').hidden = !isAdmin;

    if (!isAdmin) {
      $('gcBanList').replaceChildren();
      $('gcAdminStatus').textContent = '';
    }

    ready = ok;
    input.disabled = !ok;
    $('gcSend').disabled = !ok;
    $('gcStatus').textContent = ok
      ? '● Connected'
      : (error || '● Members only — log in to chat');
    $('gcStatus').classList.toggle('connected', ok);

    if (!ok) messages.replaceChildren();
  }

  function refresh() {
    const visible = !lobby.classList.contains('hidden');
    panel.hidden = !visible;
    layout.classList.toggle('ghost-chat-active', visible);

    if (visible && socket.connected) {
      socket.emit('ghostChat:join');
    } else {
      socket.emit('ghostChat:leave');
      setReady(false);
    }
  }

  socket.on('ghostChat:ready', result => {
    setReady(
      !!result?.ok && !panel.hidden,
      result?.admin === true,
      result?.error
    );
  });

  socket.on('disconnect', () => setReady(false));
  socket.on('connect', refresh);
  window.addEventListener('club-auth-ready', refresh);

  window.addEventListener('ghost-chat-auth', () => {
    socket.emit('ghostChat:leave');
    setReady(false);
    input.value = '';
  });

  socket.on('clubOnline', members => {
    if (!members.length) setReady(false);
  });

  socket.on('clubOnline', members => {
    const select = $('gcMember');
    const selected = select.value;

    select.replaceChildren(
      new Option('Select a player', '')
    );

    if (!isAdmin) return;

    for (const member of members) {
      select.add(new Option(member.name, member.id));
    }

    select.value = selected;
  });

  function loadBans() {
    if (!isAdmin || !socket.connected) return;

    socket.emit('ghostChat:bans', result => {
      if (!isAdmin) return;

      const list = $('gcBanList');
      list.replaceChildren();

      if (!result?.ok) {
        $('gcAdminStatus').textContent =
          result?.error || 'Unable to load bans.';
        return;
      }

      if (!result.bans.length) {
        list.textContent = 'No banned members.';
        return;
      }

      for (const member of result.bans) {
        const row = document.createElement('div');
        row.className = 'gc-ban-row';

        const label = document.createElement('span');
        label.textContent = member.display_name || member.user_id;

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Unban';

        button.addEventListener('click', () => {
          if (!isAdmin || !socket.connected) return;
          if (!confirm('Restore this member?')) return;

          socket.emit('ghostChat:unban',
            member.user_id, response => {
              if (!isAdmin) return;

              $('gcAdminStatus').textContent =
                response?.ok
                  ? 'Member restored.'
                  : response?.error || 'Unban failed.';

              loadBans();
            });
        });

        row.append(label, button);
        list.append(row);
      }
    });
  }

  $('gcShowBans').addEventListener('click', loadBans);

  $('gcBan').addEventListener('click', () => {
    if (!isAdmin || !socket.connected) return;

    const select = $('gcMember');
    const id = select.value;

    if (!id) return;

    const name = select.selectedOptions[0].textContent;

    if (!confirm('Permanently ban ' + name +
        ' from Ghost Chat?')) return;

    socket.emit('ghostChat:ban', id, result => {
      if (!isAdmin) return;

      $('gcAdminStatus').textContent = result?.ok
        ? name + ' banned from chat.'
        : result?.error || 'Ban failed.';

      loadBans();
    });
  });

  new MutationObserver(refresh).observe(lobby, {
    attributes:true,
    attributeFilter:['class']
  });

  panel.querySelectorAll('[data-format]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');

    button.addEventListener('click', () => {
      const key = button.dataset.format;
      format[key] = !format[key];
      button.classList.toggle('active', format[key]);
      button.setAttribute('aria-pressed', String(format[key]));
      input.focus();
    });
  });

  $('gcEmoji').addEventListener('click', () => {
    $('gcEmojiTray').hidden = !$('gcEmojiTray').hidden;
  });

  for (const emoji of [
    '😊','😂','😉','😎','🤔','😮','❤️','👍',
    '👏','🔥','🎉','👻','☕','♟️','♞','♚','♛'
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = emoji;

    button.addEventListener('click', () => {
      if (!ready) return;
      const start = input.selectionStart;
      const end = input.selectionEnd;

      if (input.value.length - (end - start) +
          emoji.length > 500) return;

      input.setRangeText(emoji, start, end, 'end');
      input.focus();
    });

    $('gcEmojiTray').append(button);
  }

  socket.on('ghostChat:message', message => {
    if (!ready || panel.hidden) return;
    if (mutedUsers.has(message.senderId)) return;

    const row = document.createElement('div');
    row.className = 'gc-message';

    const time = document.createElement('small');
    time.textContent = new Date(message.timestamp)
      .toLocaleTimeString([], {
        hour:'2-digit',
        minute:'2-digit'
      });

    const name = document.createElement('strong');
    name.textContent = message.sender + ': ';
    name.style.color = message.color;
    name.style.cursor = 'pointer';
    name.title = 'Click to mute this player';
    row.dataset.senderId = message.senderId;

    name.addEventListener('click', () => {
      if (!confirm('Mute ' + message.sender + '?')) return;

      mutedUsers.add(message.senderId);

      for (const item of messages.children) {
        if (item.dataset.senderId === message.senderId)
          item.remove();
      }
    });

    const text = document.createElement('span');
    text.textContent = message.text;
    text.style.color = message.color;
    text.style.fontWeight = message.bold ? 'bold' : 'normal';
    text.style.fontStyle = message.italic ? 'italic' : 'normal';
    text.style.textDecoration = message.underline
      ? 'underline' : 'none';

    row.append(time, name, text);
    messages.append(row);
    messages.scrollTop = messages.scrollHeight;

    setTimeout(() => row.remove(), 120000);
  });

  $('gcForm').addEventListener('submit', event => {
    event.preventDefault();

    const text = input.value.trim();
    if (!ready || !text) return;

    socket.emit('ghostChat:send', {
      text,
      color:$('gcColor').value,
      ...format
    }, result => {
      if (result?.ok) {
        if (input.value.trim() === text) input.value = '';
        $('gcStatus').textContent = '● Connected';
      } else {
        $('gcStatus').textContent =
          result?.error || 'Message failed.';
      }
    });
  });

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey &&
        !event.isComposing) {
      event.preventDefault();
      $('gcForm').requestSubmit();
    }
  });

  refresh();
}

installGhostChat();
