import {outcome} from './rules.js';

import {createClient} from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY;
const db=url&&key?createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false}
}):null;

export function playerError(r,socket){
  const owner=r.members?.[socket.data.color];
  if(owner && owner.id!==socket.data.clubMember?.id)
    return 'Log in with the account that joined this seat.';
  return null;
}

export function tracked(r){
  return !!(r.members?.w&&r.members?.b&&
    r.members.w.id!==r.members.b.id);
}

export function saveFinishedGame(r,io){
  if(!tracked(r)||r.saved||r.saving)return;
  const end=outcome(r);
  if(!end)return;
  if(Date.now()-(r.lastSaveAttempt||0)<5000)return;
  r.lastSaveAttempt=Date.now();
  const {result,reason}=end;

  r.game.setHeader('White',r.members.w.display_name);
  r.game.setHeader('Black',r.members.b.display_name);
  r.game.setHeader('Result',result);
  r.game.setHeader('TimeControl','900+10');

  const gameId=r.gameId;
  const payload={
    p_game_id:gameId,
    p_white:r.members.w.id,
    p_black:r.members.b.id,
    p_result:result,
    p_reason:reason,
    p_pgn:r.game.pgn()
  };
  r.saving=true;
  r.saveError=null;

  (async()=>{
    try{
      if(!db)throw new Error('Account database is not configured.');
      const {error}=await db.rpc('record_club_game',payload);
      if(error)throw error;
      if(r.gameId!==gameId)return;
      r.saved=true;
      io.to(r.roomCode).emit('gameSaved',{ok:true});
    }catch{
      if(r.gameId!==gameId)return;
      r.saveError=true;
      io.to(r.roomCode).emit('gameSaved',{
        ok:false,
        error:'Result has not saved yet. Keep this room open; the server will retry.'
      });
      console.error('Could not save completed chess game',gameId);
    }finally{
      if(r.gameId===gameId)r.saving=false;
    }
  })();
}
