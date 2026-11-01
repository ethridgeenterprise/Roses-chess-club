
export function repetitions(g){
  const key=fen=>fen.split(' ').slice(0,4).join(' ');
  const history=g.history({verbose:true}),current=key(g.fen());
  if(!history.length)return 1;
  let count=key(history[0].before)===current?1:0;
  for(const move of history)if(key(move.after)===current)count++;
  return count;
}
export function cannotMate(g,color){
  const pieces=g.board().flat().filter(Boolean);
  const mine=pieces.filter(p=>p.color===color&&p.type!=='k');
  const theirs=pieces.filter(p=>p.color!==color&&p.type!=='k');
  if(!mine.length||g.isInsufficientMaterial())return true;
  return mine.length===1&&['b','n'].includes(mine[0].type)&&!theirs.length;
}
export function outcome(r){
  const g=r.game;
  const win=(loser,reason)=>({result:loser==='w'?'0-1':'1-0',reason});
  if(g.isCheckmate())return win(g.turn(),'checkmate');
  if(g.isStalemate())return {result:'1/2-1/2',reason:'stalemate'};
  if(g.isInsufficientMaterial())
    return {result:'1/2-1/2',reason:'insufficient material'};
  if(repetitions(g)>=5)
    return {result:'1/2-1/2',reason:'fivefold repetition'};
  if(Number(g.fen().split(' ')[4])>=150)
    return {result:'1/2-1/2',reason:'75-move rule'};
  if(r.drawReason)return {result:'1/2-1/2',reason:r.drawReason};
  const loser=r.timeout||r.resigned;
  if(loser){
    const winner=loser==='w'?'b':'w';
    if(cannotMate(g,winner))
      return {result:'1/2-1/2',reason:'opponent cannot checkmate'};
    return win(loser,r.timeout?'timeout':'resignation');
  }
  return null;
}
export const gameOver=r=>!!outcome(r);
export function claimReason(g,intended){
  let moved=false;
  try{
    if(intended){g.move(intended);moved=true;}
    if(repetitions(g)>=3)return 'threefold repetition claimed';
    if(Number(g.fen().split(' ')[4])>=100)return '50-move rule claimed';
    return null;
  }finally{if(moved)g.undo();}
}
export function installDraws(io,rooms,{bindRoom,gameOver}){
  io.on('connection',socket=>{
    function active(r){
      if(!r.players.b||(r.rated&&!r.started)||gameOver(r))throw new Error('No active game');
    }
    bindRoom(socket,'drawOffer',r=>{
      active(r);
      if(r.game.history().length<2)throw new Error('Each player must make a move first.');
      if(r.drawOffer)throw new Error('A draw offer is already pending.');
      r.drawOffer=socket.data.color;
    });
    bindRoom(socket,'drawReply',(r,data)=>{
      active(r);
      if(!r.drawOffer||r.drawOffer===socket.data.color)throw new Error('No opponent draw offer to answer.');
      if(data?.accept===true){r.drawReason='draw by agreement';r.since=null}
      r.drawOffer=null;
    });
    bindRoom(socket,'drawClaim',(r,data)=>{
      active(r);
      if(r.game.turn()!==socket.data.color)throw new Error('Waiting for your turn to claim a draw.');
      const intended=String(data?.move||'').trim();
      if(intended.length>20)throw new Error('Enter a short move such as Nf3.');
      let reason;
      try{reason=claimReason(r.game,intended)}catch{throw new Error('Illegal move: use notation such as Nf3.')}
      if(!reason)throw new Error('That position does not qualify for a draw claim.');
      r.drawReason=reason;r.drawOffer=null;r.since=null;
    });
  });
}
