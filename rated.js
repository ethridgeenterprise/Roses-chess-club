
export function installRated(io,rooms,{settle,emit,playerError,gameOver}){
  io.on('connection',socket=>{
    socket.on('ratedReady',(_,ack)=>{
      if(typeof ack!=='function')return;
      const r=rooms.get(socket.data.room),color=socket.data.color;
      if(!r||r.sockets[color]!==socket.id)
        return ack({ok:false,error:'Not seated'});
      const error=playerError(r,socket);
      if(error)return ack({ok:false,error});
      if(!r.rated)return ack({ok:false,error:'This is a casual game.'});
      if(r.started)return ack({ok:true});
      settle(r);
      if(gameOver(r)||!r.players.b)
        return ack({ok:false,error:'Waiting for an opponent.'});
      if(!r.members?.w||!r.members?.b||r.members.w.id===r.members.b.id)
        return ack({ok:false,error:'Two different signed-in players are required.'});

      for(const side of ['w','b']){
        const peer=io.sockets.sockets.get(r.sockets[side]);
        if(!peer||peer.data.clubMember?.id!==r.members[side].id||
          !(peer.data.clubMemberExpires>Date.now()))
          return ack({ok:false,error:'Both players must be connected and signed in.'});
      }
      r.ready??={};
      r.ready[color]=true;
      if(r.ready.w&&r.ready.b){
        r.started=true;
        r.since=Date.now();
      }
      emit(socket.data.room);
      ack({ok:true});
    });
  });
}
