from PIL import Image

p = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 11.15.45 AM.jpeg'
im = Image.open(p).convert("RGB")
W, H = im.size
px = im.load()

def lum(x, y):
    r, g, b = px[x, y]
    return max(r, g, b)

# row profile (max brightness per row) inside bbox
print("row profile (y: count of bright px) :")
rows = []
for y in range(H):
    n = sum(1 for x in range(140, 950) if lum(x, y) > 60)
    rows.append(n)
# print compact: only rows with content and gaps
y = 0
while y < H:
    if rows[y] > 0:
        y0 = y
        while y < H and rows[y] > 0:
            y += 1
        print(f"  band y={y0}..{y-1} (h={y-y0})")
    else:
        y += 1

# column profile in the wordmark band only
print("column gaps (wordmark band):")
bands = []
y = 0
while y < H:
    if rows[y] > 0:
        y0 = y
        while y < H and rows[y] > 0:
            y += 1
        bands.append((y0, y - 1))
    else:
        y += 1
wy0, wy1 = bands[0]
cols = []
for x in range(W):
    n = sum(1 for yy in range(wy0, wy1 + 1) if lum(x, yy) > 60)
    cols.append(n)
x = 0
while x < W:
    if cols[x] > 0:
        x0 = x
        while x < W and cols[x] > 0:
            x += 1
        print(f"  x={x0}..{x-1} (w={x-x0})")
    else:
        x += 1
