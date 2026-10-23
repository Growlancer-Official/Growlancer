import re, os, collections

pat = re.compile(r'#([0-9a-fA-F]{6})\b')
DIRS = ['src', 'supabase', 'pages', 'public', 'scripts', 'index.html']
cnt = collections.Counter()

for d in DIRS:
    paths = []
    if os.path.isfile(d):
        paths.append(d)
    else:
        for root, _, files in os.walk(d):
            if 'node_modules' in root:
                continue
            for f in files:
                if f.endswith(('.ts', '.tsx', '.css', '.json', '.html', '.mjs', '.js', '.md')):
                    paths.append(os.path.join(root, f))
    for p in paths:
        try:
            s = open(p, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for m in pat.findall(s):
            r, g, b = int(m[0:2], 16), int(m[2:4], 16), int(m[4:6], 16)
            if g > r + 20 and g > b + 20 and g > 70:
                cnt[m.lower()] += 1

for h, n in cnt.most_common(50):
    print(n, '#' + h)
