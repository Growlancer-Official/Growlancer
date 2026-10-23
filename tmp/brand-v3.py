"""Rebuild the Growlanzo brand assets from the final artwork (Oct 23 PM set).

Sources
  emblem JPEG ............ the flat "G" mark (new logo / favicon / app icon)
  lockup JPEG ............ the final lockup export; on it only the GREEN parts
                           (G, "ZO", "Grown together.") carry usable colour —
                           the "rowlan" name is exported near-black on black,
                           so its shape is taken from the previously shipped
                           wordmark (same typeface) and re-inked here.

Outputs (public/, all 480px wide, palette-quantised to stay small)
  growlanzo-wordmark-{light,dark}.png   480x94
  growlanzo-full-{light,dark}.png       480x113
  growlanzo-mark-512.png                app / apple / manifest icon
  growlanzo-mark-64.webp                favicon
  og-image.png                          1200x630 share card
"""

from PIL import Image, ImageDraw, ImageFilter
import math

EMBLEM = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 2.33.29 PM.jpeg'
LOCKUP = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 2.25.57 PM.jpeg'

# Lockup geometry, measured on the 1600x533 plate.
G_BOX = (150, 127, 389, 351)      # the emblem: x0,y0,x1,y1
ZO_BOX = (1133, 150, 1440, 351)   # green "ZO"

# Shipped canvas: unchanged from the approved layout so nothing shifts.
W, H = 480, 94
TAG_H = 19                        # tagline strip below the wordmark
FULL_H = H + TAG_H

# Placement of the pieces inside the 480x94 canvas (measured on the approved
# artwork, so the lockup keeps its proportions).
G_AT = (0, 5, 97, 89)             # x, y, w, h
ZO_AT = (360, 30, 120, 59)
NAME_AT = (99, 27)                # top-left of the name's glyph box

# Inks.
LIGHT_INK = (17, 17, 17)          # the name in the light-theme export
LIGHT_TAG = (86, 86, 86)
DARK_TAG = (142, 142, 142)
# Silver gradient of the name on dark surfaces, sampled row by row from the
# approved dark lockup (top -> bottom).
SILVER = [(0, 250), (40, 232), (60, 214), (90, 198), (120, 198)]

FLOOR, CEIL = 12, 48


def cut(img, box=None):
    """Black plate -> RGBA with a soft 1px edge (artwork keeps its own colour)."""
    if box:
        img = img.crop(box)
    img = img.convert('RGB')
    w, h = img.size
    out = Image.new('RGBA', (w, h))
    src, dst = img.load(), out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = max(r, g, b)
            if m <= FLOOR:
                dst[x, y] = (0, 0, 0, 0)
            elif m >= CEIL:
                dst[x, y] = (r, g, b, 255)
            else:
                f = m / 255.0
                dst[x, y] = (
                    min(255, round(r / f)),
                    min(255, round(g / f)),
                    min(255, round(b / f)),
                    round((m - FLOOR) * 255 / (CEIL - FLOOR)),
                )
    return out


def scrub(rgba, rounds=2):
    """Drop isolated JPEG speckle (single dots out, single pinholes in)."""
    out = rgba
    for _ in range(rounds):
        w, h = out.size
        src = out.load()
        solid = [[src[x, y][3] > 128 for x in range(w)] for y in range(h)]
        out = out.copy()
        dst = out.load()
        for y in range(h):
            for x in range(w):
                n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < w and 0 <= yy < h and solid[yy][xx]:
                            n += 1
                r, g, b, a = src[x, y]
                if solid[y][x] and n <= 2:
                    dst[x, y] = (0, 0, 0, 0)
                elif not solid[y][x] and n >= 7:
                    dst[x, y] = (r, g, b, 255)
    return out


def trim(rgba):
    return rgba.crop(rgba.getbbox())


def silver_at(y, h):
    t = min(1.0, max(0.0, y / max(1, h - 1))) * 120.0
    for i in range(len(SILVER) - 1):
        (y0, v0), (y1, v1) = SILVER[i], SILVER[i + 1]
        if y0 <= t <= y1:
            f = (t - y0) / (y1 - y0)
            v = round(v0 + (v1 - v0) * f)
            return (v, v, v)
    return (SILVER[-1][1],) * 3


def fit(rgba, w, h):
    return rgba.resize((max(1, w), max(1, h)), Image.LANCZOS)


def is_green(r, g, b):
    return g >= r * 1.10 and g >= b * 1.10


def build_wordmark(emblem, zo, name_mask, tagline):
    """One canvas per theme; `name_mask` and `tagline` are the LIGHT plates."""
    result = {}
    for theme in ('light', 'dark'):
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))

        # 1. the mark
        canvas.alpha_composite(fit(emblem, G_AT[2], G_AT[3]), (G_AT[0], G_AT[1]))

        # 2. the name — shape from the approved artwork, re-inked per theme
        mask = name_mask.copy()
        px = mask.load()
        for y in range(mask.height):
            ink = LIGHT_INK if theme == 'light' else silver_at(y, mask.height)
            for x in range(mask.width):
                r, g, b, a = px[x, y]
                if a:
                    px[x, y] = (ink[0], ink[1], ink[2], a)
        canvas.alpha_composite(mask, NAME_AT)

        # 3. the "ZO"
        canvas.alpha_composite(fit(zo, ZO_AT[2], ZO_AT[3]), (ZO_AT[0], ZO_AT[1]))

        # 4. tagline strip (name + tagline variant) — kept on its original
        #    x offsets so it stays centred under the name
        strip = Image.new('RGBA', (W, TAG_H), (0, 0, 0, 0))
        tag = tagline.copy()
        tp = tag.load()
        for y in range(tag.height):
            for x in range(tag.width):
                r, g, b, a = tp[x, y]
                if a and not is_green(r, g, b):
                    c = LIGHT_TAG if theme == 'light' else DARK_TAG
                    tp[x, y] = (c[0], c[1], c[2], a)
        strip.alpha_composite(tag, (0, 0))
        full = Image.new('RGBA', (W, FULL_H), (0, 0, 0, 0))
        full.alpha_composite(canvas, (0, 0))
        full.alpha_composite(strip, (0, H))

        result[theme] = (canvas, full)
    return result


def save(img, path):
    """Quantise to a 128-colour palette with alpha — visually identical at
    display size, a third of the bytes of truecolour RGBA."""
    q = img.convert('RGBA').quantize(colors=128, method=Image.FASTOCTREE)
    q.save(path, optimize=True)
    return len(open(path, 'rb').read())


def og(canvas_dark, full_dark):
    """1200x630 share card: the lockup on the brand's dark plate."""
    card = Image.new('RGB', (1200, 630), (11, 15, 25))
    d = ImageDraw.Draw(card)
    # soft green glow behind the mark
    glow = Image.new('RGB', (1200, 630), (11, 15, 25))
    gd = ImageDraw.Draw(glow)
    for i in range(160, 0, -1):
        a = int(28 * (1 - i / 160) ** 2)
        gd.ellipse([600 - i * 5, 330 - i * 2, 600 + i * 5, 330 + i * 2], fill=(11 + a // 2, 15 + a, 25 + a // 3))
    card = Image.blend(card, glow, 0.9)
    lock = fit(full_dark, 720, round(720 * full_dark.height / full_dark.width))
    card.paste(lock, ((1200 - lock.width) // 2, (630 - lock.height) // 2), lock)
    return card


def main():
    emblem = trim(scrub(cut(Image.open(EMBLEM))))
    zo = trim(scrub(cut(Image.open(LOCKUP), ZO_BOX)))

    # The name's shape comes from the approved wordmark (the new export only
    # carries its outline). It is cropped before the "ZO" so the two never mix.
    ref = Image.open('tmp/ref/growlanzo-wordmark-light.png').convert('RGBA')
    name_mask = ref.crop((99, 26, 357, 75))
    # drop the faint JPEG haze outside the glyphs, leave the shapes untouched
    npx = name_mask.load()
    for y in range(name_mask.height):
        for x in range(name_mask.width):
            r, g, b, a = npx[x, y]
            if a < 12:
                npx[x, y] = (r, g, b, 0)

    ref_full = Image.open('tmp/ref/growlanzo-full-light.png').convert('RGBA')
    tagline = ref_full.crop((0, 94, 480, 113))
    tpx = tagline.load()
    for y in range(tagline.height):
        for x in range(tagline.width):
            r, g, b, a = tpx[x, y]
            if a and (max(r, g, b) < 30):
                tpx[x, y] = (r, g, b, 0)
    print('emblem', emblem.size, 'zo', zo.size, 'name', name_mask.size, 'tagline', tagline.size)

    built = build_wordmark(emblem, zo, name_mask, tagline)
    for theme, (word, full) in built.items():
        print(theme, 'wordmark', save(word, f'public/growlanzo-wordmark-{theme}.png'),
              'full', save(full, f'public/growlanzo-full-{theme}.png'))

    mark = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    inner = fit(emblem, 384, round(384 * emblem.height / emblem.width))
    mark.alpha_composite(inner, ((512 - inner.width) // 2, (512 - inner.height) // 2))
    print('mark-512', save(mark, 'public/growlanzo-mark-512.png'))
    mark64 = fit(mark, 64, 64)
    mark64.save('public/growlanzo-mark-64.webp', 'WEBP', quality=90, method=6)
    print('mark-64', len(open('public/growlanzo-mark-64.webp', 'rb').read()))

    og(built['dark'][0], built['dark'][1]).save('public/og-image.png', optimize=True)
    print('og', len(open('public/og-image.png', 'rb').read()))


if __name__ == '__main__':
    main()
