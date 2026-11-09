import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';
import {Markers,MARKER_TYPE} from './vendor/cm-chessboard/src/extensions/markers/Markers.js';


const $ = id => document.getElementById(id);
let game = new Chess();
let human = 'w';
const level = 0;
const recessedMarker = {
  class:'practice-recessed', slice:'markerSquare'
};
const lastMarker = {
  class:'practice-last', slice:'markerFrame'
};
const replayGame = new Chess();
let replayBoard = null;
let replayMoves = [];
let replayIndex = 0;

function getReplayBoard(){
  if(!replayBoard){
    replayBoard = new Chessboard($('computerReplayBoard'),{
      position:replayGame.fen(),
      orientation:'w',
      assetsUrl:'/vendor/cm-chessboard/assets/',
      style:{
        cssClass:'chessboard-js',
        borderType:BORDER_TYPE.thin,
        showCoordinates:true,
        pieces:{file:'pieces/standard.svg'},
        animationDuration:150
      },
      extensions:[{class:Markers,props:{autoMarkers:null}}]
    });
  }
  return replayBoard;
}

$('computerCopyMoves').onclick = async () => {
  const moves = $('computerMoves').textContent.trim();
  const status = $('computerExportStatus');

  if (!moves) {
    status.textContent = 'Play a move first.';
    return;
  }

  try {
    await navigator.clipboard.writeText(moves);
    status.textContent = 'Moves copied!';
  } catch {
    status.textContent = 'Could not copy moves. Please select and copy them manually.';
  }
};

$('computerDownloadPgn').onclick = () => {
  const status = $('computerExportStatus');

  if (!game.history().length) {
    status.textContent = 'Play a move first.';
    return;
  }

  const pgn = game.pgn();
  const blob = new Blob([pgn + '\\n'], {
    type: 'application/x-chess-pgn'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'roses-chess-club-game.pgn';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'PGN downloaded!';
};


const savedGamesKey = 'rosesChessClubPracticeGames';

function readSavedGames(){
  try {
    const games = JSON.parse(localStorage.getItem(savedGamesKey) || '[]');
    return Array.isArray(games) ? games : [];
  } catch {
    return [];
  }
}

function updateReplayPosition(){
  replayGame.reset();

  for(let i = 0; i < replayIndex; i++){
    const move = replayMoves[i];
    replayGame.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || 'q'
    });
  }

  const replay = getReplayBoard();
  replay.setPosition(replayGame.fen(), false);
  replay.removeMarkers();

  if(replayIndex > 0){
    const last = replayMoves[replayIndex - 1];
    replay.addMarker(MARKER_TYPE.frame, last.from);
    replay.addMarker(recessedMarker, last.to);
    replay.addMarker(lastMarker, last.to);

    const moveNumber = Math.ceil(replayIndex / 2);
    const notation = replayIndex % 2
      ? moveNumber + '. ' + last.san
      : moveNumber + '... ' + last.san;

    $('computerReplayStatus').textContent =
      notation + ' — Move ' + replayIndex +
      ' of ' + replayMoves.length;
  } else {
    $('computerReplayStatus').textContent =
      'Starting position — ' + replayMoves.length +
      ' moves to replay.';
  }

  $('computerReplayStart').disabled = replayIndex === 0;
  $('computerReplayBack').disabled = replayIndex === 0;
  $('computerReplayNext').disabled =
    replayIndex === replayMoves.length;
  $('computerReplayEnd').disabled =
    replayIndex === replayMoves.length;
}

$('computerReplayStart').onclick = () => {
  replayIndex = 0;
  updateReplayPosition();
};

$('computerReplayBack').onclick = () => {
  if(replayIndex > 0) replayIndex--;
  updateReplayPosition();
};

$('computerReplayNext').onclick = () => {
  if(replayIndex < replayMoves.length) replayIndex++;
  updateReplayPosition();
};

$('computerReplayEnd').onclick = () => {
  replayIndex = replayMoves.length;
  updateReplayPosition();
};

$('computerReplayClose').onclick = () => {
  $('computerReplayRoom').hidden = true;
};

function openSavedReplay(saved){
  const loaded = new Chess();

  try {
    loaded.loadPgn(saved.pgn);
  } catch {
    $('computerExportStatus').textContent =
      'Could not open this saved game.';
    return;
  }

  replayMoves = loaded.history({verbose:true});
  replayIndex = 0;
  replayGame.reset();

  const room = $('computerReplayRoom');
  room.hidden = false;

  $('computerReplayTitle').textContent = saved.name;
  $('computerReplayStatus').textContent =
    'Starting position — ' + replayMoves.length + ' moves to replay.';

  const replay = getReplayBoard();
  replay.setOrientation(saved.side === 'b' ? 'b' : 'w', false);
  updateReplayPosition();

  room.scrollIntoView({behavior:'smooth',block:'start'});
}

function showSavedGames(){
  const container = $('computerSavedGames');
  const games = readSavedGames();
  container.replaceChildren();

  if (!games.length) {
    container.textContent = 'No saved games yet.';
    return;
  }

  for (const saved of games) {
    const entry = document.createElement('p');
    const name = document.createElement('strong');
    name.textContent = saved.name;

    const details = document.createElement('span');
    details.textContent = ' — ' + saved.date + ' · ' + saved.difficulty;

    const replayButton = document.createElement('button');
    replayButton.type = 'button';
    replayButton.textContent = 'Replay';
    replayButton.onclick = () => openSavedReplay(saved);

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.textContent = 'Download';
    downloadButton.onclick = () => {
      const blob = new Blob([saved.pgn + '\n'], {
        type: 'application/x-chess-pgn'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = saved.name.replace(/[^a-z0-9_-]/gi, '_') + '.pgn';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = () => {
      if(!confirm('Delete saved game "' + saved.name + '"?')) return;

      const remaining = readSavedGames().filter(
        item => item.id !== saved.id
      );

      try {
        localStorage.setItem(savedGamesKey, JSON.stringify(remaining));
        $('computerReplayRoom').hidden = true;
        showSavedGames();
        $('computerExportStatus').textContent = 'Saved game deleted.';
      } catch {
        $('computerExportStatus').textContent =
          'Could not delete saved game.';
      }
    };

    entry.append(
      name, details, ' ',
      replayButton, ' ',
      downloadButton, ' ',
      deleteButton
    );
    container.appendChild(entry);
  }
}

$('computerSaveGame').onclick = () => {
  const status = $('computerExportStatus');

  if (!game.history().length) {
    status.textContent = 'Play a move before saving.';
    return;
  }

  const suggestedName = 'Player Game ' +
    new Date().toLocaleDateString();

  const enteredName = prompt('Name this game:', suggestedName);
  if (enteredName === null) return;

  const name = enteredName.trim() || suggestedName;

  const difficultyNames = {
    0:'Player-to-player',
    1:'Beginner',
    2:'Casual',
    3:'Intermediate',
    4:'Advanced',
    5:'Expert'
  };

  const saved = {
    id: crypto.randomUUID(),
    name,
    date: new Date().toLocaleString(),
    difficulty: difficultyNames[level] || 'Unknown',
    side: human,
    pgn: game.pgn()
  };

  const games = readSavedGames();
  games.unshift(saved);

  try {
    localStorage.setItem(savedGamesKey, JSON.stringify(games));
    showSavedGames();
    status.textContent = 'Game saved to My Game Collection!';
  } catch {
    status.textContent = 'Could not save. Browser storage may be full or unavailable.';
  }
};

showSavedGames();



function updateMultiplayerCollection(state){
  if(!state) return;
  try{
    const snapshot = new Chess();
    for(const move of state.history){
      snapshot.move({
        from:move.from,
        to:move.to,
        promotion:move.promotion || 'q'
      });
    }
    if(snapshot.fen() !== state.fen){
      throw new Error('Move history does not match the board.');
    }
    let result = '*';
    if(state.checkmate){
      result = state.turn === 'w' ? '0-1' : '1-0';
    }else if(state.resigned || state.timeout){
      result = (state.resigned || state.timeout) === 'w'
        ? '0-1' : '1-0';
    }else if(state.over){
      result = '1/2-1/2';
    }
    snapshot.header(
      'Event', "Rose's Chess Club — Player-to-player",
      'Result', result
    );
    game = snapshot;
    human = window.getClubGameContext().color || 'w';

    const symbols = {
      w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕'},
      b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛'}
    };
    const captures = {w:[],b:[]};
    for(const move of game.history({verbose:true})){
      if(move.captured){
        captures[move.color].push(
          symbols[move.color === 'w' ? 'b' : 'w'][move.captured]
        );
      }
    }
    $('computerCapturedWhite').textContent =
      captures.w.join(' ') || 'None';
    $('computerCapturedBlack').textContent =
      captures.b.join(' ') || 'None';
    $('computerMoves').textContent = game.history()
      .map((move,i)=>(i%2===0 ? `${Math.floor(i/2)+1}. ` : '')+move)
      .join('  ');
    for(const id of [
      'computerCopyMoves','computerDownloadPgn','computerSaveGame'
    ]){
      $(id).disabled = !state.history.length;
    }
  }catch(error){
    for(const id of [
      'computerCopyMoves','computerDownloadPgn','computerSaveGame'
    ]){
      $(id).disabled = true;
    }
    $('computerExportStatus').textContent =
      'Could not prepare this game for saving. Please reconnect.';
    console.error(error);
  }
}

window.chessSocket.on('state', updateMultiplayerCollection);
updateMultiplayerCollection(window.getClubGameContext().state);
window.addEventListener('storage', event => {
  if(event.key === savedGamesKey) showSavedGames();
});
