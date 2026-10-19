import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {Chess} from 'chess.js';
import crypto from 'node:crypto';

const app=express();
const http=createServer(app);
const io=new Server(http);
const rooms=new Map();
const GAME_TIME=90*1000;
app.use(express.static('public'));
const safeRoom=s=>typeof s==='string'&&/^[A-Z0-9]{6}$/.test(s);

function settle(r){
  if(r.since===null||r.timeout||r.resigned||r.game.isGameOver())return;
  const now=Date.now(),side=r.game.turn();
  r.remaining[side]=Math.max(0,r.remaining[side]-(now-r.since));
  r.since=now;
  if(r.remaining[side]===0){
    r.timeout=side;
    r.since=null;
  }
}
function recordResult(r){
  r.scores??={w:{wins:0,losses:0,draws:0},b:{wins:0,losses:0,draws:0}};
  if(r.resultRecorded)return;
  const loser=r.timeout||r.resigned||
    (r.game.isCheckmate()?r.game.turn():null);
  if(loser){
    const winner=loser==='w'?'b':'w';
    r.scores[winner].wins++;
    r.scores[loser].losses++;
    r.resultRecorded=true;
  }else if(r.game.isGameOver()){
    r.scores.w.draws++;
    r.scores.b.draws++;
    r.resultRecorded=true;
  }
}
function snapshot(r){
  settle(r);
  const over=!!r.timeout||!!r.resigned||r.game.isGameOver();recordResult(r);
  return {
    fen:r.game.fen(),history:r.game.history({verbose:true}),
    turn:r.game.turn(),over,check:r.game.isCheck(),
    checkmate:r.game.isCheckmate(),draw:r.game.isDraw(),
    timeout:r.timeout,resigned:r.resigned||null,scores:r.scores,
    players:{w:!!r.players.w,b:!!r.players.b},
    clock:{...r.remaining,running:!over&&r.since!==null?r.game.turn():null}
  };
}
function emit(id){const r=rooms.get(id);if(r)io.to(id).emit('state',snapshot(r))}

io.on('connection',socket=>{
  socket.on('create',(_,ack)=>{
    let id;
    do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));
    const token=crypto.randomBytes(24).toString('hex');
    rooms.set(id,{
      game:new Chess(),players:{w:token,b:null},sockets:{},
      created:Date.now(),remaining:{w:GAME_TIME,b:GAME_TIME},
      since:null,timeout:null
    });
    ack({ok:true,id,token,color:'w'});
  });
  socket.on('join',({id,token},ack)=>{
    id=String(id||'').toUpperCase();
    if(!safeRoom(id)||!rooms.has(id))return ack({ok:false,error:'Room not found'});
    const r=rooms.get(id);
    let color=Object.entries(r.players).find(([,t])=>t&&t===token)?.[0];
    if(!color){
      if(r.players.b)return ack({ok:false,error:'Room is full. Use your original browser to rejoin.'});
      color='b';
      token=crypto.randomBytes(24).toString('hex');
      r.players.b=token;
      if(!r.timeout&&!r.game.isGameOver()&&r.since===null)r.since=Date.now();
    }
    if(socket.data.room&&socket.data.room!==id){
      const old=rooms.get(socket.data.room);
      if(old&&old.sockets[socket.data.color]===socket.id)delete old.sockets[socket.data.color];
      socket.leave(socket.data.room);
    }
    socket.join(id);
    socket.data.room=id;
    socket.data.color=color;
    r.sockets[color]=socket.id;
    ack({ok:true,id,token,color});
    emit(id);
  });
  socket.on('move',({from,to,promotion},ack)=>{
    const id=socket.data.room,r=rooms.get(id);
    if(!r||r.sockets[socket.data.color]!==socket.id)return ack({ok:false,error:'Not seated'});
    if(!r.players.b)return ack({ok:false,error:'Waiting for second player'});
    settle(r);
    if(r.timeout||r.resigned||r.game.isGameOver()){
      emit(id);
      return ack({ok:false,error:'Game has ended'});
    }
    if(r.game.turn()!==socket.data.color)return ack({ok:false,error:'Not your turn'});
    try{
      const move=r.game.move({from,to,promotion:promotion||'q'});
      if(!move)return ack({ok:false,error:'Illegal move'});
      r.remaining={w:GAME_TIME,b:GAME_TIME};r.since=r.game.isGameOver()?null:Date.now();
      ack({ok:true});
      emit(id);
    }catch{
      ack({ok:false,error:'Illegal move'});
      emit(id);
    }
  });
  
  socket.on('resign',(_,ack)=>{
    const id=socket.data.room,r=rooms.get(id);
    const color=socket.data.color;
    if(!r||r.sockets[color]!==socket.id)
      return ack({ok:false,error:'Not seated'});
    settle(r);
    if(!r.players.b||r.timeout||r.resigned||r.game.isGameOver()){
      emit(id);
      return ack({ok:false,error:'No active game to resign'});
    }
    r.resigned=color;
    r.since=null;
    emit(id);
    ack({ok:true});
  });

  socket.on('restart',(_,ack)=>{
    const id=socket.data.room,r=rooms.get(id);
    if(!r||r.sockets[socket.data.color]!==socket.id)return ack({ok:false});
    settle(r);recordResult(r);r.game.reset();r.resultRecorded=false;
    r.remaining={w:GAME_TIME,b:GAME_TIME};
    r.timeout=null;r.resigned=null;
    r.since=r.players.b?Date.now():null;
    emit(id);
    ack({ok:true});
  });
  socket.on('disconnect',()=>{
    const id=socket.data.room,r=rooms.get(id);
    if(r&&r.sockets[socket.data.color]===socket.id){
      delete r.sockets[socket.data.color];
      io.to(id).emit('presence',{color:socket.data.color,online:false});
    }
  });
});
setInterval(()=>{
  for(const [id,r] of rooms){
    if(r.since!==null){
      const previous=r.timeout;
      settle(r);
      if(!previous&&r.timeout)emit(id);
    }
  }
},250).unref();
setInterval(()=>{
  for(const [id,r] of rooms){
    if(Date.now()-r.created>14*24*60*60*1000&&!Object.keys(r.sockets).length)rooms.delete(id);
  }
},3600000).unref();
http.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log("Rose's Chess Club ready"));
