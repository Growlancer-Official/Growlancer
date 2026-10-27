"""
Install the supplied final Growlanzo mark (yellow->green "G") as the brand
artwork everywhere the site renders it.

Inputs : C:\\Users\\mdmir\\Downloads\\Growlancer Final logo.png  (3200x3200 RGBA)
Outputs: public/UpdatedLogo.png     512 app icon / referral card avatar
         public/UpdatedLogo.webp     32 favicon
         public/apple-touch-icon.png 180 on a white plate (iOS ignores alpha)
         public/growlanzo-wordmark*.png / growlanzo-full*.png   new G swapped in
                                                                at the old G's
                                                                exact box

The wordmark/full lockups are not regenerated from fonts: only the "G" glyph
changed in the rebrand, so the existing letterforms are kept pixel-for-pixel and
the new mark is composited into the box the old G occupied. That keeps the
header layout (480x94 / 480x113, same intrinsic size in BrandLogo) untouched.
"""
from PIL import Image

SRC = r'C:\Users\mdmir\Downloads\Growlancer Final logo.png'
OUT = 'public/'

mark = Image.open(SRC).convert('RGBA')
mark = mark.crop(mark.split()[3].getbbox())


def scaled(m, height=None, width=None, pad=0.0):
    """Resize preserving aspect; optional fractional padding around the canvas."""
    if height:
        w = round(m.width * height / m.height)
        r = m.resize((w, height), Image.LANCZOS)
    else:
        h = round(m.height * width / m.width)
        r = m.resize((width, h), Image.LANCZOS)
    if pad:
        pw, ph = round(r.width * (1 + pad * 2)), round(r.height * (1 + pad * 2))
        canvas = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
        canvas.paste(r, ((pw - r.width) // 2, (ph - r.height) // 2), r)
        return canvas
    return r


# ── 1. App icon + favicon (transparent, the mark alone) ────────────────────
scaled(mark, width=512, pad=0.06).save(OUT + 'UpdatedLogo.png', optimize=True)
scaled(mark, width=32).save(OUT + 'UpdatedLogo.webp', 'WEBP', quality=92, method=6)

# iOS composites apple-touch icons on black, so this one is plated white.
apple = Image.new('RGBA', (180, 180), (255, 255, 255, 255))
art = scaled(mark, height=132)
apple.paste(art, ((180 - art.width) // 2, (180 - art.height) // 2), art)
apple.convert('RGB').save(OUT + 'apple-touch-icon.png', optimize=True)


# ── 2. Wordmark / full lockups: swap the G in place ────────────────────────
def old_g_box(im):
    """Bounding box of the leading 'G' glyph (stops at the first column gap)."""
    a = im.split()[3]
    w, h = im.size
    cols = [max(a.crop((x, 0, x + 1, h)).getdata()) for x in range(w)]
    rows = [max(a.crop((0, y, w, y + 1)).getdata()) for y in range(h)]
    top = next(y for y, v in enumerate(rows) if v > 8)
    bottom = h - next(y for y, v in enumerate(reversed(rows)) if v > 8)
    # Restrict gap detection to the cap-height band so a tagline does not merge
    # the G with the first letter.
    band_bottom = top + round((bottom - top) * 0.75)
    band = a.crop((0, top, w, band_bottom))
    band_cols = [max(band.crop((x, 0, x + 1, band.height)).getdata()) for x in range(w)]
    x0 = next(x for x, v in enumerate(band_cols) if v > 8)
    gap = 0
    x1 = w
    for x in range(x0 + 1, w):
        if band_cols[x] <= 8:
            gap += 1
            if gap >= 5:
                x1 = x - gap + 1
                break
        else:
            gap = 0
    return x0, top, x1, bottom


for name in (
    'growlanzo-wordmark.png',
    'growlanzo-wordmark-inverse.png',
    'growlanzo-full.png',
    'growlanzo-full-inverse.png',
):
    src = Image.open(OUT + name)
    im = src.convert('RGBA')
    x0, y0, x1, y1 = old_g_box(im)
    box_w, box_h = x1 - x0, y1 - y0

    # Fit the new mark inside the old G's box, preserving its aspect ratio.
    s = min(box_w / mark.width, box_h / mark.height)
    art = mark.resize((max(1, round(mark.width * s)), max(1, round(mark.height * s))), Image.LANCZOS)

    # Clear the old G (including a 1px fringe of antialiasing) and paste the new.
    im.paste((0, 0, 0, 0), (x0, y0, x1, y1))
    px = x0 + (box_w - art.width) // 2
    py = y0 + (box_h - art.height) // 2
    im.paste(art, (px, py), art)

    im.save(OUT + name, optimize=True)
    print(f'{name}: G box {box_w}x{box_h} at ({x0},{y0}) -> mark {art.width}x{art.height}')

print('mark', mark.size)
