
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
export function installDraws(io,rooms,{settle,emit,playerError}){
  io.on('connection',socket=>{
    function active(ack){
      const r=rooms.get(socket.data.room);
      if(!r||r.sockets[socket.data.color]!==socket.id){
        ack({ok:false,error:'Not seated'});return null;
      }
      const error=playerError(r,socket);
      if(error){ack({ok:false,error});return null;}
      settle(r);
      if(!r.players.b||gameOver(r)){
        emit(socket.data.room);
        ack({ok:false,error:'No active game'});return null;
      }
      return r;
    }
    socket.on('drawOffer',(_,ack)=>{
      if(typeof ack!=='function')return;
      const r=active(ack);if(!r)return;
      if(r.game.history().length<2)
        return ack({ok:false,error:'Each player must make a move first.'});
      if(r.drawOffer)
        return ack({ok:false,error:'A draw offer is already pending.'});
      r.drawOffer=socket.data.color;
      emit(socket.data.room);ack({ok:true});
    });
    socket.on('drawReply',(data,ack)=>{
      if(typeof ack!=='function')return;
      const r=active(ack);if(!r)return;
      if(!r.drawOffer||r.drawOffer===socket.data.color)
        return ack({ok:false,error:'No opponent draw offer to answer.'});
      if(data?.accept===true){
        r.drawReason='draw by agreement';r.since=null;
      }
      r.drawOffer=null;
      emit(socket.data.room);ack({ok:true});
    });
    socket.on('drawClaim',(data,ack)=>{
      if(typeof ack!=='function')return;
      const r=active(ack);if(!r)return;
      if(r.game.turn()!==socket.data.color)
        return ack({ok:false,error:'Claim a draw on your own turn.'});
      const intended=String(data?.move||'').trim();
      if(intended.length>20)
        return ack({ok:false,error:'Enter a short move such as Nf3.'});
      try{
        const reason=claimReason(r.game,intended);
        if(!reason)return ack({ok:false,error:'That position does not qualify for a draw claim.'});
        r.drawReason=reason;r.drawOffer=null;r.since=null;
        emit(socket.data.room);ack({ok:true});
      }catch{
        ack({ok:false,error:'That intended move is not legal. Use notation such as Nf3.'});
      }
    });
  });
}
