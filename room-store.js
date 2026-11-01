import {createClient} from '@supabase/supabase-js';
import {Chess} from 'chess.js';

const fields = ['gameId','roomCode','players','members','challengeAllowed',
  'created','remaining','since','timeout','resigned','drawReason','drawOffer',
  'scores','resultRecorded','rated','started','ready','saved'];

export function encodeRoom(room){
  const value = {version:1,pgn:room.game.pgn(),fen:room.game.fen()};
  for(const field of fields) if(room[field] !== undefined) value[field]=room[field];
  return JSON.parse(JSON.stringify(value));
}

export function decodeRoom(value){
  if(value?.version!==1 || !/^[A-Z0-9]{6}$/.test(value.roomCode || '') ||
      typeof value.pgn!=='string' || !value.players || !value.remaining ||
      !Number.isFinite(value.remaining.w) || !Number.isFinite(value.remaining.b) ||
      !(value.since===null || Number.isFinite(value.since))) {
    throw new Error('Invalid saved room');
  }
  const game = new Chess();
  game.loadPgn(value.pgn);
  if(game.fen()!==value.fen) throw new Error('Saved position and move history differ');
  const room={game,sockets:{},saving:false,lastSaveAttempt:0,saveError:null};
  for(const field of fields) if(value[field]!==undefined) room[field]=structuredClone(value[field]);
  return room;
}

export class RoomStore {
  constructor(rooms, {db,namespace}={}){
    this.rooms=rooms;
    this.namespace=namespace || process.env.ROOM_STORE_NAMESPACE ||
      process.env.RENDER_SERVICE_ID || 'local-development';
    const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
    this.db=db || (url && key ? createClient(url,key,{
      auth:{persistSession:false,autoRefreshToken:false}
    }):null);
    this.locks=new Map();
    this.stopping=false;
  }

  query(){
    if(!this.db) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required for saved games.');
    return this.db.from('club_room_snapshots');
  }

  async restore(){
    let count=0;
    for(let offset=0;;offset+=500){
      const {data,error}=await this.query().select('room_code,game_id,snapshot,revision')
        .eq('store_id',this.namespace).order('room_code').range(offset,offset+499)
        .abortSignal(AbortSignal.timeout(15000));
      if(error) throw error;
      for(const row of data){
        const room=decodeRoom(row.snapshot);
        if(room.roomCode!==row.room_code || room.gameId!==row.game_id)
          throw new Error('Saved room identifiers do not match');
        room.revision=Number(row.revision);
        this.rooms.set(row.room_code,room);
        count++;
      }
      if(data.length<500) break;
    }
    return count;
  }

  serial(id,action){
    const previous=this.locks.get(id) || Promise.resolve();
    const task=previous.catch(()=>{}).then(action);
    this.locks.set(id,task);
    const clear=()=>{if(this.locks.get(id)===task)this.locks.delete(id)};
    task.then(clear,clear);
    return task;
  }

  async create(room){
    if(this.stopping) throw new Error('Server is restarting. Please reconnect.');
    return this.serial(room.roomCode,async()=>{
      if(this.rooms.has(room.roomCode)) throw new Error('Room code already in use');
      const {error}=await this.query().insert({
        store_id:this.namespace,room_code:room.roomCode,game_id:room.gameId,
        snapshot:encodeRoom(room),revision:0,updated_at:new Date().toISOString()
      }).abortSignal(AbortSignal.timeout(10000));
      if(error) throw error;
      room.revision=0;
      this.rooms.set(room.roomCode,room);
      return room;
    });
  }

  async change(id,action){
    if(this.stopping) throw new Error('Server is restarting. Please reconnect.');
    return this.serial(id,async()=>{
      if(!/^[A-Z0-9]{6}$/.test(id || ''))throw new Error('Room not found');
      let current=this.rooms.get(id);
      if(!current){
        // A room may have been created by the previous process during a rolling deploy.
        const fresh=await this.query().select('snapshot,revision')
          .eq('store_id',this.namespace).eq('room_code',id)
          .abortSignal(AbortSignal.timeout(10000));
        if(fresh.error)throw fresh.error;
        if(!fresh.data.length)throw new Error('Room not found');
        current=decodeRoom(fresh.data[0].snapshot);
        current.revision=Number(fresh.data[0].revision);
        this.rooms.set(id,current);
      }
      const draft=decodeRoom(encodeRoom(current));
      draft.sockets={...current.sockets};
      draft.saving=current.saving;
      draft.lastSaveAttempt=current.lastSaveAttempt;
      draft.revision=current.revision;
      const result=action(draft);
      if(result && typeof result.then==='function') throw new Error('Room changes must be synchronous');
      const revision=current.revision+1;
      const {data,error}=await this.query().update({
        game_id:draft.gameId,snapshot:encodeRoom(draft),revision,
        updated_at:new Date().toISOString()
      }).eq('store_id',this.namespace).eq('room_code',id)
        .eq('revision',current.revision).select('revision')
        .abortSignal(AbortSignal.timeout(10000));
      if(error) throw error;
      if(data.length!==1){
        // Another process (for example a rolling deploy) owns a newer state.
        const fresh=await this.query().select('snapshot,revision')
          .eq('store_id',this.namespace).eq('room_code',id).single()
          .abortSignal(AbortSignal.timeout(10000));
        if(!fresh.error){
          const restored=decodeRoom(fresh.data.snapshot);
          restored.revision=Number(fresh.data.revision);
          restored.sockets={...current.sockets};
          Object.assign(current,restored);
        }
        throw new Error('Game updated on another connection. Refresh and try again.');
      }
      if(draft.gameId===current.gameId){
        draft.saved=!!draft.saved || !!current.saved;
        draft.saving=current.saving;
      }
      // Keep object identity: an in-flight result save may still reference it.
      draft.sockets={...current.sockets};
      Object.assign(current,draft,{revision});
      return result;
    });
  }

  async remove(id){
    return this.serial(id,async()=>{
      const room=this.rooms.get(id);
      if(!room || Object.keys(room.sockets).length) return;
      const {data,error}=await this.query().delete().eq('store_id',this.namespace)
        .eq('room_code',id).eq('revision',room.revision).select('room_code')
        .abortSignal(AbortSignal.timeout(10000));
      if(error) throw error;
      if(data.length===1)this.rooms.delete(id);
    });
  }

  async drain(){
    this.stopping=true;
    await Promise.allSettled([...this.locks.values()]);
  }
}
