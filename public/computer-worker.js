import {Chess} from './vendor/chess-rules/chess.js';

const values = {p:100,n:320,b:335,r:510,q:900,k:0};
const MATE = 100000;
const TIMEOUT = Symbol('search timeout');

const settings = {
  1:{depth:1,ms:180,variation:160},
  2:{depth:2,ms:350,variation:55},
  3:{depth:3,ms:900,variation:0},
  4:{depth:4,ms:1800,variation:0},
  5:{depth:5,ms:3200,variation:0}
};

let deadline = 0;
let nodes = 0;

function timeCheck(){
  if((++nodes & 63)===0 && Date.now()>=deadline)
    throw TIMEOUT;
}

function evaluate(game){
  const board = game.board();
  const pawns = {
    w:Array(8).fill(0),
    b:Array(8).fill(0)
  };
  let nonPawn = 0;

  for(const row of board) for(const p of row){
    if(!p) continue;
    if(p.type==='p')
      pawns[p.color][p.square.charCodeAt(0)-97]++;
    else if(p.type!=='k')
      nonPawn += values[p.type];
  }

  const endgame = nonPawn < 2300;
  let score = 0;

  for(const row of board) for(const p of row){
    if(!p) continue;

    const file = p.square.charCodeAt(0)-97;
    const rank = Number(p.square[1])-1;
    const advance = p.color==='w' ? rank : 7-rank;
    const center = 7-Math.abs(file-3.5)-Math.abs(rank-3.5);
    let bonus = 0;

    switch(p.type){
      case 'p': {
        bonus = advance*7+center*2;

        if(pawns[p.color][file]>1) bonus-=18;

        if(!pawns[p.color][file-1] &&
           !pawns[p.color][file+1]) bonus-=14;

        const opponent = p.color==='w'?'b':'w';
        let passed = true;

        for(let f=Math.max(0,file-1);
            f<=Math.min(7,file+1);f++){
          for(let r=0;r<8;r++){
            const target = board[7-r][f];
            if(target?.type==='p' &&
               target.color===opponent &&
               (p.color==='w'?r>rank:r<rank))
              passed = false;
          }
        }

        if(passed) bonus+=12+advance*advance*3;
        break;
      }

      case 'n': bonus=center*10;break;
      case 'b': bonus=center*6;break;

      case 'r':
        bonus=(!pawns[p.color][file]?12:0)+
          (!pawns.w[file]&&!pawns.b[file]?15:0);
        break;

      case 'q': bonus=center*2;break;

      case 'k': {
        if(endgame) bonus=center*10;
        else {
          bonus=-center*8;
          if(file===6||file===2) bonus+=28;

          const front=p.color==='w'?rank+1:rank-1;
          if(front>=0&&front<8){
            for(let f=Math.max(0,file-1);
                f<=Math.min(7,file+1);f++){
              const shield=board[7-front][f];
              if(shield?.type==='p' &&
                 shield.color===p.color)
                bonus+=9;
            }
          }
        }
        break;
      }
    }

    score+=(p.color==='w'?1:-1)*
      (values[p.type]+bonus);
  }

  return game.turn()==='w'?score:-score;
}

function priority(move,preferred){
  let score=0;

  if(preferred &&
     move.from===preferred.from &&
     move.to===preferred.to &&
     move.promotion===preferred.promotion)
    score+=100000;

  if(move.captured)
    score+=10000+10*values[move.captured]-
      values[move.piece];

  if(move.promotion)
    score+=8000+values[move.promotion];

  return score;
}

function ordered(moves,preferred){
  return moves.sort((a,b)=>
    priority(b,preferred)-priority(a,preferred));
}

function quiescence(game,alpha,beta,ply,remaining){
  timeCheck();

  if(game.isCheckmate()) return -MATE+ply;
  if(game.isDraw()) return 0;

  const inCheck=game.isCheck();

  if(!inCheck){
    const stand=evaluate(game);
    if(stand>=beta) return stand;
    alpha=Math.max(alpha,stand);
    if(remaining<=0) return alpha;
  }

  if(remaining<=-4) return evaluate(game);

  const moves=ordered(
    game.moves({verbose:true}).filter(m=>
      inCheck||m.captured||m.promotion)
  );

  for(const m of moves){
    game.move(m);
    let score;

    try{
      score=-quiescence(
        game,-beta,-alpha,ply+1,remaining-1);
    }finally{
      game.undo();
    }

    if(score>=beta) return score;
    alpha=Math.max(alpha,score);
  }

  return alpha;
}

function search(game,depth,alpha,beta,ply){
  timeCheck();

  if(game.isCheckmate()) return -MATE+ply;
  if(game.isDraw()) return 0;

  if(depth===0)
    return quiescence(game,alpha,beta,ply,4);

  for(const m of ordered(game.moves({verbose:true}))){
    game.move(m);
    let score;

    try{
      score=-search(
        game,depth-1,-beta,-alpha,ply+1);
    }finally{
      game.undo();
    }

    if(score>=beta) return score;
    alpha=Math.max(alpha,score);
  }

  return alpha;
}

self.onmessage=event=>{
  const {id,fen,level}=event.data;

  try{
    const game=new Chess(fen);
    const moves=ordered(game.moves({verbose:true}));

    if(!moves.length){
      self.postMessage({id,fen,move:null});
      return;
    }

    const config=settings[
      Math.max(1,Math.min(5,Number(level)||2))
    ];

    deadline=Date.now()+config.ms;
    nodes=0;

    let chosen=moves[0];

    for(let depth=1;depth<=config.depth;depth++){
      let best=-Infinity;
      let alpha=-Infinity;
      let candidate=chosen;
      const scored=[];

      try{
        for(const m of ordered(moves,chosen)){
          if(Date.now()>=deadline)
            throw TIMEOUT;

          game.move(m);
          let score;

          try{
            score=-search(
              game,depth-1,-Infinity,-alpha,1);
          }finally{
            game.undo();
          }

          scored.push({move:m,score});

          if(score>best){
            best=score;
            candidate=m;
          }

          alpha=Math.max(alpha,score);
        }
      }catch(error){
        if(error!==TIMEOUT) throw error;
        break;
      }

      chosen=candidate;

      if(config.variation>0){
        const options=scored.filter(x=>
          x.score>=best-config.variation);

        chosen=options[
          Math.floor(Math.random()*options.length)
        ].move;
      }
    }

    self.postMessage({
      id,fen,
      move:{
        from:chosen.from,
        to:chosen.to,
        promotion:chosen.promotion||'q'
      }
    });

  }catch(error){
    self.postMessage({
      id,fen,
      error:'The computer could not choose a move.'
    });
  }
};
