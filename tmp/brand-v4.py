"""Final Growlanzo assets: the approved lockup with the new mark and a clean ZO.

The approved artwork (v2, in tmp/ref/) is kept as the base — its name, spacing
and tagline are what the brand was signed off with. Two pieces are replaced:

  * the "G" mark  -> the flat emblem from the new export (logo / favicon too)
  * the "ZO"      -> the same lettering from the new export; the base file
                     carried a dark JPEG blob on the O

The name is re-inked per theme (near-black for light surfaces, the sampled
silver gradient for dark), which is how the light-theme export reads.

Outputs (public/, unchanged 480x94 / 480x113 canvas so no layout moves):
  growlanzo-wordmark-{light,dark}.png
  growlanzo-full-{light,dark}.png
  growlanzo-mark-512.png / growlanzo-mark-64.webp   (favicon + app icon)
  og-image.png
"""

from PIL import Image, ImageDraw

EMBLEM = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 2.33.29 PM.jpeg'
LOCKUP = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 2.25.57 PM.jpeg'
REF = 'tmp/ref'

ZO_BOX = (1133, 150, 1440, 351)   # green "ZO" on the new plate

W, H, FULL_H = 480, 94, 113
G_AT = (0, 5, 97, 89)             # x, y, w, h — the base mark's box
ZO_AT = (371, 31, 109, 56)
G_CLEAR = (0, 0, 98, 94)          # area the old mark occupied
ZO_CLEAR = (371, 0, 480, 94)

LIGHT_INK = (18, 18, 18)
SILVER = [(0, 250), (40, 232), (60, 214), (90, 198), (120, 198)]

FLOOR, CEIL = 12, 48


def cut(img, box=None):
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


def fit(rgba, w, h):
    return rgba.resize((max(1, w), max(1, h)), Image.LANCZOS)


def is_green(r, g, b):
    return g >= r * 1.10 and g >= b * 1.10


def silver_at(y, h):
    t = min(1.0, max(0.0, y / max(1, h - 1))) * 120.0
    for i in range(len(SILVER) - 1):
        (y0, v0), (y1, v1) = SILVER[i], SILVER[i + 1]
        if y0 <= t <= y1:
            f = (t - y0) / (y1 - y0)
            v = round(v0 + (v1 - v0) * f)
            return (v, v, v)
    return (SILVER[-1][1],) * 3


def build(theme):
    base = Image.open(f'{REF}/growlanzo-wordmark-light.png').convert('RGBA')
    full = Image.open(f'{REF}/growlanzo-full-light.png').convert('RGBA')

    # 1. re-ink the name (the region between the mark and the "ZO")
    for img in (base, full):
        px = img.load()
        for y in range(img.height):
            ink = LIGHT_INK if theme == 'light' else silver_at(y, H)
            for x in range(0, W):
                r, g, b, a = px[x, y]
                if not a or is_green(r, g, b):
                    continue
                if max(r, g, b) < 30:      # JPEG haze, not type
                    px[x, y] = (r, g, b, 0)
                    continue
                px[x, y] = (ink[0], ink[1], ink[2], a)

    # 2. new mark + clean ZO on both canvases
    for img in (base, full):
        for box in (G_CLEAR, ZO_CLEAR):
            ImageDraw.Draw(img).rectangle(box, fill=(0, 0, 0, 0))
        img.alpha_composite(fit(EMBLEM_IMG, G_AT[2], G_AT[3]), (G_AT[0], G_AT[1]))
        img.alpha_composite(fit(ZO_IMG, ZO_AT[2], ZO_AT[3]), (ZO_AT[0], ZO_AT[1]))

    return base, full


def save_png(img, path):
    q = img.convert('RGBA').quantize(colors=128, method=Image.FASTOCTREE)
    q.save(path, optimize=True)
    return len(open(path, 'rb').read())


def build_og(word_dark):
    card = Image.new('RGB', (1200, 630), (11, 15, 25))
    glow = Image.new('RGB', (1200, 630), (11, 15, 25))
    gd = ImageDraw.Draw(glow)
    for i in range(170, 0, -1):
        a = int(30 * (1 - i / 170) ** 2)
        gd.ellipse([600 - i * 5, 315 - i * 2, 600 + i * 5, 315 + i * 2],
                   fill=(11 + a // 2, 15 + a, 25 + a // 3))
    card = Image.blend(card, glow, 0.9)
    lock = fit(word_dark, 700, round(700 * word_dark.height / word_dark.width))
    card.paste(lock, ((1200 - lock.width) // 2, (630 - lock.height) // 2), lock)
    card.save('public/og-image.png', optimize=True)
    return len(open('public/og-image.png', 'rb').read())


EMBLEM_IMG = trim(scrub(cut(Image.open(EMBLEM))))
ZO_IMG = trim(scrub(cut(Image.open(LOCKUP), ZO_BOX)))


def main():
    print('mark', EMBLEM_IMG.size, 'zo', ZO_IMG.size)
    for theme in ('light', 'dark'):
        word, full = build(theme)
        print(theme, 'wordmark', save_png(word, f'public/growlanzo-wordmark-{theme}.png'),
              'full', save_png(full, f'public/growlanzo-full-{theme}.png'))

    mark = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    inner = fit(EMBLEM_IMG, 384, round(384 * EMBLEM_IMG.height / EMBLEM_IMG.width))
    mark.alpha_composite(inner, ((512 - inner.width) // 2, (512 - inner.height) // 2))
    print('mark-512', save_png(mark, 'public/growlanzo-mark-512.png'))
    fit(mark, 64, 64).save('public/growlanzo-mark-64.webp', 'WEBP', quality=90, method=6)
    print('mark-64', len(open('public/growlanzo-mark-64.webp', 'rb').read()))

    print('og', build_og(build('dark')[0]))


if __name__ == '__main__':
    main()
