import {Chess} from './vendor/chess-rules/chess.js';

const values = {p:100,n:320,b:330,r:500,q:900,k:0};
let deadline = 0;
let nodes = 0;

function evaluate(game){
  let score = 0;
  for(const row of game.board()){
    for(const piece of row){
      if(!piece) continue;
      const file = piece.square.charCodeAt(0)-97;
      const rank = Number(piece.square[1])-1;
      const center = 7-Math.abs(file-3.5)-Math.abs(rank-3.5);
      let bonus = 0;
      if(piece.type==='n' || piece.type==='b') bonus = center*5;
      if(piece.type==='p'){
        const advance = piece.color==='w' ? rank : 7-rank;
        bonus = advance*7 + center*2;
      }
      const amount = values[piece.type]+bonus;
      score += piece.color==='w' ? amount : -amount;
    }
  }
  return game.turn()==='w' ? score : -score;
}

function order(moves){
  return moves.sort((a,b)=>{
    const value = move =>
      (move.captured ? 10*values[move.captured]-values[move.piece] : 0) +
      (move.promotion ? values[move.promotion] : 0);
    return value(b)-value(a);
  });
}

function search(game,depth,alpha,beta,ply){
  if((++nodes & 127)===0 && Date.now()>deadline) throw new Error('time');
  if(game.isCheckmate()) return -100000+ply;
  if(game.isDraw()) return 0;
  if(depth===0) return evaluate(game);
  let best = -Infinity;
  for(const move of order(game.moves({verbose:true}))){
    game.move(move);
    let score;
    try{score = -search(game,depth-1,-beta,-alpha,ply+1)}
    finally{game.undo()}
    best = Math.max(best,score);
    alpha = Math.max(alpha,score);
    if(alpha>=beta) break;
  }
  return best;
}

self.onmessage = event => {
  const {id,fen,level} = event.data;
  try{
    const game = new Chess(fen);
    const moves = order(game.moves({verbose:true}));
    if(!moves.length){
      self.postMessage({id,fen,move:null});
      return;
    }
    deadline = Date.now()+1800;
    nodes = 0;
    let chosen = moves[0];
    const maxDepth = Math.max(1,Math.min(3,Number(level)||1));
    for(let depth=1;depth<=maxDepth;depth++){
      let candidate = chosen;
      let best = -Infinity;
      let alpha = -Infinity;
      let completed = true;
      const scores = [];
      try{
        for(const move of moves){
          if(Date.now()>deadline) throw new Error('time');
          game.move(move);
          let score;
          try{score = -search(game,depth-1,-Infinity,-alpha,1)}
          finally{game.undo()}
          scores.push({move,score});
          if(score>best){
            best = score;
            candidate = move;
          }
          alpha = Math.max(alpha,score);
        }
      }catch(error){
        if(error.message!=='time') throw error;
        completed = false;
      }
      if(!completed) break;
      chosen = candidate;
      // Easy varies among moves with similar immediate scores.
      if(maxDepth===1){
        const options = scores.filter(item=>item.score>=best-40);
        chosen = options[Math.floor(Math.random()*options.length)].move;
      }
    }
    self.postMessage({
      id,fen,
      move:{from:chosen.from,to:chosen.to,promotion:chosen.promotion || 'q'}
    });
  }catch{
    self.postMessage({id,fen,error:'The computer could not choose a move.'});
  }
};
