const base = 'https://blvwmyhxomhjbksnrqzy.supabase.co/storage/v1/object/public/club-avatars/';
const icons = {
  knight:'♞', king:'♚', queen:'♛', rook:'♜', bishop:'♝', pawn:'♟'
};
let localRevision = 0;
let activeUser = null;
let previewBox = null;
let selectedFile = null;
let previewUrl = null;
let savedProfile = {};
let working = false;
let taskVersion = 0;

function validPath(path){
  return typeof path === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.webp$/.test(path);
}

export function avatarElement(profile, size=40){
  const box = document.createElement('span');
  box.style.cssText =
    `display:inline-flex;width:${size}px;height:${size}px;flex-shrink:0;` +
    'vertical-align:middle;align-items:center;justify-content:center;' +
    'margin-right:8px;border:2px solid #bba17d;border-radius:50%;' +
    'overflow:hidden;background:#f0e3ce;color:#211b15;font-size:26px';
  const fallback = () => {
    box.textContent = icons[profile.avatar] || '♟';
  };
  fallback();
  if(validPath(profile.avatar_path)){
    const image = document.createElement('img');
    image.alt = '';
    image.width = size;
    image.height = size;
    image.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => box.replaceChildren(image);
    image.onerror = fallback;
    const revision = Math.max(localRevision, Math.floor(Date.now()/30000)*30000);
    image.src = base + profile.avatar_path + '?v=' + revision;
  }
  return box;
}

function releasePreview(){
  if(previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

export function refreshAvatarPreview(profile, userId){
  const changed = activeUser !== userId;
  if(changed){
    taskVersion++;
    working = false;
  }
  activeUser = userId;
  savedProfile = profile || {};
  selectedFile = null;
  releasePreview();
  if(!previewBox) return;
  previewBox.replaceChildren(avatarElement(savedProfile, 80));
  const input = document.getElementById('avatarFile');
  if(input) input.value = '';
  for(const id of ['avatarUpload','avatarRemove']){
    const button = document.getElementById(id);
    if(button) button.disabled = !userId;
  }
  document.getElementById('avatarUpload').disabled = true;
  document.getElementById('avatarRemove').disabled =
    !userId || !validPath(savedProfile.avatar_path);
  document.getElementById('avatarStatus').textContent = '';
}

async function squareImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
    throw new Error('Choose a JPG, PNG, or WebP picture.');
  }
  if(file.size > 8*1024*1024){
    throw new Error('Choose a picture smaller than 8 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try{
    if(!bitmap.width || !bitmap.height) throw new Error('Picture could not load.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0e3ce';
    ctx.fillRect(0,0,256,256);
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap,
      (bitmap.width-side)/2,(bitmap.height-side)/2,side,side,
      0,0,256,256);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.85));
    if(!blob || blob.type !== 'image/webp') throw new Error('This browser cannot prepare the picture.');
    if(blob.size > 524288) throw new Error('Picture is too large after resizing.');
    return blob;
  }finally{
    bitmap.close();
  }
}

export function installAvatarControls(client, getUser, refresh){
  if(document.getElementById('avatarUploadPanel')) return;
  const panel = document.createElement('div');
  panel.id = 'avatarUploadPanel';
  const title = document.createElement('p');
  title.textContent = 'Profile picture';
  title.style.fontWeight = '700';
  previewBox = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = 'avatarFile';
  label.textContent = 'Choose picture';
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'avatarFile';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.style.cssText =
    'display:block;width:100%;text-transform:none;margin:8px 0';
  const help = document.createElement('p');
  help.className = 'small';
  help.textContent =
    'JPG, PNG, or WebP, up to 8 MB. A square is taken from the center. ' +
    'Uploaded pictures are public.';
  const actions = document.createElement('div');
  actions.className = 'actions';
  const upload = document.createElement('button');
  upload.id = 'avatarUpload';
  upload.type = 'button';
  upload.textContent = 'Upload picture';
  upload.disabled = true;
  const remove = document.createElement('button');
  remove.id = 'avatarRemove';
  remove.type = 'button';
  remove.className = 'secondary';
  remove.textContent = 'Remove picture';
  const status = document.createElement('p');
  status.id = 'avatarStatus';
  status.setAttribute('role','status');
  actions.append(upload,remove);
  panel.append(title,previewBox,label,input,help,actions,status);
  document.getElementById('playerAvatar').closest('p').before(panel);

  input.onchange = async () => {
    if(working) return;
    const version = ++taskVersion;
    selectedFile = null;
    upload.disabled = true;
    releasePreview();
    const file = input.files[0];
    if(!file){
      previewBox.replaceChildren(avatarElement(savedProfile,80));
      return;
    }
    status.textContent = 'Preparing preview…';
    try{
      const blob = await squareImage(file);
      if(version !== taskVersion) return;
      selectedFile = blob;
      previewUrl = URL.createObjectURL(blob);
      const image = document.createElement('img');
      image.src = previewUrl;
      image.alt = 'Preview of your new profile picture';
      image.style.cssText =
        'width:80px;height:80px;border-radius:50%;border:2px solid #bba17d;object-fit:cover';
      previewBox.replaceChildren(image);
      upload.disabled = false;
      status.textContent = 'Preview ready. Click Upload picture to save it.';
    }catch(error){
      if(version === taskVersion) status.textContent = error.message;
    }
  };

  async function perform(removing){
    const user = getUser();
    if(working || !user || (!removing && !selectedFile)) return;
    if(removing && !confirm('Remove your uploaded profile picture?')) return;
    const version = ++taskVersion;
    const blob = selectedFile;
    const path = user.id + '/avatar.webp';
    working = true;
    input.disabled = upload.disabled = remove.disabled = true;
    status.textContent = removing ? 'Removing picture…' : 'Uploading picture…';
    try{
      if(!removing){
        const {error} = await client.storage.from('club-avatars')
          .upload(path,blob,{
            upsert:true,contentType:'image/webp',cacheControl:'0'
          });
        if(error) throw error;
      }
      if(getUser()?.id !== user.id) return;
      const {data,error} = await client.from('profiles')
        .update({avatar_path:removing ? null : path})
        .eq('id',user.id).select('id').single();
      if(error) throw error;
      if(!data) throw new Error('Profile picture was not saved.');
      let cleanupFailed = false;
      if(removing){
        const {error} = await client.storage.from('club-avatars').remove([path]);
        cleanupFailed = !!error;
      }
      if(getUser()?.id !== user.id) return;
      localRevision = Date.now();
      await refresh();
      status.textContent = cleanupFailed
        ? 'Picture removed from your profile. Stored image deletion failed; please try removing it again later.'
        : removing ? 'Profile picture removed.' : 'Profile picture saved.';
      window.dispatchEvent(new Event('clubProfileRefresh'));
    }catch(error){
      if(getUser()?.id === user.id) status.textContent = error.message;
    }finally{
      // refresh() may have advanced the session version.
      if(getUser()?.id === user.id){
        working = false;
        input.disabled = false;
        upload.disabled = !selectedFile;
        remove.disabled = !validPath(savedProfile.avatar_path);
      }
    }
  }
  upload.onclick = () => perform(false);
  remove.onclick = () => perform(true);
  refreshAvatarPreview(savedProfile,getUser()?.id || null);
}
