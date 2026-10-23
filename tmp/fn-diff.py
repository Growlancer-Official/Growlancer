import re
import difflib


def grab(path, name):
    s = open(path, encoding='utf-8').read()
    i = s.find(f'FUNCTION public.{name}(')
    if i < 0:
        return None
    j = s.find('$$;', s.find('AS $$', i))
    return s[i:j].replace('\r\n', '\n')


pairs = [
    (
        'process_referral',
        'supabase/migrations/20270201000000_professional_referral_codes.sql',
    ),
    (
        'award_referral_bonus_if_eligible',
        'supabase/migrations/20270129000000_grow_coin_referral_rewards.sql',
    ),
]

new = 'supabase/migrations/20270204000000_same_role_referrals.sql'

for name, old_path in pairs:
    a = grab(old_path, name)
    b = grab(new, name)
    print('=' * 70)
    print(name, '| old:', old_path.split('/')[-1])
    if a is None or b is None:
        print('  MISSING', a is None, b is None)
        continue
    diff = list(
        difflib.unified_diff(
            a.splitlines(), b.splitlines(), 'old', 'new', lineterm='', n=2
        )
    )
    removed = [l for l in diff if l.startswith('-') and not l.startswith('---')]
    added = [l for l in diff if l.startswith('+') and not l.startswith('+++')]
    print(f'  {len(removed)} lines removed, {len(added)} added')
    for l in diff:
        print('  ' + l)
