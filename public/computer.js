import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';
import {Markers,MARKER_TYPE} from './vendor/cm-chessboard/src/extensions/markers/Markers.js';

const $ = id=>document.getElementById(id);
const game = new Chess();
const selectedMarker = {class:'practice-selected',slice:'markerFrame'};
const recessedMarker = {class:'practice-recessed',slice:'markerSquare'};
const lastMarker = {class:'practice-last',slice:'markerFrame'};
const checkMarker = {class:'practice-check',slice:'markerSquare'};
let human = 'w';
let level = 2;
let selected = null;
let thinking = false;
let worker = null;
let requestId = 0;

const board = new Chessboard($('computerBoard'),{
  position:game.fen(),
  orientation:human,
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

function paint(){
  board.setPosition(game.fen(),false);
  board.removeMarkers();
  const last = game.history({verbose:true}).at(-1);
  if(last){
    board.addMarker(MARKER_TYPE.frame,last.from);
    board.addMarker(recessedMarker,last.to);
    board.addMarker(lastMarker,last.to);
  }
  if(selected) board.addMarker(selectedMarker,selected);
  if(game.isCheck()){
    for(const row of game.board()){
      for(const piece of row){
        if(piece?.type==='k' && piece.color===game.turn()){
          board.addMarker(checkMarker,piece.square);
        }
      }
    }
  }
  let text;
  if(game.isCheckmate()){
    text = game.turn()===human ? 'Checkmate — computer wins.' : 'Checkmate — you win!';
  }else if(game.isDraw()){
    text = 'Game drawn.';
  }else{
    text = thinking ? 'Computer is thinking…' :
      game.turn()===human ? 'Your turn' : "Computer's turn";
    if(game.isCheck()) text += ' — Check!';
  }
  $('computerStatus').textContent = text;
  updateCapturedPieces();
  $('computerMoves').textContent = game.history()
    .map((move,i)=>(i%2===0 ? `${Math.floor(i/2)+1}. ` : '')+move)
    .join('  ');
}

function updateCapturedPieces(){
  const symbols = {
    w: {p:'♙',n:'♘',b:'♗',r:'♖',q:'♕'},
    b: {p:'♟',n:'♞',b:'♝',r:'♜',q:'♛'}
  };

  const captured = {w:[],b:[]};

  for(const move of game.history({verbose:true})){
    if(move.captured){
      captured[move.color].push(
        symbols[move.color === 'w' ? 'b' : 'w'][move.captured]
      );
    }
  }

  $('computerCapturedWhite').textContent =
    captured.w.join(' ') || 'None';

  $('computerCapturedBlack').textContent =
    captured.b.join(' ') || 'None';
}

function failure(text){
  thinking = false;
  paint();
  $('computerStatus').textContent = text;
  $('computerRetry').hidden = false;
}

function think(){
  if(thinking || game.isGameOver() || game.turn()===human) return;
  $('computerRetry').hidden = true;
  thinking = true;
  selected = null;
  paint();
  const fen = game.fen();
  const id = ++requestId;
  try{
    if(!worker){
      worker = level >= 3
        ? new Worker('/stockfish-worker.js')
        : new Worker('/computer-worker.js',{type:'module'});
      worker.onmessage = event=>{
        const result = event.data;
        if(result.id!==requestId || result.fen!==game.fen()) return;
        if(result.error || !result.move){
          failure(result.error || 'No computer move was returned.');
          return;
        }
        try{
          game.move(result.move);
          thinking = false;
          paint();
        }catch{
          failure('The computer returned an invalid move. Please retry.');
        }
      };
      worker.onerror = event=>{
        event.preventDefault();
        worker?.terminate();
        worker = null;
        failure('The computer could not load. Check your connection and retry.');
      };
    }
    worker.postMessage({id,fen,level});
  }catch{
    worker?.terminate();
    worker = null;
    failure('This browser could not start the computer. Please retry.');
  }
}

$('computerBoard').addEventListener('click',event=>{
  if(thinking || game.isGameOver() || game.turn()!==human) return;
  const square = event.target.closest('[data-square]')?.getAttribute('data-square');
  if(!square || !/^[a-h][1-8]$/.test(square)) return;
  const piece = game.get(square);
  if(selected===square){
    selected = null;
    paint();
    return;
  }
  if(piece?.color===human){
    selected = square;
    paint();
    return;
  }
  if(!selected) return;
  try{
    game.move({
      from:selected,to:square,
      promotion:$('computerPromotion').value
    });
    selected = null;
    paint();
    think();
  }catch{
    $('computerStatus').textContent = 'That move is not legal. Choose another square.';
  }
});

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

    entry.append(name, details, ' ', replayButton);
    container.appendChild(entry);
  }
}

$('computerSaveGame').onclick = () => {
  const status = $('computerExportStatus');

  if (!game.history().length) {
    status.textContent = 'Play a move before saving.';
    return;
  }

  const suggestedName = 'Practice Game ' +
    new Date().toLocaleDateString();

  const enteredName = prompt('Name this game:', suggestedName);
  if (enteredName === null) return;

  const name = enteredName.trim() || suggestedName;

  const difficultyNames = {
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

$('computerRetry').onclick = think;
$('computerNew').onclick = ()=>{
  if(game.history().length && !game.isGameOver() &&
    !confirm('Start a new practice game?')) return;
  requestId++;
  worker?.terminate();
  worker = null;
  thinking = false;
  selected = null;
  game.reset();
  human = $('computerSide').value;
  level = Number($('computerLevel').value);
  $('computerRetry').hidden = true;
  board.setOrientation(human,false);
  paint();
  think();
};

$('computerLevel').addEventListener('change', () => {
  const previous = level;
  $('computerNew').click();
  if (level === previous) {
    $('computerLevel').value = String(previous);
  }
});

paint();
