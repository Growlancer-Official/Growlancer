-- Add interview_time column to internship_applications
-- Admin sets this when scheduling an interview with Google Meet link

ALTER TABLE public.internship_applications
  ADD COLUMN IF NOT EXISTS interview_time timestamptz;
