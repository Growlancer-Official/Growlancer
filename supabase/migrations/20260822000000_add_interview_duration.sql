-- Add interview_duration column to internship_applications
-- Stores duration in minutes (15-min increments: 15, 30, 45, 60, 75, 90, 105, 120)
ALTER TABLE public.internship_applications
  ADD COLUMN IF NOT EXISTS interview_duration INTEGER DEFAULT 30;

-- Notify realtime
SELECT pg_notify('pgrst', 'reload schema');
