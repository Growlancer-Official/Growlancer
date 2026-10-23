"""One pass: every hard-coded emerald/lime literal -> the Growlanzo green scale.

Scale anchored on the wordmark's own 'zo' pixels (median #24ba35, deep #008623,
highlight #c2e30c), so the UI, the emails and the logo are one colour family.
600/700 are deliberately darker than the logo mid-tone: they carry white text
and body copy, so they keep >=4.5:1 on white.
"""

import os
import re

HEX = {
    # emerald that shipped before the rebrand
    '#059669': '#14861f',  # 600 - buttons, links (4.6:1 on white)
    '#047857': '#0f6f1a',  # 700
    '#065f46': '#10591a',  # 800
    '#064e3b': '#104a1a',  # 900
    '#022c22': '#04270c',  # 950
    '#10b981': '#24ba35',  # 500 - the logo's own green
    '#34d399': '#4fcb45',  # 400 - dark-mode text lift
    '#6ee7b7': '#89e07f',  # 300
    '#a7f3d0': '#bbefb4',  # 200
    '#d1fae5': '#ddf7d9',  # 100
    '#ecfdf5': '#f1fcef',  # 50
    # the interim lime pass this replaces
    '#6fc222': '#24ba35',
    '#43990e': '#14861f',
    '#92d94d': '#4fcb45',
    '#b3e57b': '#89e07f',
    '#e8f8d3': '#ddf7d9',
    '#f4fce9': '#f1fcef',
    '#d2f0ab': '#bbefb4',
    '#37800d': '#0f6f1a',
    '#2e6611': '#10591a',
    '#275212': '#104a1a',
    '#122e07': '#04270c',
    # tailwind `green-*` tints used by the email templates and a few states
    '#f0fdf4': '#f1fcef',
    '#dcfce7': '#ddf7d9',
    '#bbf7d0': '#bbefb4',
    '#86efac': '#89e07f',
    '#4ade80': '#4fcb45',
    '#166534': '#10591a',
    '#14532d': '#104a1a',
    # dark-surface tints keyed to the old hue
    '#0c2a24': '#0d2a18',
    '#123b31': '#123b20',
    '#2c7f63': '#1f6b33',
}

RGBA = [
    ('16, 185, 129', '36, 186, 53'),
    ('16,185,129', '36,186,53'),
    ('52, 211, 153', '79, 203, 69'),
    ('52,211,153', '79,203,69'),
    ('12, 42, 36', '13, 42, 24'),
    ('12,42,36', '13,42,24'),
    ('6, 95, 70', '16, 89, 26'),
    ('6,95,70', '16,89,26'),
    ('18, 59, 49', '18, 59, 32'),
    ('4, 120, 87', '15, 111, 26'),
]

ROOTS = ['src', 'supabase', 'pages', 'public', 'scripts', 'index.html']
EXTS = ('.ts', '.tsx', '.css', '.html', '.json', '.mjs', '.js')

changed = []

for root in ROOTS:
    files = [root] if os.path.isfile(root) else [
        os.path.join(d, f)
        for d, _, fs in os.walk(root)
        if 'node_modules' not in d
        for f in fs
        if f.endswith(EXTS)
    ]
    for p in files:
        if not p.endswith(EXTS):
            continue
        try:
            s = open(p, encoding='utf-8').read()
        except Exception:
            continue
        orig = s
        for old, new in HEX.items():
            s = re.sub(re.escape(old), new, s, flags=re.IGNORECASE)
        for old, new in RGBA:
            s = s.replace(old, new)
        if s != orig:
            open(p, 'w', encoding='utf-8', newline='').write(s)
            changed.append(p)

print(f'{len(changed)} files updated')
for c in changed:
    print('  ', c)
