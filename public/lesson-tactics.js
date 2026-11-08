import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';

const puzzles = [
  {
    title:'The Knight Fork',
    fen:'8/3q1k2/8/8/8/5N2/8/4K3 w - - 0 1',
    from:'f3',to:'e5',
    explanation:'A fork attacks two or more pieces at once.',
    hint:'Jump to e5 and attack the queen on d6.'
  },
  {
    title:'The Bishop Pin',
    fen:'6k1/5n2/8/8/8/8/4B3/K7 w - - 0 1',
    from:'e2',to:'c4',
    explanation:'Pin the knight to the king behind it.',
    hint:'Move your bishop to c4.'
  },
  {
    title:'The Rook Skewer',
    fen:'4q3/4k3/8/8/8/8/8/R6K w - - 0 1',
    from:'a1',to:'e1',
    explanation:'Check the king and expose the queen behind it.',
    hint:'Move your rook to e1.'
  }
];

let index=0;
let selected=null;
let solved=new Set();

const game=new Chess();

const board=new Chessboard(
  document.getElementById('tacticsBoard'),{
    position:game.fen(),
    orientation:'w',
    assetsUrl:'/vendor/cm-chessboard/assets/',
    style:{
      cssClass:'chessboard-js',
      borderType:BORDER_TYPE.thin,
      showCoordinates:true,
      pieces:{file:'pieces/standard.svg'},
      animationDuration:200
    }
  }
);

const title=document.getElementById('tacticTitle');
const instruction=document.getElementById('instruction');
const progress=document.getElementById('progress');
const stars=document.getElementById('stars');

function loadPuzzle(){
  const p=puzzles[index];
  game.load(p.fen);
  selected=null;
  board.setPosition(game.fen(),false);
  title.textContent=p.title;
  instruction.textContent=p.explanation+
    ' Find the best move for White.';
  progress.textContent=`Challenge ${index+1} of ${puzzles.length}`;
  stars.textContent=`${solved.size} of ${puzzles.length} earned ⭐`;
}

document.getElementById('tacticsBoard')
 .addEventListener('click',event=>{
   const square=event.target.closest('[data-square]')
     ?.getAttribute('data-square');

   if(!square || solved.has(index))return;

   const piece=game.get(square);

   if(piece?.color==='w'){
     selected=square;
     instruction.textContent='Now choose where to move.';
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

   if(selected!==p.from || square!==p.to){
     instruction.textContent='Good try! Look for a stronger tactical move.';
     return;
   }

   game.move({from:selected,to:square,promotion:'q'});
   board.setPosition(game.fen(),true);
   solved.add(index);
   selected=null;

   instruction.textContent=
     '⭐ Excellent! You solved '+p.title.toLowerCase()+'!';
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

document.getElementById('restartTactics')
 .addEventListener('click',()=>{
   index=0;
   solved.clear();
   loadPuzzle();
 });

loadPuzzle();
