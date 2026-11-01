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
  $('computerMoves').textContent = game.history()
    .map((move,i)=>(i%2===0 ? `${Math.floor(i/2)+1}. ` : '')+move)
    .join('  ');
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
      worker = new Worker('/computer-worker.js',{type:'module'});
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

paint();
