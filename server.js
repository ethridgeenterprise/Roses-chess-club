import {installChallenges} from './challenges.js';
import {installLeaderboard} from './leaderboard.js';
import {installRated} from './rated.js';
import {outcome,gameOver,installDraws} from './rules.js';
import {saveFinishedGame,tracked,playerError} from './results.js';
import {installPresence} from './presence.js';
import {RoomStore} from './room-store.js';
import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {Chess} from 'chess.js';
import crypto from 'node:crypto';

const app=express(),http=createServer(app),io=new Server(http);
const rooms=new Map(),store=new RoomStore(rooms);
const GAME_TIME=15*60*1000,INCREMENT=10*1000;
const safeRoom=s=>typeof s==='string'&&/^[A-Z0-9]{6}$/.test(s);
const requireThat=(condition,message)=>{if(!condition)throw new Error(message)};
app.use(express.static('public'));
installLeaderboard(app);
installPresence(io,rooms);

function settle(r){
  if(r.since===null||r.timeout||r.resigned||gameOver(r))return;
  const now=Date.now(),side=r.game.turn();
  r.remaining[side]=Math.max(0,r.remaining[side]-(now-r.since));
  r.since=now;
  if(r.remaining[side]===0){r.timeout=side;r.since=null}
}
function recordResult(r){
  r.scores??={w:{wins:0,losses:0,draws:0},b:{wins:0,losses:0,draws:0}};
  if(r.resultRecorded)return;
  const end=outcome(r);if(!end)return;
  if(end.result==='1/2-1/2'){r.scores.w.draws++;r.scores.b.draws++}
  else{
    const winner=end.result==='1-0'?'w':'b',loser=winner==='w'?'b':'w';
    r.scores[winner].wins++;r.scores[loser].losses++;
  }
  r.resultRecorded=true;
}
function snapshot(r){
  const over=gameOver(r);
  return {
    fen:r.game.fen(),history:r.game.history({verbose:true}),turn:r.game.turn(),
    over,check:r.game.isCheck(),checkmate:r.game.isCheckmate(),
    draw:outcome(r)?.result==='1/2-1/2',outcome:outcome(r),drawOffer:r.drawOffer||null,
    timeout:r.timeout,resigned:r.resigned||null,scores:r.scores,
    tracked:tracked(r),saved:!!r.saved,rated:!!r.rated,started:!!r.started,ready:r.ready||{},
    players:{w:!!r.players.w,b:!!r.players.b},
    clock:{...r.remaining,
      [r.game.turn()]:Math.max(0,r.remaining[r.game.turn()]-(r.since===null?0:Date.now()-r.since)),
      running:!over&&r.since!==null?r.game.turn():null}
  };
}
function emit(id){
  const r=rooms.get(id);if(!r)return;
  io.to(id).emit('state',snapshot(r));
  saveFinishedGame(r,io);
}
function failure(ack,error){
  const known=['Not seated','Log in','Waiting','Both players','Two different',
    'This is','This room','No active','Game has ended','Not your turn','Illegal move',
    'Each player','A draw','No opponent','Enter a short','That position',
    'Finish or resign','Wait for the result','Room not found','Game updated'];
  const message=String(error?.message||'');
  if(!known.some(prefix=>message.startsWith(prefix))){
    console.error('Game storage/action failed:',error?.code||error?.name||'unknown');
    ack({ok:false,error:'Game could not be saved. Your action was not confirmed; refresh before retrying.'});
  }else ack({ok:false,error:message});
}
// Every mutation uses an isolated draft, serialized per room. Only publish and
// acknowledge after the database commit succeeds. Failed saves keep the old state.
function bindRoom(socket,event,action){
  socket.on(event,async(payload,ack)=>{
    if(typeof ack!=='function')return;
    const id=socket.data.room;
    try{
      await store.change(id,r=>{
        requireThat(r.sockets[socket.data.color]===socket.id,'Not seated');
        const error=playerError(r,socket);if(error)throw new Error(error);
        settle(r);
        action(r,payload,socket);
        recordResult(r);
      });
      emit(id);ack({ok:true});
    }catch(error){failure(ack,error);emit(id)}
  });
}
async function createRoom({member=null,to=null,rated=false}={}){
  let id;
  do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));
  const token=crypto.randomBytes(24).toString('hex');
  const room={
    game:new Chess(),players:{w:token,b:null},sockets:{},
    gameId:crypto.randomUUID(),roomCode:id,rated,started:!rated,ready:{},
    members:{w:member?{...member}:null,b:null},created:Date.now(),
    remaining:{w:GAME_TIME,b:GAME_TIME},since:null,timeout:null
  };
  if(to)room.challengeAllowed={w:member.id,b:to.id};
  await store.create(room);
  return {id,token};
}
installChallenges(io,rooms,({from,to,rated})=>createRoom({member:from,to,rated}));
installDraws(io,rooms,{bindRoom,gameOver});
installRated(io,rooms,{bindRoom,gameOver});

io.on('connection',socket=>{
  socket.on('create',async(options,ack)=>{
    if(typeof ack!=='function')return;
    try{
      const rated=options?.rated===true;
      requireThat(!rated||(socket.data.clubMember&&socket.data.clubMemberExpires>Date.now()),
        'Log in and wait for your name under Players online first.');
      const game=await createRoom({member:socket.data.clubMember,rated});
      ack({ok:true,...game,color:'w'});
    }catch(error){failure(ack,error)}
  });
  socket.on('join',async(payload,ack)=>{
    if(typeof ack!=='function')return;
    const id=String(payload?.id||'').toUpperCase();
    if(!safeRoom(id))return ack({ok:false,error:'Room not found'});
    let seat;
    try{
      await store.change(id,r=>{
        let color=Object.entries(r.players).find(([,t])=>t&&t===payload?.token)?.[0];
        let token=payload?.token;
        if(r.challengeAllowed){
          const member=socket.data.clubMember;
          const expected=r.challengeAllowed[color||'b'];
          requireThat(member&&member.id===expected&&socket.data.clubMemberExpires>Date.now(),
            'Log in with the account invited to this challenge, then try resuming again.');
        }
        if(color){
          const owner=r.members?.[color];
          requireThat(!owner||(socket.data.clubMember?.id===owner.id&&
            socket.data.clubMemberExpires>Date.now()),'Log in with the account that joined this seat.');
        }else{
          requireThat(!r.rated||(socket.data.clubMember&&socket.data.clubMemberExpires>Date.now()),
            'Log in, wait for your online name, then open the invite again.');
          requireThat(!r.players.b,'This room is full. Use your original browser to rejoin.');
          requireThat(!r.members?.w||socket.data.clubMember?.id!==r.members.w.id,
            'Two different player accounts are required.');
          color='b';token=crypto.randomBytes(24).toString('hex');
          r.players.b=token;r.members.b=socket.data.clubMember?{...socket.data.clubMember}:null;
          if(!gameOver(r)&&r.since===null&&(!r.rated||r.started))r.since=Date.now();
        }
        settle(r);recordResult(r);
        seat={color,token};
      });
      if(!socket.connected)return;
      if(socket.data.room&&socket.data.room!==id){
        const old=rooms.get(socket.data.room);
        if(old&&old.sockets[socket.data.color]===socket.id)delete old.sockets[socket.data.color];
        socket.leave(socket.data.room);
      }
      await socket.join(id);
      socket.data.room=id;socket.data.color=seat.color;
      rooms.get(id).sockets[seat.color]=socket.id;
      ack({ok:true,id,...seat});emit(id);
    }catch(error){failure(ack,error)}
  });
  bindRoom(socket,'move',(r,{from,to,promotion}={})=>{
    requireThat(!r.rated||r.started,'Both players must confirm the rated game first.');
    requireThat(r.players.b,'Waiting for second player');
    requireThat(!gameOver(r),'Game has ended');
    requireThat(r.game.turn()===socket.data.color,'Not your turn');
    let move;
    try{move=r.game.move({from,to,promotion:promotion||'q'})}catch{throw new Error('Illegal move')}
    requireThat(move,'Illegal move');
    if(r.drawOffer&&r.drawOffer!==move.color)r.drawOffer=null;
    r.remaining[move.color]+=INCREMENT;r.since=gameOver(r)?null:Date.now();
  });
  bindRoom(socket,'resign',r=>{
    requireThat(r.players.b&&(!r.rated||r.started)&&!gameOver(r),'No active game to resign');
    r.resigned=socket.data.color;r.since=null;
  });
  bindRoom(socket,'restart',r=>{
    requireThat(gameOver(r),'Finish or resign the current game first.');
    requireThat(!tracked(r)||r.saved,'Wait for the result to save, then try New game again.');
    r.game.reset();r.resultRecorded=false;r.drawReason=null;r.drawOffer=null;
    r.gameId=crypto.randomUUID();r.saved=false;r.saving=false;r.lastSaveAttempt=0;r.saveError=null;
    r.remaining={w:GAME_TIME,b:GAME_TIME};r.timeout=null;r.resigned=null;
    r.started=!r.rated;r.ready={};r.since=r.players.b&&!r.rated?Date.now():null;
  });
  socket.on('disconnect',()=>{
    const id=socket.data.room,r=rooms.get(id);
    if(r&&r.sockets[socket.data.color]===socket.id){
      delete r.sockets[socket.data.color];
      io.to(id).emit('presence',{color:socket.data.color,online:false});
    }
  });
});

const expiring=new Set();
setInterval(()=>{
  for(const [id,r] of rooms){
    saveFinishedGame(r,io);
    if(r.since===null||expiring.has(id)||Date.now()-r.since<r.remaining[r.game.turn()])continue;
    expiring.add(id);
    store.change(id,draft=>{settle(draft);recordResult(draft)})
      .then(()=>emit(id)).catch(()=>console.error('Clock result save delayed:',id))
      .finally(()=>expiring.delete(id));
  }
},1000).unref();
setInterval(()=>{
  for(const [id,r] of rooms){
    if(Date.now()-r.created>14*24*60*60*1000&&!Object.keys(r.sockets).length&&
      (!tracked(r)||r.saved||!gameOver(r))){
      store.remove(id).catch(()=>console.error('Room cleanup delayed:',id));
    }
  }
},3600000).unref();

// Fail closed if storage cannot load: never start with an empty replacement map.
try{
  const count=await store.restore();
  console.log(`Restored ${count} saved chess rooms (${store.namespace}).`);
  http.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log("Rose's Chess Club ready"));
}catch(error){
  console.error('Saved-game startup failed:',error?.message||'Database unavailable');
  process.exit(1);
}
let shuttingDown=false;
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;
  const timeout=setTimeout(()=>process.exit(1),12000);timeout.unref();
  await store.drain();
  io.close(()=>process.exit(0));
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
