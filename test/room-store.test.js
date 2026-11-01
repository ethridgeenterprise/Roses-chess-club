import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {RoomStore,encodeRoom,decodeRoom} from '../room-store.js';
import {repetitions,outcome} from '../rules.js';
import {installRated} from '../rated.js';
import crypto from 'node:crypto';

export function fakeDatabase(){
  const rows=new Map();
  const db={fail:false,rows,from(){
    let operation='get',payload,filters=[],start=0,end=999;
    const query={
      select(){return query},eq(k,v){filters.push([k,v]);return query},
      order(){return query},range(a,b){start=a;end=b;return query},
      insert(v){operation='insert';payload=v;return query},
      update(v){operation='update';payload=v;return query},
      delete(){operation='delete';return query},single(){query.one=true;return query},
      abortSignal(){return query},
      then(resolve,reject){return Promise.resolve().then(()=>{
        if(db.fail)return {data:null,error:{code:'unavailable'}};
        const key=v=>v.store_id+':'+v.room_code;
        if(operation==='insert'){
          if(rows.has(key(payload)))return {data:null,error:{code:'23505'}};
          rows.set(key(payload),structuredClone(payload));return {data:[],error:null};
        }
        let data=[...rows.values()].filter(row=>filters.every(([k,v])=>row[k]===v));
        if(operation==='update')data=data.map(row=>{Object.assign(row,structuredClone(payload));return row});
        if(operation==='delete')for(const row of data)rows.delete(key(row));
        data=structuredClone(data.slice(start,end+1));
        return {data:query.one?data[0]:data,error:null};
      }).then(resolve,reject)}
    };return query;
  }};return db;
}
function room(code='ABC123'){
  return {game:new Chess(),gameId:crypto.randomUUID(),roomCode:code,
    players:{w:'a'.repeat(48),b:'b'.repeat(48)},sockets:{w:'old-socket'},
    remaining:{w:900000,b:900000},since:Date.now(),created:Date.now(),
    rated:false,started:true,ready:{},members:{w:null,b:null},timeout:null};
}
test('round-trip preserves repetition history, tokens and clock anchor; drops sockets',()=>{
  const r=room();
  for(const move of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])r.game.move(move);
  r.drawOffer='w';r.scores={w:{wins:1},b:{wins:0}};
  const restored=decodeRoom(encodeRoom(r));
  assert.equal(restored.game.fen(),r.game.fen());
  assert.equal(repetitions(restored.game),3);
  assert.deepEqual(restored.players,r.players);
  assert.deepEqual(restored.sockets,{});
  assert.equal(restored.since,r.since);
  assert.equal(restored.drawOffer,'w');
});
test('database failure leaves position and clock unchanged',async()=>{
  const db=fakeDatabase(),rooms=new Map(),store=new RoomStore(rooms,{db,namespace:'test'});
  const r=room();await store.create(r);const before=encodeRoom(r);
  db.fail=true;
  await assert.rejects(store.change(r.roomCode,draft=>{draft.game.move('e4');draft.remaining.w+=10000}));
  assert.deepEqual(encodeRoom(r),before);
});
test('concurrent updates are serialized and restore into a fresh map',async()=>{
  const db=fakeDatabase(),rooms=new Map(),store=new RoomStore(rooms,{db,namespace:'test'});
  const r=room();await store.create(r);
  await Promise.all([
    store.change(r.roomCode,d=>d.game.move('e4')),
    store.change(r.roomCode,d=>d.game.move('e5'))
  ]);
  const restored=new Map();await new RoomStore(restored,{db,namespace:'test'}).restore();
  assert.deepEqual(restored.get(r.roomCode).game.history(),['e4','e5']);
  assert.equal(restored.get(r.roomCode).revision,2);
});
test('local and live namespaces cannot load or overwrite each other',async()=>{
  const db=fakeDatabase(),a=new Map(),b=new Map();
  const local=new RoomStore(a,{db,namespace:'local'}),live=new RoomStore(b,{db,namespace:'live'});
  await local.create(room());await live.create(room());
  await local.change('ABC123',r=>r.game.move('d4'));
  const recovered=new Map();await new RoomStore(recovered,{db,namespace:'live'}).restore();
  assert.deepEqual(recovered.get('ABC123').game.history(),[]);
});
test('stale process cannot overwrite a newer revision',async()=>{
  const db=fakeDatabase(),a=new Map(),b=new Map();
  const first=new RoomStore(a,{db,namespace:'live'}),second=new RoomStore(b,{db,namespace:'live'});
  await first.create(room());await second.restore();
  await first.change('ABC123',r=>r.game.move('e4'));
  await assert.rejects(second.change('ABC123',r=>r.game.move('d4')),/another connection/);
  assert.deepEqual(b.get('ABC123').game.history(),['e4']);
  await second.change('ABC123',r=>r.game.move('e5'));
});
test('rated confirmations remain stopped until both players agree and survive restart',async()=>{
  const db=fakeDatabase(),rooms=new Map(),store=new RoomStore(rooms,{db,namespace:'rated'});
  const r=room();r.rated=true;r.started=false;r.since=null;
  r.members={w:{id:'white'},b:{id:'black'}};r.sockets={w:'w',b:'b'};
  await store.create(r);
  const sockets=new Map(['w','b'].map(side=>[side,{id:side,data:{color:side,clubMember:{id:side==='w'?'white':'black'},clubMemberExpires:Date.now()+60000}}]));
  const actions={};
  const io={sockets:{sockets},on(event,callback){for(const socket of sockets.values())callback(socket)}};
  installRated(io,rooms,{gameOver:()=>false,bindRoom(socket,event,action){actions[socket.id]=action}});
  await store.change(r.roomCode,draft=>actions.w(draft));
  assert.equal(r.started,false);assert.equal(r.since,null);
  const restored=new Map();await new RoomStore(restored,{db,namespace:'rated'}).restore();
  assert.equal(restored.get(r.roomCode).ready.w,true);
  await store.change(r.roomCode,draft=>actions.b(draft));
  assert.equal(r.started,true);assert.ok(r.since>0);
});
test('completed result marker and game id survive restore',async()=>{
  const db=fakeDatabase(),rooms=new Map(),store=new RoomStore(rooms,{db,namespace:'results'});
  const r=room();r.resigned='b';r.since=null;r.saved=true;r.resultRecorded=true;
  await store.create(r);
  const fresh=new Map();await new RoomStore(fresh,{db,namespace:'results'}).restore();
  assert.equal(fresh.get(r.roomCode).gameId,r.gameId);
  assert.equal(fresh.get(r.roomCode).saved,true);
  assert.equal(outcome(fresh.get(r.roomCode)).result,'1-0');
});

test('room created after startup can be loaded on demand',async()=>{
  const db=fakeDatabase(),a=new RoomStore(new Map(),{db,namespace:'shared'});
  const rooms=new Map(),b=new RoomStore(rooms,{db,namespace:'shared'});
  await b.restore();await a.create(room());
  await b.change('ABC123',r=>r.game.move('c4'));
  assert.deepEqual(rooms.get('ABC123').game.history(),['c4']);
});
