import { supabase } from './supabase';
import { sendAdminNotification } from './emailNotificationService';

export async function submitContactInquiry(input: {
  name: string;
  email: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('contact_inquiries').insert({
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Fire-and-forget admin notification email
  sendAdminNotification({
    subject: 'New Contact Inquiry',
    message: input.message,
    requester_name: input.name,
    requester_email: input.email,
    details: {
      name: input.name,
      email: input.email,
      submitted_at: new Date().toISOString(),
    },
  });

  return { success: true };
}
