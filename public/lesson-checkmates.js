import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';

const puzzles = [
  {
    title:'Queen Checkmate',
    fen:'7k/8/5KQ1/8/8/8/8/8 w - - 0 1',
    from:'g6',to:'g7',
    hint:'Move the queen to g7.',
    explanation:'Use the queen and king together to trap the enemy king.'
  },
  {
    title:'Rook Checkmate',
    fen:'7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    from:'a1',to:'a8',
    hint:'Move the rook from a1 to a8.',
    explanation:'A rook can deliver checkmate when the king controls escape squares.'
  },
  {
    title:'Back-Rank Checkmate',
    fen:'6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
    from:'e1',to:'e8',
    hint:'Move the rook to e8.',
    explanation:'A king trapped behind its own pawns is vulnerable to back-rank mate.'
  }
];

let index=0;
let selected=null;
const solved=new Set();
const game=new Chess();

const board=new Chessboard(
  document.getElementById('checkmateBoard'),{
    position:game.fen(),
    orientation:'w',
    assetsUrl:'/vendor/cm-chessboard/assets/',
    style:{
      borderType:BORDER_TYPE.thin,
      showCoordinates:true,
      pieces:{file:'pieces/standard.svg'},
      animationDuration:200
    }
  }
);

const title=document.getElementById('checkmateTitle');
const instruction=document.getElementById('instruction');
const progress=document.getElementById('progress');
const stars=document.getElementById('stars');

function loadPuzzle(){
  const p=puzzles[index];
  game.load(p.fen);
  selected=null;
  board.setPosition(game.fen(),false);
  title.textContent=p.title;
  instruction.textContent=p.explanation+' Find checkmate in one move!';
  progress.textContent=`Challenge ${index+1} of ${puzzles.length}`;
  stars.textContent=`${solved.size} of ${puzzles.length} earned ⭐`;
}

document.getElementById('checkmateBoard')
  .addEventListener('click',event=>{
    const square=event.target.closest('[data-square]')
      ?.getAttribute('data-square');

    if(!square||solved.has(index))return;

    const piece=game.get(square);

    if(piece?.color==='w'){
      selected=square;
      instruction.textContent='Choose the destination square.';
      return;
    }

    if(!selected)return;

    const p=puzzles[index];
    const move=game.moves({square:selected,verbose:true})
      .find(m=>m.to===square);

    if(!move){
      instruction.textContent='That move is not legal. Try again.';
      return;
    }

    if(selected!==p.from||square!==p.to){
      instruction.textContent='Not quite! Look for checkmate in one.';
      return;
    }

    game.move({from:selected,to:square,promotion:'q'});

    if(!game.isCheckmate()){
      game.undo();
      instruction.textContent='That move is not checkmate. Try again.';
      return;
    }

    board.setPosition(game.fen(),true);
    solved.add(index);
    selected=null;

    instruction.textContent='♛ CHECKMATE! Excellent work! ⭐';
    stars.textContent=`${solved.size} of ${puzzles.length} earned ⭐`;
  });

document.getElementById('hintButton')
  .addEventListener('click',()=>{
    instruction.textContent=puzzles[index].hint;
  });

document.getElementById('nextChallenge')
  .addEventListener('click',()=>{
    index=(index+1)%puzzles.length;
    loadPuzzle();
  });

document.getElementById('restartCheckmates')
  .addEventListener('click',()=>{
    index=0;
    solved.clear();
    loadPuzzle();
  });

loadPuzzle();
