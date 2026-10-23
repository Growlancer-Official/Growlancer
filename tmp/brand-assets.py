"""
Regenerate the Growlanzo brand assets from the final logo artwork.

Source: two WhatsApp JPEGs, identical artwork on a black plate —
  11.15.45 : white/silver "rowlan"  -> the DARK-surface lockup
  11.15.44 : near-black "rowlan"    -> the LIGHT-surface lockup

Both are alpha-cut from the black plate with the standard black-background
unpremultiply (alpha = max channel, colour = channel / alpha), so the artwork
lands on any surface without a visible box. The light lockup is derived from
the dark plate by recolouring the achromatic (text) pixels to the ink used in
the supplied light plate (#0A0A0A), which keeps the letterforms pixel-identical.

Outputs (public/):
  growlanzo-wordmark-{light,dark}.png   name only, 737x129
  growlanzo-full-{light,dark}.png       name + tagline, 737x178
  growlanzo-icon-{512,192,180}.png      "G" emblem on a white plate
  favicon-growlanzo.png                 64x64 favicon
  og-image.png                          1200x630 social card
"""

from PIL import Image, ImageDraw, ImageFilter

DARK_PLATE = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 11.15.45 AM.jpeg'

# Geometry measured from the source plate (see tmp/logo-profile.py)
WM = (174, 92, 911, 221)     # wordmark band
FULL = (174, 92, 911, 270)   # wordmark + tagline
# Charcoal taken from the supplied WHITE-theme artwork (the 'Growlan' type sits
# at ~#3c3c3c there, not pure black) so the light lockup on white reads soft
# rather than stamped-on.
INK = (60, 60, 60)

# Shipped width. The lockups render at 28-48px tall, so 560px is still >3x at
# the largest size; combined with palette quantisation it keeps each file small
# without a visible loss.
OUT_WIDTH = 560

FLOOR = 10                   # JPEG noise floor on the black plate


def alpha_cut(img):
    """Black plate -> RGBA, keeping the artwork's own colour.

    A straight `alpha = max channel` unpremultiply makes every saturated pixel
    semi-transparent (bright green has max ~170), so on a white surface the
    whole lockup washed out. The plate's background is pure black and the
    artwork's shaded greens sit well above it, so coverage is ramped over a
    narrow 6..36 band: interiors keep their exact colour and only the 1px
    JPEG edge is feathered. Feather pixels are unpremultiplied so the edge does
    not carry a black fringe onto light surfaces.
    """
    img = img.convert('RGB')
    w, h = img.size
    src = img.load()
    out = Image.new('RGBA', (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = max(r, g, b)
            if m <= 14:
                dst[x, y] = (0, 0, 0, 0)
                continue
            if m >= 44:
                dst[x, y] = (r, g, b, 255)
                continue
            f = m / 255.0
            dst[x, y] = (
                min(255, round(r / f)),
                min(255, round(g / f)),
                min(255, round(b / f)),
                min(255, round((m - 14) * 255 / 30)),
            )
    return out


def recolor(rgba, text):
    """Split the lockup into its two inks: green stays, everything else
    becomes `text`. Also scrubs the JPEG chroma speckle (magenta/green fringes
    on the white-on-black edge) that a per-channel unpremultiply amplifies."""
    w, h = rgba.size
    src = rgba.load()
    out = rgba.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            is_green = g >= r * 1.10 and g >= b * 1.10
            if is_green:
                continue
            if max(r, g, b) > 60:          # type, not a dark facet of the mark
                dst[x, y] = (text[0], text[1], text[2], a)
    return out


def clean_alpha(rgba):
    """Drop JPEG speckle: isolated opaque dots out, isolated pinholes in."""
    out = rgba
    for _ in range(3):
        w, h = out.size
        src = out.load()
        mask = [[src[x, y][3] > 128 for x in range(w)] for y in range(h)]
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
                        if 0 <= xx < w and 0 <= yy < h and mask[yy][xx]:
                            n += 1
                r, g, b, a = src[x, y]
                if mask[y][x] and n <= 3:
                    dst[x, y] = (0, 0, 0, 0)
                elif not mask[y][x] and n >= 6:
                    dst[x, y] = (r, g, b, 255)
    return out


def trim(rgba, pad=0):
    bbox = rgba.getbbox()
    out = rgba.crop(bbox)
    if pad:
        canvas = Image.new('RGBA', (out.width + pad * 2, out.height + pad * 2), (0, 0, 0, 0))
        canvas.alpha_composite(out, (pad, pad))
        out = canvas
    return out


def emblem(rgba_wordmark):
    """Leftmost saturated-green cluster == the 3D 'G' mark."""
    w, h = rgba_wordmark.size
    px = rgba_wordmark.load()
    cols = []
    for x in range(w):
        n = 0
        for y in range(h):
            r, g, b, a = px[x, y]
            if a > 40 and g > 60 and g > r * 1.15 and g > b * 1.15:
                n += 1
        cols.append(n)
    # walk from the left until a sustained empty gap (> 6 columns)
    start = next(x for x, n in enumerate(cols) if n > 2)
    x = start
    gap = 0
    end = x
    while x < w:
        if cols[x] > 1:
            gap = 0
            end = x
        else:
            gap += 1
            if gap > 6:
                break
        x += 1
    return rgba_wordmark.crop((start, 0, end + 1, h))


def icon_from(emblem_rgba, size, plate=(255, 255, 255, 255), fill=0.66):
    canvas = Image.new('RGBA', (size, size), plate)
    e = emblem_rgba.copy()
    target = int(size * fill)
    ratio = target / max(e.width, e.height)
    e = e.resize((max(1, round(e.width * ratio)), max(1, round(e.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(e, ((size - e.width) // 2, (size - e.height) // 2))
    return canvas


def ship(rgba, path):
    """Downscale to OUT_WIDTH and write a small palette PNG."""
    w = OUT_WIDTH
    h = max(1, round(rgba.height * w / rgba.width))
    small = rgba.resize((w, h), Image.LANCZOS)
    # 128 colours + alpha is visually lossless for a two-ink logo and halves
    # the bytes of a true-colour PNG.
    small.quantize(colors=128, method=Image.FASTOCTREE).save(path, optimize=True)
    return small.size


def main():
    plate = Image.open(DARK_PLATE)
    full_rgba = alpha_cut(plate.crop(FULL))
    wm_rgba = alpha_cut(plate.crop(WM))

    full_rgba = clean_alpha(full_rgba)
    wm_rgba = clean_alpha(wm_rgba)
    full_dark = recolor(trim(full_rgba), (255, 255, 255))
    wm_dark = recolor(trim(wm_rgba), (255, 255, 255))
    full_light = recolor(trim(full_rgba), INK)
    wm_light = recolor(trim(wm_rgba), INK)

    print('wordmark', wm_dark.size, 'full', full_dark.size)
    print('wordmark shipped', ship(wm_dark, 'public/growlanzo-wordmark-dark.png'))
    ship(wm_light, 'public/growlanzo-wordmark-light.png')
    ship(full_dark, 'public/growlanzo-full-dark.png')
    ship(full_light, 'public/growlanzo-full-light.png')
    ship(full_light, 'tmp/preview-full-light.png')

    # ---- social card 1200x630 -------------------------------------------
    W, H = 1200, 630
    card = Image.new('RGB', (W, H), (7, 20, 12))
    d = ImageDraw.Draw(card)
    for y in range(H):
        t = y / H
        d.line(
            [(0, y), (W, y)],
            fill=(
                round(7 + 10 * (1 - t)),
                round(20 + 34 * (1 - t)),
                round(12 + 12 * (1 - t)),
            ),
        )
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.55, -H * 0.55, W * 1.35, H * 0.75], fill=(53, 180, 33, 46))
    gd.ellipse([-W * 0.3, H * 0.45, W * 0.5, H * 1.6], fill=(111, 194, 34, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    card = Image.alpha_composite(card.convert('RGBA'), glow)

    lock = full_dark.copy()
    ratio = 720 / lock.width
    lock = lock.resize((720, round(lock.height * ratio)), Image.LANCZOS)
    card.alpha_composite(lock, ((W - lock.width) // 2, (H - lock.height) // 2))
    card.convert('RGB').save('public/og-image.png', optimize=True)

    # ---- contact sheets for review --------------------------------------
    for tag, logo, bg, fg in (
        ('light', wm_light, (255, 255, 255), (15, 23, 42)),
        ('dark', wm_dark, (15, 23, 42), (255, 255, 255)),
    ):
        sheet = Image.new('RGBA', (820, 260), bg + (255,))
        sheet.alpha_composite(logo.resize((760, round(760 * logo.height / logo.width)), Image.LANCZOS), (30, 40))
        sheet.convert('RGB').save(f'tmp/preview-wordmark-{tag}.png')

    sheet = Image.new('RGBA', (860, 300), (255, 255, 255, 255))
    sheet.alpha_composite(
        full_light.resize((540, round(540 * full_light.height / full_light.width)), Image.LANCZOS),
        (30, 40),
    )
    sheet.convert('RGB').save('tmp/preview-full-light.png')


if __name__ == '__main__':
    main()
