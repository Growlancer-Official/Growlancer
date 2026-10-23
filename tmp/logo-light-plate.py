from PIL import Image

p = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 12.28.00 PM.jpeg'
im = Image.open(p).convert('RGB')
W, H = im.size
px = im.load()
print('size', W, H)

minx, miny, maxx, maxy = W, H, -1, -1
for y in range(H):
    for x in range(W):
        if max(px[x, y]) > 40:
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
print('bbox', (minx, miny, maxx, maxy), 'w', maxx - minx + 1, 'h', maxy - miny + 1)

# row bands
rows = []
for y in range(H):
    n = sum(1 for x in range(minx, maxx + 1) if max(px[x, y]) > 40)
    rows.append(n)
y = 0
while y < H:
    if rows[y] > 0:
        y0 = y
        while y < H and rows[y] > 0:
            y += 1
        print(f'  band y={y0}..{y-1} (h={y-y0})')
    else:
        y += 1

# luminance of the type strokes
from collections import Counter
c = Counter()
for y in range(miny, miny + 120):
    for x in range(minx + 100, maxx - 200):
        r, g, b = px[x, y]
        if max(r, g, b) - min(r, g, b) < 16 and max(r, g, b) > 20:
            c[(r // 6 * 6, g // 6 * 6, b // 6 * 6)] += 1
print('type colours:')
for col, n in c.most_common(6):
    print('  ', col, n)
