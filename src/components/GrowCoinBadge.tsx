import { Link } from 'react-router-dom';
import { GrowCoinIcon } from './GrowCoinIcon';
import { useGrowCoinBalance } from '../hooks/useGrowCoinBalance';
import { formatCoinAmount, GROW_COIN } from '../lib/growCoins';

/**
 * Header/dashboard coin pill. Shows only the signed-in user's own balance and
 * links to the referral page where the rules and (for freelancers) redemption
 * live. Hidden from the admin console — coins are not an admin concept.
 */
export function GrowCoinBadge({ userId, role }: { userId?: string; role?: string }) {
  const { state, loading, error } = useGrowCoinBalance(userId);

  if (!userId || role === 'admin') return null;

  const href = role === 'client' ? '/client/referrals' : '/dashboard/referrals';

  return (
    <Link
      to={href}
      aria-label={
        error
          ? 'Grow Coins — balance could not be loaded'
          : `You have ${formatCoinAmount(state.balance)} Grow Coins. Open referral rewards.`
      }
      title={error ? error : `${formatCoinAmount(state.balance)} Grow Coins — 1 coin = ₹1`}
      className="hidden lg:inline-flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-full border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors shrink-0"
    >
      <GrowCoinIcon size={22} />
      <span className="text-xs font-bold tabular-nums">
        {loading ? '—' : error ? '!' : formatCoinAmount(state.balance)}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700/80">coins</span>
      {state.balance >= GROW_COIN.minRedemption && (
        <span className="sr-only"> — redemption available</span>
      )}
    </Link>
  );
}

export default GrowCoinBadge;
