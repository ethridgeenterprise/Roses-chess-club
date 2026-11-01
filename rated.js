export function installRated(io,rooms,{bindRoom,gameOver}){
  io.on('connection',socket=>{
    bindRoom(socket,'ratedReady',r=>{
      if(!r.rated)throw new Error('This is a casual game.');
      if(r.started)return;
      if(gameOver(r)||!r.players.b)throw new Error('Waiting for an opponent.');
      if(!r.members?.w||!r.members?.b||r.members.w.id===r.members.b.id)
        throw new Error('Two different signed-in players are required.');
      for(const side of ['w','b']){
        const peer=io.sockets.sockets.get(r.sockets[side]);
        if(!peer||peer.data.clubMember?.id!==r.members[side].id||
          !(peer.data.clubMemberExpires>Date.now()))
          throw new Error('Both players must be connected and signed in.');
      }
      r.ready??={};r.ready[socket.data.color]=true;
      if(r.ready.w&&r.ready.b){r.started=true;r.since=Date.now()}
    });
  });
}
