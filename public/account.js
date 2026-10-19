
const byId = id => document.getElementById(id);
const message = text => { byId('accountMessage').textContent = text; };
let client, currentUser = null, busy = false;
let renderVersion = 0;

function lock(value) {
  busy = value;
  document.querySelectorAll(
    '#accountPanel button, #accountPanel input, #accountPanel select'
  ).forEach(el => { el.disabled = value; });
}

async function showSession(session) {
  const version = ++renderVersion;
  currentUser = session?.user || null;
  syncPresence(session);
  byId('accountForm').classList.toggle('hidden', !!currentUser);
  byId('profileForm').classList.toggle('hidden', !currentUser);
  if (!currentUser) {
    message('Log in to your club profile, or play as a guest below.');
    byId('accountPassword').value = '';
    return;
  }

  message('Loading your profile…');
  const {data, error} = await client.from('profiles')
    .select('display_name,avatar,rating,wins,losses,draws')
    .eq('id', currentUser.id).single();
  if (version !== renderVersion) return;
  if (error) {
    message('Signed in, but the profile could not load: ' + error.message);
    return;
  }
  byId('playerName').value = data.display_name;
  byId('playerAvatar').value = data.avatar;
  const avatars = {
    knight:'♞', king:'♚', queen:'♛', rook:'♜', bishop:'♝', pawn:'♟'
  };
  message(avatars[data.avatar] + ' Signed in as ' + data.display_name);
  byId('memberStats').textContent =
    'Club rating: ' + data.rating + ' (ratings not active yet) · ' +
    data.wins + ' wins · ' + data.losses + ' losses · ' +
    data.draws + ' draws';
}

async function initialize() {
  const {createClient} = await import(
    'https://esm.sh/@supabase/supabase-js@2'
  );
  client = createClient(
    'https://blvwmyhxomhjbksnrqzy.supabase.co',
    'sb_publishable_oG0HIPDTRKBBYVvDuTICJA_NTf9FSY5'
  );

  byId('accountForm').onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    lock(true);
    try {
      const {data, error} = await client.auth.signInWithPassword({
        email: byId('accountEmail').value.trim(),
        password: byId('accountPassword').value
      });
      if (error) throw error;
      byId('accountPassword').value = '';
      await showSession(data.session);
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  };

  byId('signup').onclick = async () => {
    if (busy || !byId('accountForm').reportValidity()) return;
    lock(true);
    try {
      const {data, error} = await client.auth.signUp({
        email: byId('accountEmail').value.trim(),
        password: byId('accountPassword').value,
        options: {
          emailRedirectTo: 'https://roses-chess-club-1.onrender.com/'
        }
      });
      if (error) throw error;
      byId('accountPassword').value = '';
      if (data.session) {
        await showSession(data.session);
      } else {
        message('Check your email for a confirmation link, then return here to log in.');
      }
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  };

  byId('profileForm').onsubmit = async event => {
    event.preventDefault();
    if (busy || !currentUser) return;
    const name = byId('playerName').value.trim();
    if (name.length < 2) {
      message('Please enter a name with at least two characters.');
      return;
    }
    lock(true);
    try {
      const {data, error} = await client.from('profiles').update({
        display_name: name,
        avatar: byId('playerAvatar').value
      }).eq('id', currentUser.id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('Profile was not saved.');
      const {data: auth, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw sessionError;
      await showSession(auth.session);
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  };

  byId('logout').onclick = async () => {
    if (busy) return;
    lock(true);
    try {
      const {error} = await client.auth.signOut();
      if (error) throw error;
      await showSession(null);
    } catch (error) {
      message(error.message);
    } finally {
      lock(false);
    }
  };

  client.auth.onAuthStateChange((_event, session) => {
    // Run database requests after the auth callback finishes.
    setTimeout(() => {
      showSession(session).catch(error => message(error.message));
    }, 0);
  });
  const {data, error} = await client.auth.getSession();
  if (error) throw error;
  await showSession(data.session);
}

initialize().catch(error => {
  message('Account services could not load. You can still play as a guest. ' +
    error.message);
});


// Verified online directory, using the existing game connection.
let presenceSession = null;
let presenceTimer;

function onlineBox() {
  let box = document.getElementById('clubOnlineList');
  if (!box) {
    const section = document.createElement('section');
    section.className = 'panel';
    const heading = document.createElement('h2');
    heading.textContent = 'Players online';
    heading.style.marginTop = '0';
    box = document.createElement('div');
    box.id = 'clubOnlineList';
    box.style.lineHeight = '1.8';
    section.append(heading, box);
    document.getElementById('accountPanel').after(section);
  }
  return box;
}

function syncPresence(session) {
  presenceSession = session;
  clearTimeout(presenceTimer);
  if (!session) onlineBox().textContent = 'Log in to see club members online.';
  presenceTimer = setTimeout(() => {
    const socket = window.chessSocket;
    if (!socket?.connected) return;
    socket.emit('identify', {
      accessToken: presenceSession?.access_token || null
    }, result => {
      if (!result?.ok && result?.error)
        onlineBox().textContent = result.error;
    });
  }, 650);
}

const clubSocket = window.chessSocket;
if (clubSocket) {
  clubSocket.on('connect', () => syncPresence(presenceSession));
  clubSocket.on('disconnect', () => {
    onlineBox().textContent = 'Reconnecting to the club…';
  });
  clubSocket.on('clubOnline', members => {
    const box = onlineBox();
    box.replaceChildren();
    if (!presenceSession) {
      box.textContent = 'Log in to see club members online.';
      return;
    }
    const icons = {
      knight:'♞', king:'♚', queen:'♛',
      rook:'♜', bishop:'♝', pawn:'♟'
    };
    if (!members.length) box.textContent = 'Checking online players…';
    for (const member of members) {
      const row = document.createElement('div');
      row.textContent = (icons[member.avatar] || '♟') + ' ' +
        member.name + ' — ' + (member.playing ? 'Playing' : 'Online');
      box.append(row);
    }
  });
}
onlineBox().textContent = 'Connecting to the club…';
