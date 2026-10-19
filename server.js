import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {Chess} from 'chess.js';
import crypto from 'node:crypto';
const app=express();const http=createServer(app);const io=new Server(http);const rooms=new Map();
app.use(express.static('public'));
const safeRoom=s=>typeof s==='string'&&/^[A-Z0-9]{6}$/.test(s);
function snapshot(room){return {fen:room.game.fen(),history:room.game.history({verbose:true}),turn:room.game.turn(),over:room.game.isGameOver(),check:room.game.isCheck(),checkmate:room.game.isCheckmate(),draw:room.game.isDraw(),players:{w:!!room.players.w,b:!!room.players.b}}}
function emit(roomId){io.to(roomId).emit('state',snapshot(rooms.get(roomId)))}
io.on('connection',socket=>{
 socket.on('create',(_,ack)=>{let id;do{id=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(id));const token=crypto.randomBytes(24).toString('hex');rooms.set(id,{game:new Chess(),players:{w:token,b:null},sockets:{},created:Date.now()});ack({ok:true,id,token,color:'w'});});
 socket.on('join',({id,token},ack)=>{id=String(id||'').toUpperCase();if(!safeRoom(id)||!rooms.has(id))return ack({ok:false,error:'Room not found'});const r=rooms.get(id);let color=Object.entries(r.players).find(([,t])=>t&&t===token)?.[0];if(!color){if(r.players.b)return ack({ok:false,error:'Room is full. Ask for a player link.'});color='b';token=crypto.randomBytes(24).toString('hex');r.players.b=token;}socket.join(id);socket.data.room=id;socket.data.color=color;r.sockets[color]=socket.id;ack({ok:true,id,token,color});emit(id);});
 socket.on('move',({from,to,promotion},ack)=>{const id=socket.data.room,r=rooms.get(id);if(!r||r.sockets[socket.data.color]!==socket.id)return ack({ok:false,error:'Not seated'});if(r.game.turn()!==socket.data.color)return ack({ok:false,error:'Not your turn'});try{const move=r.game.move({from,to,promotion:promotion||'q'});if(!move)return ack({ok:false,error:'Illegal move'});ack({ok:true});emit(id)}catch{ack({ok:false,error:'Illegal move'})}});
 socket.on('restart',(_,ack)=>{const id=socket.data.room,r=rooms.get(id);if(!r)return ack({ok:false});r.game.reset();emit(id);ack({ok:true})});
 socket.on('disconnect',()=>{const id=socket.data.room,r=rooms.get(id);if(r&&r.sockets[socket.data.color]===socket.id){delete r.sockets[socket.data.color];io.to(id).emit('presence',{color:socket.data.color,online:false})}});
});
setInterval(()=>{for(const [id,r] of rooms){if(Date.now()-r.created>1000*60*60*24*14&&!Object.keys(r.sockets).length)rooms.delete(id)}},3600000).unref();
http.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Aaron’s Chess Room ready'));
