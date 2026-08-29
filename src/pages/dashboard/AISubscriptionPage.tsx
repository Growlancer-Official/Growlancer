// ═══════════════════════════════════════════════════════════════════════════
// AI SUBSCRIPTION — MERGED INTO THE SINGLE PREMIUM PAGE
//
// FINAL MODEL: there is exactly ONE paid plan — Freelancer Premium
// (₹299/month, flat, optional, AI + productivity tools only). The old
// separate AI-only subscription flow (₹399/₹499 tiers, yearly options) was
// removed. This route now just forwards to the single Premium page.
// ═══════════════════════════════════════════════════════════════════════════
import { PageSkeleton } from '../../components/PageSkeleton';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function AISubscriptionPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/dashboard/pro', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <PageSkeleton showStats={false} cards={false} />
    </div>
  );
}
