import { supabase } from './supabase';
import { sendAdminNotification } from './emailNotificationService';

export type TicketCategory = 'general' | 'billing' | 'account' | 'technical' | 'dispute' | 'feature_request' | 'other';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  user_id: string;
  user_role: 'freelancer' | 'client';
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  related_contract_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
}

export interface TicketWithMessages extends SupportTicket {
  messages: TicketMessage[];
  message_count?: number;
}

const ticketService = {
  /**
   * Create a new support ticket
   */
  async create(params: {
    userId: string;
    userRole: 'freelancer' | 'client';
    subject: string;
    description: string;
    category?: TicketCategory;
    priority?: TicketPriority;
    relatedContractId?: string;
  }): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
    const { data, error } = await supabase
      .from('support_tickets' as any)
      .insert({
        user_id: params.userId,
        user_role: params.userRole,
        subject: params.subject.trim(),
        description: params.description.trim(),
        category: params.category || 'general',
        priority: params.priority || 'normal',
        related_contract_id: params.relatedContractId || null,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Look up user name/email for admin notification
    let requesterName = params.userId;
    let requesterEmail = '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) requesterEmail = user.email;
      if (user?.user_metadata?.name) requesterName = user.user_metadata.name as string;
      else if (user?.email) requesterName = user.email;
    } catch { /* ignore */ }

    // Fire-and-forget admin notification on ticket creation
    sendAdminNotification({
      subject: `New Support Ticket: ${params.subject.substring(0, 80)}`,
      message: `A new support ticket has been created by ${params.userRole}: ${params.description.substring(0, 200)}`,
      requester_name: requesterName,
      requester_email: requesterEmail,
      details: {
        category: params.category || 'general',
        priority: params.priority || 'normal',
        created_at: new Date().toISOString(),
        user_role: params.userRole,
      },
    });

    return { success: true, ticket: data as unknown as SupportTicket };
  },

  /**
   * Get all tickets for the current user
   */
  async getUserTickets(userId: string): Promise<{ success: boolean; tickets: (SupportTicket & { message_count: number })[]; error?: string }> {
    const { data, error } = await supabase
      .from('support_tickets' as any)
      .select('*, message_count:ticket_messages(count)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) return { success: false, tickets: [], error: error.message };

    const tickets = data.map((t: any) => ({
      ...t,
      message_count: t.message_count?.[0]?.count || 0,
    }));

    return { success: true, tickets };
  },

  /**
   * Get a single ticket with its messages
   */
  async getTicket(ticketId: string): Promise<{ success: boolean; ticket?: SupportTicket; messages?: TicketMessage[]; error?: string }> {
    const [ticketResult, messagesResult] = await Promise.all([
      supabase.from('support_tickets' as any).select('*').eq('id', ticketId).single(),
      supabase
        .from('ticket_messages' as any)
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
    ]);

    if (ticketResult.error) return { success: false, error: ticketResult.error.message };    return { success: true, ticket: ticketResult.data as unknown as SupportTicket, messages: (messagesResult.data || []) as unknown as TicketMessage[], };
  },

  /**
   * Add a message to a ticket
   */
  async addMessage(params: {
    ticketId: string;
    userId: string;
    message: string;
  }): Promise<{ success: boolean; message?: TicketMessage; error?: string }> {
    const { data, error } = await supabase
      .from('ticket_messages' as any)
      .insert({
        ticket_id: params.ticketId,
        user_id: params.userId,
        message: params.message.trim(),
        is_internal: false,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    // Update the ticket's updated_at timestamp
    await supabase
      .from('support_tickets' as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.ticketId);

    // Fire-and-forget: notify admin of new ticket message
    sendAdminNotification({
      subject: `New Reply on Support Ticket #${params.ticketId.substring(0, 8)}`,
      message: `A new message was added to a support ticket.\n\n${params.message.substring(0, 300)}`,
      requester_name: params.userId,
      requester_email: '',
      details: {
        ticket_id: params.ticketId,
        message_length: params.message.length,
        replied_at: new Date().toISOString(),
      },
    });

    return { success: true, message: data as unknown as TicketMessage };
  },

  /**
   * Close a ticket
   */
  async closeTicket(ticketId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('support_tickets' as any)
      .update({
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  /**
   * Reopen a closed ticket
   */
  async reopenTicket(ticketId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('support_tickets' as any)
      .update({
        status: 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('user_id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  /**
   * Subscribe to real-time ticket updates
   */
  subscribeToTickets(userId: string, callback: () => void) {
    const channel = supabase
      .channel(`support-tickets-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          callback();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=in.(select id from support_tickets where user_id=eq.${userId})`,
        },
        () => {
          callback();
        }
      )
      .subscribe();

    return channel;
  },
};

export { ticketService };
