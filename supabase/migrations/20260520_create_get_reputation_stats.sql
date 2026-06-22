-- Create get_reputation_stats RPC function
-- This function calculates reputation metrics for a freelancer by aggregating
-- from reviews, contracts, and transactions tables.
-- Returns: average_rating, total_reviews, completion_rate, total_earnings
--
-- Note: Parameter uses p_freelancer_id prefix to avoid ambiguity with column names

CREATE OR REPLACE FUNCTION public.get_reputation_stats(p_freelancer_id UUID)
RETURNS TABLE(
  average_rating NUMERIC,
  total_reviews BIGINT,
  completion_rate NUMERIC,
  total_earnings NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_total_contracts BIGINT;
  v_completed_contracts BIGINT;
BEGIN
  -- Average rating and total reviews from reviews table
  SELECT 
    COALESCE(AVG(r.rating)::NUMERIC, 0),
    COUNT(*)::BIGINT
  INTO average_rating, total_reviews
  FROM public.reviews r
  WHERE r.reviewee_id = p_freelancer_id;

  -- Completion rate from contracts
  SELECT 
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE c.status = 'completed')::BIGINT
  INTO v_total_contracts, v_completed_contracts
  FROM public.contracts c
  WHERE c.freelancer_id = p_freelancer_id;

  IF v_total_contracts > 0 THEN
    completion_rate := ROUND((v_completed_contracts::NUMERIC / v_total_contracts::NUMERIC * 100), 2);
  ELSE
    completion_rate := 0;
  END IF;

  -- Total earnings from completed escrow credit transactions
  SELECT COALESCE(SUM(t.amount)::NUMERIC, 0)
  INTO total_earnings
  FROM public.transactions t
  WHERE t.user_id = p_freelancer_id
    AND t.type = 'credit'
    AND t.source = 'escrow'
    AND t.status = 'completed';

  RETURN NEXT;
END;
$function$;

-- Grant execute to authenticated users (required for RPC calls from client)
GRANT EXECUTE ON FUNCTION public.get_reputation_stats(UUID) TO authenticated;