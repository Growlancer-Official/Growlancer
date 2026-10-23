"""
Regenerate the Growlanzo brand assets from the FINAL logo artwork.

Source: WhatsApp Image 2026-10-23 at 12.59.26 PM (1).jpeg — 1086x362, the
approved lockup on a black plate (faceted green "G" + silver "Growlanzo" with
green "ZO" + "Freelance work. Grown together.").

Both theme flavours come from that ONE file so the letterforms can never drift:
  dark  = the artwork as supplied (silver type, for dark surfaces)
  light = the same pixels recoloured to charcoal, for white surfaces

Outputs (public/), transparent and deliberately small:
  growlanzo-wordmark-{light,dark}.png   480x94    ~8 KB
  growlanzo-full-{light,dark}.png       480x113   ~12 KB
  og-image.png                          1200x630
"""

from PIL import Image, ImageDraw, ImageFilter

DARK_PLATE = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 12.59.26 PM (1).jpeg'

# Measured from the plate: content x 94..991, wordmark y 77..242, tagline y 244..277.
WM = (94, 66, 992, 243)
FULL = (94, 66, 992, 280)

OUT_WIDTH = 480


def alpha_cut(img):
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
            elif m >= 44:
                dst[x, y] = (r, g, b, 255)
            else:
                f = m / 255.0
                dst[x, y] = (
                    min(255, round(r / f)),
                    min(255, round(g / f)),
                    min(255, round(b / f)),
                    min(255, round((m - 14) * 255 / 30)),
                )
    return out


def clean_alpha(rgba):
    out = rgba
    for _ in range(2):
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


def trim(rgba):
    return rgba.crop(rgba.getbbox())


def column_counts(rgba):
    w, h = rgba.size
    px = rgba.load()
    return [sum(1 for y in range(h) if px[x, y][3] > 40) for x in range(w)]


def emblem_end(rgba):
    """Right edge of the faceted "G" = the last column holding saturated green
    in the left third of the lockup (the only other green, the "ZO", sits at
    the far right). The mark and the wordmark nearly touch, so a gap-based
    search overshoots into the capital G and eats it."""
    w, h = rgba.size
    px = rgba.load()
    last = 0
    for x in range(int(w * 0.45)):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a > 40 and g > 60 and g > r * 1.1 and g > b * 1.1:
                last = x
                break
    return last


def text_start(rgba, from_x):
    """First column of the silver "Growlanzo" type after the mark: bright and
    achromatic. The mark's last green pixels overlap the G's left arc, so the
    green edge alone cannot be used as the boundary."""
    w, h = rgba.size
    px = rgba.load()
    for x in range(from_x, w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > 170 and max(r, g, b) - min(r, g, b) < 30:
                return x
    return from_x


def scrub_grey_noise(rgba, x_limit, y_limit):
    """The plate carries a shadow wedge on the emblem's top-right point and a
    grey fringe along its JPEG edges. Invisible on black, a dirty smudge on
    white — so inside the emblem any achromatic pixel is noise, not art (the
    mark itself is only green/yellow). Text and tagline live outside this box."""
    w, h = rgba.size
    src = rgba.load()
    out = rgba.copy()
    dst = out.load()
    for y in range(min(h, y_limit)):
        for x in range(min(w, x_limit)):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            # dark + grey only: the silver wordmark beside the mark stays
            if max(r, g, b) - min(r, g, b) < 40 and lum < 120:
                dst[x, y] = (0, 0, 0, 0)
    return out


def to_ink(rgba, keep_until, text_top):
    """Recolour the achromatic type to charcoal, preserving its luminance order
    (silver wordmark -> #2A2A2A, grey tagline -> mid grey) so light surfaces keep
    the same hierarchy instead of one flat black stamp.

    `keep_until` protects the emblem on the wordmark rows; everything below
    `text_top` is type, and the tagline starts further left than the emblem ends,
    so the x guard must not apply there."""
    w, h = rgba.size
    src = rgba.load()
    out = rgba.copy()
    dst = out.load()
    for y in range(h):
        x_from = 0 if y >= text_top else keep_until
        for x in range(x_from, w):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            if g >= r * 1.10 and g >= b * 1.10:
                continue                      # brand green stays
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            v = round(42 + (255 - lum) * 0.34)
            dst[x, y] = (v, v, v, a)
    return out


def shrink(rgba, width):
    ratio = width / rgba.width
    return rgba.resize((width, max(1, round(rgba.height * ratio))), Image.LANCZOS)


def save_small(rgba, path, colors=128):
    """Palette-quantise before saving: the artwork's smooth gradients otherwise
    carry ~20k distinct colours and ship 45-60 KB. 128 colours + alpha is
    visually identical at render size (<=48px tall) at a fraction of the weight."""
    rgba.quantize(colors=colors, method=Image.FASTOCTREE).save(path, optimize=True)


def main():
    plate = Image.open(DARK_PLATE)
    cut = clean_alpha(alpha_cut(plate))

    crop_wm = cut.crop(WM)
    bbox_wm = crop_wm.getbbox()
    wm = crop_wm.crop(bbox_wm)

    crop_full = cut.crop(FULL)
    bbox_full = crop_full.getbbox()
    full = crop_full.crop(bbox_full)

    e_end = emblem_end(wm)
    t_start = text_start(wm, max(0, e_end - 40))
    # Both crops share the plate's y origin, so the wordmark's bottom edge in the
    # full crop is exactly where the tagline band begins.
    tag_top = bbox_wm[3] - bbox_full[1]

    wm = scrub_grey_noise(wm, t_start - 2, wm.height)
    full = scrub_grey_noise(full, t_start - 2, tag_top)

    wm_dark = shrink(wm, OUT_WIDTH)
    full_dark = shrink(full, OUT_WIDTH)
    wm_light = shrink(to_ink(wm, t_start, wm.height), OUT_WIDTH)
    full_light = shrink(to_ink(full, t_start, tag_top), OUT_WIDTH)

    save_small(wm_dark, 'public/growlanzo-wordmark-dark.png')
    save_small(wm_light, 'public/growlanzo-wordmark-light.png')
    save_small(full_dark, 'public/growlanzo-full-dark.png', colors=160)
    save_small(full_light, 'public/growlanzo-full-light.png', colors=160)
    print('emblem_end', e_end, 'text_start', t_start, 'tagline_top', tag_top)
    print('wordmark', wm_dark.size, 'full', full_dark.size)

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
    ratio = 760 / lock.width
    lock = lock.resize((760, round(lock.height * ratio)), Image.LANCZOS)
    card.alpha_composite(lock, ((W - lock.width) // 2, (H - lock.height) // 2))
    card.convert('RGB').save('public/og-image.png', optimize=True)

    # ---- review sheets ---------------------------------------------------
    for name, bg in (('light', (255, 255, 255)), ('dark', (15, 23, 42))):
        for variant in ('wordmark', 'full'):
            logo = Image.open(f'public/growlanzo-{variant}-{name}.png').convert('RGBA')
            w = 760 if variant == 'wordmark' else 800
            logo = logo.resize((w, round(w * logo.height / logo.width)), Image.LANCZOS)
            sheet = Image.new('RGBA', (w + 60, logo.height + 60), bg + (255,))
            sheet.alpha_composite(logo, (30, 30))
            sheet.convert('RGB').save(f'tmp/review-{variant}-{name}.png')


if __name__ == '__main__':
    main()
