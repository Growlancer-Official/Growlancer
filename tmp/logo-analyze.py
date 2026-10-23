from PIL import Image
import colorsys

paths = {
    "dark": r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 11.15.45 AM.jpeg',
    "light": r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 11.15.44 AM.jpeg',
}

for tag, p in paths.items():
    im = Image.open(p).convert("RGB")
    W, H = im.size
    px = im.load()
    # bounding box of anything clearly brighter than the black plate
    minx, miny, maxx, maxy = W, H, -1, -1
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if max(r, g, b) > 40:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    print(f"== {tag}: {W}x{H} bbox=({minx},{miny},{maxx},{maxy}) size={maxx-minx+1}x{maxy-miny+1}")

    # dominant greens (saturated green pixels)
    buckets = {}
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y]
            if g > 60 and g > r * 1.15 and g > b * 1.15:
                h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
                if s > 0.35:
                    key = (round(h * 36), round(l * 20) / 20)
                    buckets[key] = buckets.get(key, 0) + 1
    top = sorted(buckets.items(), key=lambda kv: -kv[1])[:12]
    print("  top greens (hue*36, lightness) -> count")
    for (hh, ll), n in top:
        print(f"    hue={hh/36:.2f} L={ll:.2f} n={n}")

    # sample specific regions: the 'zo' at right
    print("  samples:")
    for name, (fx, fy) in {
        "G-mark-mid": (0.20, 0.45),
        "zo-z-mid": (0.78, 0.40),
        "zo-o-mid": (0.90, 0.40),
        "rowlan-mid": (0.55, 0.40),
        "tagline-left": (0.22, 0.83),
        "tagline-green": (0.70, 0.83),
    }.items():
        print(f"    {name}: {px[int(W*fx), int(H*fy)]}")
