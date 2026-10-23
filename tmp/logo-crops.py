from PIL import Image

dark_p = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 11.15.45 AM.jpeg'
light_p = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 11.15.44 AM.jpeg'

d = Image.open(dark_p).convert("RGB")
l = Image.open(light_p).convert("RGB")

# --- 1. inspect crops from the dark plate
d.crop((174, 92, 911, 221)).resize((737 * 2, 129 * 2), Image.LANCZOS).save('tmp/crop-wordmark.png')
d.crop((160, 80, 400, 235)).resize((240 * 3, 155 * 3), Image.LANCZOS).save('tmp/crop-G.png')
d.crop((174, 225, 911, 285)).resize((737 * 2, 60 * 2), Image.LANCZOS).save('tmp/crop-tagline.png')

# --- 2. what is the dark ink of the `light` plate? look at stroke interiors
px = l.load()
from collections import Counter
c = Counter()
for y in range(96, 221):
    for x in range(190, 896):
        r, g, b = px[x, y]
        if 6 < max(r, g, b) < 45 and max(r, g, b) - min(r, g, b) < 14:
            c[(r // 4 * 4, g // 4 * 4, b // 4 * 4)] += 1
print("light-plate dark stroke colours (quantised) top 8:")
for col, n in c.most_common(8):
    print("  ", col, n)

# --- 3. brightest / darkest of the white text in the dark plate
px = d.load()
cw = Counter()
for y in range(92, 221):
    for x in range(300, 660):
        r, g, b = px[x, y]
        if min(r, g, b) > 200:
            cw[(r // 4 * 4, g // 4 * 4, b // 4 * 4)] += 1
print("white text colours top 5:")
for col, n in cw.most_common(5):
    print("  ", col, n)

# --- 4. sample the 'zo' gradient precisely (column strip across both letters)
print("zo greens (x,y)->rgb")
for x in range(670, 910, 20):
    for y in (120, 160, 200):
        print(f"   ({x},{y}) {px[x, y]}")
