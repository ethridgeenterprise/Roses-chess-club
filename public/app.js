import {Chessboard, BORDER_TYPE} from "/vendor/cm-chessboard/src/Chessboard.js";
import {Markers, MARKER_TYPE} from "/vendor/cm-chessboard/src/extensions/markers/Markers.js";

let clubBoard = null;
const checkMarker = {class:"club-check-marker", slice:"markerSquare"};
const selectedMarker = {class:"club-selected-marker", slice:"markerFrame"};
const selectedFill = {class:"club-selected-fill", slice:"markerSquare"};
const movedFill = {class:"club-moved-fill", slice:"markerSquare"};
const lastMoveMarker = {class:"club-last-move-marker", slice:"markerFrame"};

function renderCmBoard(){
  if(!state || document.getElementById('game').classList.contains('hidden')) return;
  const orientation = color === 'b' ? 'b' : 'w';
  if(!clubBoard){
    clubBoard = new Chessboard(document.getElementById('board'), {
      position:state.fen,
      orientation,
      assetsUrl:"/vendor/cm-chessboard/assets/",
      style:{
        cssClass:"chessboard-js",
        borderType:BORDER_TYPE.thin,
        showCoordinates:true,
        pieces:{file:"pieces/standard.svg"},
        animationDuration:150
      },
      extensions:[{class:Markers,props:{autoMarkers:null}}]
    });
    document.getElementById('board').addEventListener('click', event=>{
      const square = event.target.closest('[data-square]')?.getAttribute('data-square');
      if(square && /^[a-h][1-8]$/.test(square)) tap(square);
    });
  }
  if(clubBoard.getOrientation() !== orientation){
    clubBoard.setOrientation(orientation, false);
  }
  clubBoard.setPosition(state.fen, false);
  clubBoard.removeMarkers();
  const last = state.history.at(-1);
  if(last){
    clubBoard.addMarker(MARKER_TYPE.frame, last.from);
    clubBoard.addMarker(movedFill, last.to);
    clubBoard.addMarker(lastMoveMarker, last.to);
  }
  if(selected){
    clubBoard.addMarker(selectedFill, selected);
    clubBoard.addMarker(selectedMarker, selected);
  }
  if(state.check){
    for(const file of 'abcdefgh'){
      for(let rank=1;rank<=8;rank++){
        const square=file+rank;
        const piece=pieceAt(square);
        if(piece && piece.toLowerCase()==='k' &&
           (piece===piece.toUpperCase()?'w':'b')===state.turn){
          clubBoard.addMarker(checkMarker,square);
        }
      }
    }
  }
}

const socket=io(),$=id=>document.getElementById(id);let room='',color='',token='',state=null,selected=null,pending=null;
window.chessSocket=socket;
window.getClubGameContext = () => ({color,state});
const pieces={wk:'♚',wq:'♛',wr:'♜',wb:'♝',wn:'♞',wp:'♟',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
const key=id=>'aaron-chess-'+id;

const lastRoomKey = 'club-last-room-v1';

function savedRoom(){
  try{
    const id = localStorage.getItem(lastRoomKey);
    return id && /^[A-Z0-9]{6}$/.test(id) &&
      localStorage.getItem(key(id)) ? id : null;
  }catch{return null}
}

function rememberRoom(id){
  try{localStorage.setItem(lastRoomKey,id)}catch{}
  updateResumeButton();
}

function forgetRoom(id){
  try{
    if(localStorage.getItem(lastRoomKey) === id){
      localStorage.removeItem(lastRoomKey);
    }
  }catch{}
  updateResumeButton();
}

const resumeBox = document.createElement('div');
resumeBox.style.cssText = 'margin-bottom:16px';
const resumeButton = document.createElement('button');
resumeButton.type = 'button';
resumeButton.textContent = 'Resume last game';
resumeButton.style.cssText = 'padding:14px 20px;font-size:18px';
const resumeStatus = document.createElement('p');
resumeStatus.className = 'small';
resumeStatus.setAttribute('role','status');
resumeBox.append(resumeButton,resumeStatus);
document.getElementById('lobby').prepend(resumeBox);

function updateResumeButton(){
  const id = savedRoom();
  resumeBox.hidden = !id;
  resumeButton.title = id ? 'Return to room ' + id : '';
}

resumeButton.onclick = () => {
  const id = savedRoom();
  if(!id){
    updateResumeButton();
    return;
  }
  if(!socket.connected){
    resumeStatus.textContent = 'Reconnecting to the club. Please try again shortly.';
    return;
  }
  const seatToken = localStorage.getItem(key(id));
  if(!seatToken) return;
  resumeButton.disabled = true;
  resumeStatus.textContent = 'Opening your last game…';
  const timer = setTimeout(()=>{
    resumeButton.disabled = false;
    resumeStatus.textContent = 'No response yet. Check your connection and try again.';
  },12000);
  enter(id,seatToken,(ok,error)=>{
    clearTimeout(timer);
    resumeButton.disabled = false;
    if(ok){
      resumeStatus.textContent = '';
      return;
    }
    if(error === 'Room not found'){
      forgetRoom(id);
      alert('Your last game is no longer available. The server may have restarted. You can create a new game.');
    }else{
      resumeStatus.textContent = error ||
        'Could not resume. If this was a challenge, log in and wait until your name appears online, then try again.';
    }
  });
};

updateResumeButton();
window.addEventListener('storage',updateResumeButton);


function toast(s){$('toast').textContent=s}function enter(id,t,onResult,attempt=0){socket.emit('join',{id,token:t},r=>{if(!r.ok){if(t&&attempt<12&&/^Log in/.test(r.error||'')){setTimeout(()=>enter(id,t,onResult,attempt+1),750);return}if(onResult)onResult(false,r.error);else alert(r.error);return}room=r.id;color=r.color;token=r.token;localStorage.setItem(key(room),token);rememberRoom(room);history.replaceState(null,'',`?room=${room}`);$('lobby').classList.add('hidden');$('roomPanel').classList.remove('hidden');$('game').classList.remove('hidden');$('roomId').textContent=room;$('identity').textContent=`You play ${color==='w'?'White':'Black'}. ${color==='w'?'Send Rose the invite link.':'You are ready to play!'}`;toast('Connected to chess room');if(state)paint();if(onResult)onResult(true)})}
$('create').onclick=()=>socket.emit('create',{
      rated:document.getElementById('gameMode')?.value==='rated'
    },r=>{
      if(!r.ok){alert(r.error||'Could not create game');return}
      enter(r.id,r.token)
    });$('join').onclick=()=>enter($('code').value.trim().toUpperCase(),null);
$('copy').onclick=async()=>{const url=`${location.origin}/?room=${room}`;try{await navigator.clipboard.writeText(url);toast('Invite link copied!')}catch{prompt('Copy this link:',url)}};
$('restart').onclick=()=>{if(confirm('Start a new game? This resets the board for both players.'))socket.emit('restart',{},r=>{if(!r.ok)toast(r.error||'Could not restart')})};
function pieceAt(sq){const file=sq.charCodeAt(0)-97,rank=8-Number(sq[1]);return state.fen.split(' ')[0].split('/')[rank].replace(/[1-8]/g,n=>' '.repeat(+n))[file].trim()}
function paint(){if(!state)return;renderCmBoard();paintClocks();
if(state.scores){
  for(const side of ['w','b']){
    const score=state.scores[side];
    document.getElementById('score-'+side).textContent=
      (side==='w'?'White':'Black')+': '+
      score.wins+' wins · '+score.losses+' losses · '+score.draws+' draws';
  }
}
let status=state.over?(state.checkmate?`${state.turn==='w'?'Black':'White'} wins by checkmate!`:'Game drawn or ended.'):state.turn===color?'Your turn':`Waiting for ${state.turn==='w'?'White':'Black'}`;if(state.timeout)status=`${state.timeout==='w'?'White':'Black'} ran out of time — ${state.timeout==='w'?'Black':'White'} wins!`;if(state.resigned)status=`${state.resigned==='w'?'White':'Black'} resigned — ${state.resigned==='w'?'Black':'White'} wins!`;$('resign').disabled=state.over||!state.players.b;if(state.check&&!state.over)status+=' — Check!';if(!state.players.b)status='Waiting for second player to join';$('status').textContent=status;$('moves').textContent=state.history.map((m,i)=>(i%2===0?`${Math.floor(i/2)+1}. `:'')+m.san).join('   ')}
function legalTarget(from,to){if(from===to)return false;const p=pieceAt(from),dest=pieceAt(to);if(!p)return false;const mine=p===p.toUpperCase()?'w':'b';if(dest&&(dest===dest.toUpperCase()?'w':'b')===mine)return false;return true}
function tap(sq){if(!state||state.over||state.turn!==color||!state.players.b)return;const p=pieceAt(sq),mine=p&&(p===p.toUpperCase()?'w':'b')===color;if(!selected){if(mine){selected=sq;paint()}return}if(selected===sq){selected=null;paint();return}if(mine){selected=sq;paint();return}const from=selected;selected=null;const pawn=pieceAt(from)?.toLowerCase()==='p';if(pawn&&(sq[1]==='1'||sq[1]==='8')){pending={from,to:sq};$('promotion').classList.remove('hidden');paint();return}sendMove({from,to:sq,promotion:'q'})}
function sendMove(move){socket.emit('move',move,r=>{if(!r.ok)toast(r.error||'Move not allowed');else toast('')})}
document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{if(pending){sendMove({...pending,promotion:b.dataset.p});pending=null;$('promotion').classList.add('hidden')}});
socket.on('state',s=>{state=s;selected=null;if(s.over&&room)forgetRoom(room);paint()});socket.on('presence',()=>toast('Opponent disconnected. Their seat is saved; they can rejoin.'));socket.on('connect',()=>{if(room)enter(room,token)});
const invite=new URLSearchParams(location.search).get('room');if(invite&&/^[A-Z0-9]{6}$/i.test(invite)){const id=invite.toUpperCase();$('code').value=id;enter(id,localStorage.getItem(key(id)))}

let clockReceivedAt=performance.now();
socket.on('state',()=>{clockReceivedAt=performance.now();paintClocks()});
function paintClocks(){
  if(!state||!state.clock)return;
  for(const side of ['w','b']){
    const el=document.getElementById('clock-'+side);
    if(!el)continue;
    const running=state.clock.running===side;
    const remaining=Math.max(0,state.clock[side]-
      (running?performance.now()-clockReceivedAt:0));
    const seconds=Math.ceil(remaining/1000);
    el.textContent=(side==='w'?'White':'Black')+'  '+
      Math.floor(seconds/60).toString().padStart(2,'0')+':'+
      (seconds%60).toString().padStart(2,'0');
    el.classList.toggle('running',running);
    el.classList.toggle('low-time',remaining<15000);
  }
}
setInterval(paintClocks,200);

$('resign').onclick=()=>{
  if(confirm('Resign this game? Your opponent will win.')){
    socket.emit('resign',{},r=>{
      toast(r.ok?'Game ended by resignation.':r.error||'Could not resign');
    });
  }
};

socket.on('gameSaved',result=>{
  toast(result.ok?'Game saved to both player profiles.':result.error);
  if(result.ok)window.dispatchEvent(new Event('clubProfileRefresh'));
});


// Join accepted club challenges through the existing game flow.
window.joinClubRoom = function(id, seatToken) {
  if (typeof id !== 'string' || !/^[A-Z0-9]{6}$/.test(id)) return;
  enter(id, seatToken || localStorage.getItem(key(id)));
};

// club-support-scripts: initialize after chessSocket and joinClubRoom exist.
for (const source of [
  '/computer-link.js',
  '/draw-ui.js',
  '/rated-ui.js',
  '/leaderboard.js',
  '/challenges-ui.js'
]) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load ' + source));
    document.body.append(script);
  });
}

// multiplayer-game-collection
await import('/player-collection.js');
