import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';
import {Markers} from './vendor/cm-chessboard/src/extensions/markers/Markers.js';

const boardElement = document.getElementById('lessonBoard');
const message = document.getElementById('message');

const names = {
  p:'Pawn',n:'Knight',b:'Bishop',
  r:'Rook',q:'Queen',k:'King'
};

const explanations = {
  p:'Pawns move forward one square, or two from their starting position. They capture diagonally.',
  n:'Knights move in an L shape: two squares in one direction and one sideways. They can jump over pieces.',
  b:'Bishops move diagonally any number of squares.',
  r:'Rooks move horizontally or vertically any number of squares.',
  q:'Queens combine the movement of rooks and bishops.',
  k:'Kings move one square in any direction, but cannot move into check.'
};

let game;
let selected = null;
let currentPiece = 'n';

const completedPieces = new Set();

function updateChallenge(){
  const challenge = document.getElementById('challengeText');
  const stars = document.getElementById('starCount');

  if(!challenge || !stars) return;

  const count = completedPieces.size;

  stars.textContent = `Stars earned: ${count} ⭐`;

  if(count === 6){
    challenge.textContent =
      'Congratulations! You mastered all six pieces! 🏆';
  }else if(completedPieces.has(currentPiece)){
    challenge.textContent =
      `Great work! You earned your ${names[currentPiece]} star. Try another piece!`;
  }else{
    challenge.textContent = currentPiece === 'p'
      ? 'Capture either black pawn diagonally to earn your Pawn star!'
      : `Challenge: Make one legal move with your ${names[currentPiece].toLowerCase()}.`;
  }
}


const board = new Chessboard(boardElement,{
  position:'8/7k/8/8/3N4/8/8/K7 w - - 0 1',
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

function setup(piece){
  currentPiece = piece;
  selected = null;

  const square = piece==='p'?'d2':'d4';

  const rows = Array.from({length:8},()=>Array(8).fill(null));

  const put = (sq,p) => {
    const file = sq.charCodeAt(0)-97;
    const rank = 8-Number(sq[1]);
    rows[rank][file] = p;
  };

  put(square,piece.toUpperCase());

  // Give the pawn two diagonal capture targets.
  if(piece==='p'){
    put('c3','p');
    put('e3','p');
  }

  if(piece==='k'){
    put('h8','k');
  }else{
    put('a1','K');
    put('h8','k');
  }

  const placement = rows.map(row=>{
    let result='',empty=0;
    for(const cell of row){
      if(!cell){empty++;continue;}
      if(empty){result+=empty;empty=0;}
      result+=cell;
    }
    if(empty)result+=empty;
    return result;
  }).join('/');

  game = new Chess(`${placement} w - - 0 1`);
  board.setPosition(game.fen(),false);
  board.removeMarkers();
  updateChallenge();

  message.textContent =
    `${names[piece]}: ${explanations[piece]} Click the piece to see its moves.`;
}

function showMoves(square){
  board.removeMarkers();

  const moves = game.moves({square,verbose:true});

  for(const move of moves){
    board.addMarker({
      class:'practice-recessed',
      slice:'markerSquare'
    },move.to);
  }
}

boardElement.addEventListener('click',event=>{
  const square = event.target.closest('[data-square]')
    ?.getAttribute('data-square');

  if(!square)return;

  const piece = game.get(square);

  if(piece?.color==='w' && piece.type===currentPiece){
    selected = square;
    showMoves(square);
    message.textContent =
      `Great! Now choose a highlighted square to move your ${names[currentPiece].toLowerCase()}.`;
    return;
  }

  if(!selected)return;

  const move = game.moves({square:selected,verbose:true})
    .find(m=>m.to===square);

  if(!move){
    message.textContent='That square is not a legal move. Try another.';
    return;
  }

  const from=selected;
  const promotion=move.promotion||'q';

  game.move({from,to:square,promotion});

  const nextSquare=square;
  const movedPiece=currentPiece;

  // Keep the piece on its destination square.
  // Return the turn to White for continued practice.
  const fen = game.fen().split(' ');
  fen[1] = 'w';
  fen[3] = '-';
  game = new Chess(fen.join(' '));

  selected = null;
  board.setPosition(game.fen(), false);
  board.removeMarkers();

  // Pawns earn their star only by capturing.
  if(movedPiece !== 'p' || move.captured){
    completedPieces.add(movedPiece);
  }
  updateChallenge();

  if(nextSquare!==from){
    message.textContent =
      `Well done! You made a legal ${names[movedPiece].toLowerCase()} move from ${from} to ${nextSquare}.`;
  }
});

document.querySelectorAll('[data-piece]').forEach(button=>{
  button.addEventListener('click',()=>setup(button.dataset.piece));
});

document.getElementById('resetLesson')
  .addEventListener('click',()=>setup(currentPiece));

setup('n');
