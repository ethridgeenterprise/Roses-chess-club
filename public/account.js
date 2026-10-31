import {avatarElement, refreshAvatarPreview, installAvatarControls} from './avatars.js';
import {countries, countryBadge, countryName} from './countries.js';

const countryField = document.createElement('p');
const countryLabel = document.createElement('label');
countryLabel.htmlFor = 'playerCountry';
countryLabel.textContent = 'Country or territory (optional)';
const countrySelect = document.createElement('select');
countrySelect.id = 'playerCountry';
countrySelect.style.cssText =
  'font:inherit;padding:10px;width:100%;max-width:100%;margin-top:6px';
countrySelect.append(new Option('No flag / prefer not to say', ''));
for(const country of countries){
  countrySelect.append(new Option(country.name + ' (' + country.code + ')', country.code));
}
const countryHelp = document.createElement('span');
countryHelp.className = 'small';
countryHelp.textContent = 'Your selection is shown beside your player name.';
countryLabel.append(document.createElement('br'), countrySelect);
countryField.append(countryLabel, document.createElement('br'), countryHelp);
document.getElementById('playerAvatar').closest('p').after(countryField);


const byId = id => document.getElementById(id);
const message = text => { byId('accountMessage').textContent = text; };
let client, currentUser = null, busy = false;
let renderVersion = 0;

let editingProfile = false;

const compactAccountRow = document.createElement('div');
compactAccountRow.className = 'actions hidden';
compactAccountRow.style.cssText = 'gap:12px;justify-content:space-between';
const compactIdentity = document.createElement('div');
compactIdentity.style.cssText =
  'display:flex;align-items:center;min-width:0;flex:1;overflow-wrap:anywhere';
const compactActions = document.createElement('div');
compactActions.className = 'actions';
const editProfileButton = document.createElement('button');
editProfileButton.type = 'button';
editProfileButton.className = 'secondary';
editProfileButton.textContent = 'Edit profile';
editProfileButton.setAttribute('aria-controls','profileForm');
editProfileButton.setAttribute('aria-expanded','false');
compactActions.append(editProfileButton, byId('logout'));
compactAccountRow.append(compactIdentity,compactActions);
byId('profileForm').before(compactAccountRow);

function updateProfileVisibility(){
  const signedIn = !!currentUser;
  compactAccountRow.classList.toggle('hidden',!signedIn);
  byId('profileForm').classList.toggle('hidden',!signedIn || !editingProfile);
  editProfileButton.textContent = editingProfile ? 'Close profile' : 'Edit profile';
  editProfileButton.setAttribute('aria-expanded',String(signedIn && editingProfile));
}

editProfileButton.onclick = () => {
  if(busy) return;
  editingProfile = !editingProfile;
  updateProfileVisibility();
  if(editingProfile) byId('playerName').focus();
};



function lock(value) {
  busy = value;
  document.querySelectorAll(
    '#accountPanel button, #accountPanel input, #accountPanel select'
  ).forEach(el => { el.disabled = value; });
}

async function showSession(session) {
  const version = ++renderVersion;
  const nextUser = session?.user || null;
  if(currentUser?.id !== nextUser?.id){
    editingProfile = false;
    compactIdentity.textContent = nextUser ? 'Signed in' : '';
  }
  currentUser = nextUser;
  syncPresence(session);
  byId('accountForm').classList.toggle('hidden', !!currentUser);
  updateProfileVisibility();
  if (!currentUser) {
    refreshAvatarPreview({}, null);
    message('Log in to your club profile, or play as a guest below.');
    byId('accountPassword').value = '';
    return;
  }

  message('Loading your profile…');
  const {data, error} = await client.from('profiles')
    .select('display_name,avatar,avatar_path,country_code,rating,wins,losses,draws,rated_games')
    .eq('id', currentUser.id).single();
  if (version !== renderVersion) return;
  if (error) {
    message('Signed in, but the profile could not load: ' + error.message);
    return;
  }
  refreshAvatarPreview(data, currentUser.id);
  const playerLabel = document.createElement('span');
  playerLabel.textContent = countryBadge(data.country_code) + data.display_name;
  compactIdentity.replaceChildren(avatarElement(data,44),playerLabel);
  byId('playerName').value = data.display_name;
  byId('playerAvatar').value = data.avatar;
  byId('playerCountry').value = data.country_code || '';
  const avatars = {
    knight:'♞', king:'♚', queen:'♛', rook:'♜', bishop:'♝', pawn:'♟'
  };
  message(avatars[data.avatar] + ' Signed in as ' + countryBadge(data.country_code) + data.display_name);
  byId('memberStats').textContent =
    'Club rating: ' + data.rating + (data.rated_games<20?' (provisional) · ':' · ') +
    data.wins + ' wins · ' + data.losses + ' losses · ' +
    data.draws + ' draws · ' + data.rated_games + ' rated games';
}

async function initialize() {
  const {createClient} = await import(
    'https://esm.sh/@supabase/supabase-js@2'
  );
  client = createClient(
    'https://blvwmyhxomhjbksnrqzy.supabase.co',
    'sb_publishable_oG0HIPDTRKBBYVvDuTICJA_NTf9FSY5'
  );

  installAvatarControls(client, () => currentUser, async () => {
    const {data,error} = await client.auth.getSession();
    if(error) throw error;
    await showSession(data.session);
  });

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
          emailRedirectTo: 'https://loveforchess.onrender.com/'
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
        avatar: byId('playerAvatar').value,
        country_code: byId('playerCountry').value || null
      }).eq('id', currentUser.id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('Profile was not saved.');
      const {data: auth, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw sessionError;
      await showSession(auth.session);
      editingProfile = false;
      updateProfileVisibility();
      message('Profile saved.');
      editProfileButton.focus();
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

function attachClubPresence(){
  const clubSocket = window.chessSocket;
  if(!clubSocket){
    setTimeout(attachClubPresence, 100);
    return;
  }
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
      row.append(avatarElement(member), document.createTextNode(
        countryBadge(member.country_code) + member.name + ' — ' +
        (member.playing ? 'Playing' : 'Online')
      ));
      row.style.padding = '5px 0';
      row.title = countryName(member.country_code);

      if (member.id !== currentUser?.id && !member.playing) {
        const challenge = document.createElement('button');
        challenge.type = 'button';
        challenge.className = 'secondary';
        challenge.textContent = 'Challenge';
        challenge.setAttribute('aria-label', 'Challenge ' + member.name);
        challenge.style.cssText = 'margin-left:12px;padding:6px 10px';
        challenge.onclick = () => {
          window.sendClubChallenge(member.id, member.name);
        };
        row.append(challenge);
      }
      box.append(row);
    }
  });
}
}
onlineBox().textContent = 'Connecting to the club…';
attachClubPresence();

window.addEventListener('clubProfileRefresh',async()=>{
  try{
    if(!client)return;
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    await showSession(data.session);
  }catch(error){
    message('Game saved. Refresh to reload your profile.');
  }
});
