-- ============================================================
-- SECURITY HARDENING v6c — contract-files bucket private
--
-- contract-files holds work deliverables (source code, documents,
-- designs) exchanged between client & freelancer. The bucket was
-- public: anyone with the URL could fetch deliverables even though
-- RLS policies only permit contract participants (public bucket
-- URLs bypass RLS entirely).
--
-- Fix: bucket becomes private; file-upload edge function now returns
-- short-lived signed URLs (participant-authorized) instead of
-- permanent public URLs. RLS already restricts signed-URL
-- generation to contract participants.
-- ============================================================

UPDATE storage.buckets SET public = false
WHERE id = 'contract-files';
