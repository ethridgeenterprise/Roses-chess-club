import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';

const game = new Chess();

const lesson = [
  ['e4','White controls the center with the king pawn.'],
  ['e5','Black challenges White for control of the center.'],
  ['Nf3','White develops a knight and attacks the e5 pawn.'],
  ['Nc6','Black develops a knight and defends e5.'],
  ['Bc4','White develops the bishop toward the vulnerable f7 square.'],
  ['Bc5','Black develops a bishop toward f2.'],
  ['O-O','White castles to protect the king.']
];

const board = new Chessboard(
  document.getElementById('openingBoard'),
  {
    position:game.fen(),
    orientation:'w',
    assetsUrl:'/vendor/cm-chessboard/assets/',
    style:{
      cssClass:'chessboard-js',
      borderType:BORDER_TYPE.thin,
      showCoordinates:true,
      pieces:{file:'pieces/standard.svg'},
      animationDuration:300
    }
  }
);


let step = 0;
let selected = null;
let waiting = false;

const instruction = document.getElementById('instruction');
const progress = document.getElementById('progress');
const nextButton = document.getElementById('nextMove');

function update(){
  progress.textContent = `Move ${step} of ${lesson.length}`;

  if(step >= lesson.length){
    instruction.textContent =
      '🏆 Excellent! You completed the Italian Game and castled safely!';
    nextButton.disabled = true;
  }else if(step % 2 === 0){
    instruction.textContent =
      `Your turn! Play ${lesson[step][0]}. Select your piece, then its destination.`;
    nextButton.disabled = false;
  }else{
    instruction.textContent =
      'Black is responding...';
    nextButton.disabled = true;
  }
}

function playMove(move){
  game.move(move);
  step++;
  board.setPosition(game.fen(),true);
  update();
}

function blackReply(){
  if(step >= lesson.length || step % 2 === 0)return;

  waiting = true;
  update();

  setTimeout(()=>{
    playMove(lesson[step][0]);
    waiting = false;
    update();
  },600);
}

document.getElementById('openingBoard')
  .addEventListener('click',event=>{
    if(waiting || step >= lesson.length || step % 2 !== 0)return;

    const square = event.target.closest('[data-square]')
      ?.getAttribute('data-square');

    if(!square)return;

    const piece = game.get(square);

    if(piece?.color === 'w'){
      selected = square;
      return;
    }

    if(!selected)return;

    const expected = lesson[step][0];
    const move = game.moves({square:selected,verbose:true})
      .find(m=>m.to === square);

    if(!move){
      instruction.textContent =
        'That is not a legal move. Try again.';
      return;
    }

    const test = new Chess(game.fen());
    const result = test.move({
      from:selected,
      to:square,
      promotion:'q'
    });

    if(result.san !== expected){
      instruction.textContent =
        `Good try! For this lesson, find the move ${expected}.`;
      return;
    }

    selected = null;
    playMove({from:move.from,to:move.to,promotion:'q'});
    blackReply();
  });

nextButton.textContent = 'Show Hint';
nextButton.addEventListener('click',()=>{
  if(step < lesson.length && step % 2 === 0){
    instruction.textContent =
      `Hint: Play ${lesson[step][0]}. Look for the piece that makes this move.`;
  }
});

document.getElementById('restartOpening')
  .addEventListener('click',()=>{
    game.reset();
    step = 0;
    selected = null;
    waiting = false;
    board.setPosition(game.fen(),false);
    update();
  });

update();
