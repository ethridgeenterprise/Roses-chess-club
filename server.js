import {installRated} from './rated.js';
import {outcome,gameOver,installDraws} from './rules.js';
import {saveFinishedGame,tracked,playerError} from './results.js';
import {installPresence} from './presence.js';
import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {Chess} from 'chess.js';
import crypto from 'node:crypto';

const app=express();
const http=createServer(app);
const io=new Server(http);
const rooms=new Map();
installPresence(io, rooms);
const GAME_TIME=15*60*1000;
const INCREMENT=10*1000;
app.use(express.static('public'));
const safeRoom=s=>typeof s==='string'&&/^[A-Z0-9]{6}$/.test(s);

function settle(r){
  if(r.since===null||r.timeout||r.resigned||gameOver(r))return;
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
  const end=outcome(r);
  if(!end)return;
  if(end.result==='1/2-1/2'){
    r.scores.w.draws++;r.scores.b.draws++;
  }else{
    const winner=end.result==='1-0'?'w':'b';
    const loser=winner==='w'?'b':'w';
    r.scores[winner].wins++;r.scores[loser].losses++;
  }
  r.resultRecorded=true;
}
function snapshot(r){
  settle(r);
  const over=!!r.timeout||!!r.resigned||gameOver(r);recordResult(r);saveFinishedGame(r,io);
  return {
    fen:r.game.fen(),history:r.game.history({verbose:true}),
    turn:r.game.turn(),over,check:r.game.isCheck(),
    checkmate:r.game.isCheckmate(),draw:outcome(r)?.result==='1/2-1/2',outcome:outcome(r),drawOffer:r.drawOffer||null,
    timeout:r.timeout,resigned:r.resigned||null,scores:r.scores,tracked:tracked(r),saved:!!r.saved,rated:!!r.rated,started:!!r.started,ready:r.ready||{},
    players:{w:!!r.players.w,b:!!r.players.b},
    clock:{...r.remaining,running:!over&&r.since!==null?r.game.turn():null}
  };
}
function emit(id){const r=rooms.get(id);if(r)io.to(id).emit('state',snapshot(r))}

installDraws(io,rooms,{settle,emit,playerError});
installRated(io,rooms,{settle,emit,playerError,gameOver});
io.on('connection',socket=>{
  socket.on('create',(options,ack)=>{
    if(options?.rated===true&&
      (!socket.data.clubMember||!(socket.data.clubMemberExpires>Date.now())))
      return ack({ok:false,error:'Log in and wait for your name under Players online first.'});
    let id;
    do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));
    const token=crypto.randomBytes(24).toString('hex');
    rooms.set(id,{
      game:new Chess(),players:{w:token,b:null},sockets:{},
      gameId:crypto.randomUUID(),roomCode:id,rated:options?.rated===true,started:options?.rated!==true,ready:{},
      members:{w:socket.data.clubMember?{...socket.data.clubMember}:null,b:null},
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
      if(r.rated&&(!socket.data.clubMember||
        !(socket.data.clubMemberExpires>Date.now())))
        return ack({ok:false,error:'Log in, wait for your online name, then open the invite again.'});
      if(r.players.b)return ack({ok:false,error:'Room is full. Use your original browser to rejoin.'});
      if(r.members?.w&&socket.data.clubMember?.id===r.members.w.id)
        return ack({ok:false,error:'Use a different player account for Black.'});
      color='b';
      token=crypto.randomBytes(24).toString('hex');
      r.players.b=token;r.members.b=socket.data.clubMember?{...socket.data.clubMember}:null;
      if(!r.timeout&&!gameOver(r)&&r.since===null&&(!r.rated||r.started))r.since=Date.now();
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
    const identityError=playerError(r,socket);if(identityError)return ack({ok:false,error:identityError});
    if(r.rated&&!r.started)return ack({ok:false,error:'Both players must confirm the rated game first.'});if(!r.players.b)return ack({ok:false,error:'Waiting for second player'});
    settle(r);
    if(r.timeout||r.resigned||gameOver(r)){
      emit(id);
      return ack({ok:false,error:'Game has ended'});
    }
    if(r.game.turn()!==socket.data.color)return ack({ok:false,error:'Not your turn'});
    try{
      const move=r.game.move({from,to,promotion:promotion||'q'});
      if(!move)return ack({ok:false,error:'Illegal move'});
      if(r.drawOffer&&r.drawOffer!==move.color)r.drawOffer=null;r.remaining[move.color]+=INCREMENT;r.since=gameOver(r)?null:Date.now();
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
    const identityError=playerError(r,socket);if(identityError)return ack({ok:false,error:identityError});
    settle(r);
    if(!r.players.b||(r.rated&&!r.started)||r.timeout||r.resigned||gameOver(r)){
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
    const identityError=playerError(r,socket);
    if(identityError)return ack({ok:false,error:identityError});
    settle(r);
    if(!r.timeout&&!r.resigned&&!gameOver(r))
      return ack({ok:false,error:'Finish or resign the current game first.'});
    recordResult(r);
    saveFinishedGame(r,io);
    if(tracked(r)&&!r.saved)
      return ack({ok:false,error:'Wait for the result to save, then try New game again.'});
    r.game.reset();r.resultRecorded=false;r.drawReason=null;r.drawOffer=null;
    r.gameId=crypto.randomUUID();
    r.saved=false;r.saving=false;r.lastSaveAttempt=0;r.saveError=null;
    r.remaining={w:GAME_TIME,b:GAME_TIME};
    r.timeout=null;r.resigned=null;
    r.started=!r.rated;r.ready={};r.since=r.players.b&&!r.rated?Date.now():null;
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
    saveFinishedGame(r,io);
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
