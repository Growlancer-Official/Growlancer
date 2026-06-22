import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIAssistantContext {
  skills?: string[];
  hourly_rate?: number;
  recent_projects?: Array<{ id: string; title: string }>;
  recent_proposals?: Array<{ id: string; status: string }>;
  active_contracts?: number;
}

export const aiAssistantService = {
  // Send message to AI assistant
  async sendMessage(
    userId: string,
    userRole: 'freelancer' | 'client',
    messages: ChatMessage[],
    context?: AIAssistantContext
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            user_role: userRole,
            messages,
            context,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to get AI response' };
      }

      return { success: true, message: data.message };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },
};
