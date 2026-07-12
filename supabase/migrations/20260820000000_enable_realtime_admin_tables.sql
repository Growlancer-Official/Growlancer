-- Enable Realtime for Admin Relationship Tables
-- Ensures admin dashboards see live updates for certificates, internships, contacts, and tickets

alter publication supabase_realtime add table public.skill_certifications;
alter publication supabase_realtime add table public.internship_applications;
alter publication supabase_realtime add table public.contact_inquiries;
alter publication supabase_realtime add table public.support_tickets;
alter publication supabase_realtime add table public.ticket_messages;
