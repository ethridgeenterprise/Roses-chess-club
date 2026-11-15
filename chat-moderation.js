/*
 * GhostLabs Chat Moderation
 * Copyright 2026 Ghost Labs
 */

import {createClient} from '@supabase/supabase-js';

export function createChatModeration() {
  const adminId = process.env.GHOST_CHAT_ADMIN_ID?.trim();

  const namespace =
    process.env.ROOM_STORE_NAMESPACE ||
    process.env.RENDER_SERVICE_ID ||
    'local-development';

  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  function isAdmin(socket) {
    return !!adminId &&
      socket.data.clubMember?.id === adminId &&
      socket.data.clubMemberExpires > Date.now();
  }

  async function isBanned(userId) {
    const {data, error} = await db
      .from('ghost_chat_bans')
      .select('user_id')
      .eq('namespace', namespace)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  }

  async function ban(socket, userId) {
    if (!isAdmin(socket))
      throw new Error('Access denied.');

    if (userId === adminId)
      throw new Error('Cannot ban administrator.');

    const {error} = await db
      .from('ghost_chat_bans')
      .upsert({
        namespace,
        user_id: userId,
        banned_by: adminId,
        banned_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  async function unban(socket, userId) {
    if (!isAdmin(socket))
      throw new Error('Access denied.');

    const {error} = await db
      .from('ghost_chat_bans')
      .delete()
      .eq('namespace', namespace)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async function listBans(socket) {
    if (!isAdmin(socket))
      throw new Error('Access denied.');

    const {data, error} = await db
      .from('ghost_chat_bans')
      .select('user_id, banned_at')
      .eq('namespace', namespace);

    if (error) throw error;
    if (!data.length) return [];

    const {data: profiles, error: profileError} = await db
      .from('profiles')
      .select('id, display_name')
      .in('id', data.map(member => member.user_id));

    if (profileError) throw profileError;

    const names = new Map(
      profiles.map(p => [p.id, p.display_name])
    );

    return data.map(member => ({
      ...member,
      display_name: names.get(member.user_id) ||
        member.user_id
    }));
  }

  return {
    isAdmin,
    isBanned,
    ban,
    unban,
    listBans
  };
}
