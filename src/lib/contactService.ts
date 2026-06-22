import { supabase } from './supabase';

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
  return { success: true };
}
