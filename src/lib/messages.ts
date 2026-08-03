/**
 * Messages Service — Pure data-access for contract messages.
 *
 * All message DB operations live here. Hooks and components
 * import these functions and manage their own React state.
 */

import { supabase, realtimeChannels } from './supabase';
import type { Database } from '../types/supabase';

type MessageInsert = Database['public']['Tables']['messages']['Insert'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  sender_id: string;
  contract_id: string;
  content: string;
  is_read: boolean | null;
  message_type: string | null;
  created_at: string | null;
}

export interface MessageWithSender extends Message {
  sender?: { name: string; avatar: string } | null;
}

export interface Conversation {
  id: string;
  contract_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const messagesService = {
  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /**
   * Fetch conversations for a user — contracts with their latest message.
   * Supports pagination via page parameter (1-based, 20 per page).
   */
  async getConversations(userId: string, page?: number): Promise<Conversation[]> {
    const pageSize = 20;
    const from = page ? (page - 1) * pageSize : 0;
    const to = from + pageSize - 1;

    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select('id, freelancer_id, client_id')
      .or(`freelancer_id.eq.${userId},client_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (contractsError) throw contractsError;
    if (!contracts || contracts.length === 0) return [];

    const contractIds = contracts.map(c => c.id);

    // ⚡ Perf: fetch at most the latest message per contract (one query per
    // contract is bounded — a single .in() with no limit would pull EVERY
    // message across all contracts on the page, growing unbounded over time).
    const conversationsMap = new Map<string, Conversation>();

    await Promise.all(contractIds.map(async (contractId) => {
      const { data: latest, error } = await supabase
        .from('messages')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return;

      if (!latest) return;

      conversationsMap.set(contractId, {
        id: contractId,
        contract_id: contractId,
        last_message: latest.content,
        last_message_at: latest.created_at,
        unread_count: 0,
      });

      // Unread count comes from a lightweight aggregate below (not the message rows).
    }));

    // Unread counts: count unread messages per contract (bounded, indexed by
    // contract_id + is_read) instead of scanning every message body.
    if (contractIds.length > 0) {
      const { data: unreadRows, error: unreadError } = await supabase
        .from('messages')
        .select('contract_id')
        .in('contract_id', contractIds)
        .eq('is_read', false)
        .neq('sender_id', userId);
      if (!unreadError && unreadRows) {
        (unreadRows as { contract_id: string }[]).forEach(row => {
          const conv = conversationsMap.get(row.contract_id);
          if (conv) conv.unread_count++;
        });
      }
    }

    return Array.from(conversationsMap.values()).sort(
      (a, b) =>
        new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
    );
  },

  /**
   * Fetch messages for a specific contract, including sender profile info.
   */
  async getByContract(contractId: string): Promise<MessageWithSender[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(name, avatar)')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw error;
    return (data || []) as unknown as MessageWithSender[];
  },

  /**
   * Fetch raw messages for a contract (no joins). Used by hooks.
   */
  async getMessages(contractId: string, limit = 50): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (data || []) as Message[];
  },

  /**
   * Get the total number of unread messages for a user across all contracts.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id')
      .or(`freelancer_id.eq.${userId},client_id.eq.${userId}`);

    if (!contracts || contracts.length === 0) return 0;

    const contractIds = contracts.map(c => c.id);
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('contract_id', contractIds)
      .eq('is_read', false)
      .neq('sender_id', userId);

    if (error) throw error;
    return count || 0;
  },

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  /**
   * Send a message on a contract.
   * Returns the created message row, or throws on error.
   */
  async sendMessage(senderId: string, contractId: string, content: string): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: senderId,
        contract_id: contractId,
        content,
        is_read: false,
        message_type: 'contract',
      } as MessageInsert)
      .select()
      .single();

    if (error) throw error;
    return data as Message;
  },

  /**
   * Convenience wrapper around sendMessage that returns a boolean.
   */
  async send(
    contractId: string,
    senderId: string,
    content: string,
    messageType: string = 'contract'
  ): Promise<boolean> {
    try {
      const { error } = await supabase.from('messages').insert({
        contract_id: contractId,
        sender_id: senderId,
        content,
        is_read: false,
        message_type: messageType,
      } as MessageInsert);

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Mark specific message IDs as read.
   */
  async markAsRead(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    const { error } = await supabase
      .from('messages')
      .update({ is_read: true } as Database['public']['Tables']['messages']['Update'])
      .in('id', messageIds);

    if (error) throw error;
  },

  /**
   * Mark all messages in a contract as read (for a given user).
   */
  async markContractAsRead(contractId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('contract_id', contractId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    return !error;
  },

  // -----------------------------------------------------------------------
  // Realtime subscriptions
  // -----------------------------------------------------------------------

  /**
   * Subscribe to all new messages for a user (across all contracts).
   */
  subscribeToMessages(userId: string, callback: (message: Message) => void) {
    const channel = realtimeChannels.messages(`${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        payload => callback(payload.new as Message)
      )
      .subscribe();

    return {
      unsubscribe: () => channel.unsubscribe(),
    };
  },

  /**
   * Subscribe to INSERT/UPDATE on messages for a specific contract.
   * Useful for workspace chat panels.
   */
  subscribeToContractMessages(
    contractId: string,
    onInsert: (message: Message) => void,
    onUpdate?: (message: Message) => void,
  ) {
    const channel = realtimeChannels.messages(`${contractId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `contract_id=eq.${contractId}`,
        },
        payload => onInsert(payload.new as Message)
      );

    if (onUpdate) {
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `contract_id=eq.${contractId}`,
        },
        payload => onUpdate!(payload.new as Message)
      );
    }

    channel.subscribe();

    return {
      unsubscribe: () => channel.unsubscribe(),
    };
  },
};