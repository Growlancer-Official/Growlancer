"""Final Growlanzo assets from the white-background master (23 Oct, 3:28 PM).

This export is the clean one: black name, green G / ZO, grey + green tagline on
white. Because the plate is white, the alpha cut is a straight unpremultiply
against white (alpha = 1 - min(channel)), which recovers the artwork's own
edges instead of guessing them.

The site is light-only now, so there is one lockup per variant plus an
"inverse" pair for the permanently dark admin sidebar / sign-in plate.

Outputs (public/):
  growlanzo-wordmark.png          480x94   light surfaces (default)
  growlanzo-wordmark-inverse.png  480x94   white name, for dark panels
  growlanzo-full.png              480x113  name + tagline
  growlanzo-full-inverse.png      480x113
  og-image.png                    1200x630
"""

from PIL import Image, ImageDraw

SRC = r'C:\Users\mdmir\Downloads\WhatsApp Image 2026-10-23 at 3.28.03 PM.jpeg'

# Measured on the 1599x533 master.
NAME_BOX = (148, 123, 1440, 352)
TAG_BOX = (321, 355, 1377, 408)

W, H, FULL_H = 480, 94, 113
SCALE = W / (NAME_BOX[2] - NAME_BOX[0])
NAME_H = round((NAME_BOX[3] - NAME_BOX[1]) * SCALE)
NAME_Y = (H - NAME_H) // 2
TAG_X = round((TAG_BOX[0] - NAME_BOX[0]) * SCALE)
TAG_Y = NAME_Y + round((TAG_BOX[1] - NAME_BOX[1]) * SCALE)


def on_white(rgba):
    """RGB on a white plate -> RGBA.

    A pixel is `c*a + 255*(1-a)`, so the coverage is `1 - min(channel)/255` and
    the true colour is the unpremultiplied remainder. Noise below one level is
    dropped so the plate does not turn into a grey wash.
    """
    rgb = rgba.convert('RGB')
    w, h = rgb.size
    out = Image.new('RGBA', (w, h))
    src, dst = rgb.load(), out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            m = min(r, g, b)
            if m >= 254:
                dst[x, y] = (0, 0, 0, 0)
                continue
            a = 255 - m
            f = a / 255.0
            dst[x, y] = (
                max(0, min(255, round((r - 255 * (1 - f)) / f))),
                max(0, min(255, round((g - 255 * (1 - f)) / f))),
                max(0, min(255, round((b - 255 * (1 - f)) / f))),
                a,
            )
    return out


def is_green(r, g, b):
    # `g > 60` matters: pure black satisfies the ratio test and would otherwise
    # be treated as green, leaving the name black on dark panels.
    return g > 60 and g >= r * 1.10 and g >= b * 1.10


def invert(rgba, ink=(246, 246, 246)):
    """Dark-panel flavour: neutral type becomes near-white, greens stay green.

    The tagline is mid-grey on white, so its unpremultiplied alpha is ~50% —
    correct on white, but it would read as a ghost on a dark panel. Type is
    opaque by nature, so coverage is lifted back to full while the antialiased
    edge keeps its partial alpha.
    """
    out = rgba.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and not is_green(r, g, b):
                px[x, y] = (ink[0], ink[1], ink[2], min(255, round(a * 2.2)))
    return out


def fit(img, w, h):
    return img.resize((max(1, w), max(1, h)), Image.LANCZOS)


def save(img, path):
    q = img.convert('RGBA').quantize(colors=128, method=Image.FASTOCTREE)
    q.save(path, optimize=True)
    return len(open(path, 'rb').read())


def build(ink_mode):
    src = Image.open(SRC)
    name = on_white(src.crop(NAME_BOX))
    tag = on_white(src.crop(TAG_BOX))
    if ink_mode:
        name, tag = invert(name), invert(tag)

    word = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    word.alpha_composite(fit(name, W, NAME_H), (0, NAME_Y))

    full = Image.new('RGBA', (W, FULL_H), (0, 0, 0, 0))
    full.alpha_composite(word, (0, 0))
    full.alpha_composite(fit(tag, round(tag.width * SCALE), round(tag.height * SCALE)), (TAG_X, TAG_Y))
    return word, full


def og(full_inverse):
    card = Image.new('RGB', (1200, 630), (11, 15, 25))
    glow = Image.new('RGB', (1200, 630), (11, 15, 25))
    gd = ImageDraw.Draw(glow)
    for i in range(170, 0, -1):
        a = int(30 * (1 - i / 170) ** 2)
        gd.ellipse([600 - i * 5, 315 - i * 2, 600 + i * 5, 315 + i * 2],
                   fill=(11 + a // 2, 15 + a, 25 + a // 3))
    card = Image.blend(card, glow, 0.9)
    lock = fit(full_inverse, 760, round(760 * full_inverse.height / full_inverse.width))
    card.paste(lock, ((1200 - lock.width) // 2, (630 - lock.height) // 2), lock)
    card.save('public/og-image.png', optimize=True)
    return len(open('public/og-image.png', 'rb').read())


def main():
    for mode, suffix in ((False, ''), (True, '-inverse')):
        word, full = build(mode)
        print(f'wordmark{suffix}', save(word, f'public/growlanzo-wordmark{suffix}.png'),
              f'full{suffix}', save(full, f'public/growlanzo-full{suffix}.png'))
    print('og', og(build(True)[1]))
    print('geometry', dict(scale=round(SCALE, 4), name_h=NAME_H, name_y=NAME_Y, tag_x=TAG_X, tag_y=TAG_Y))


if __name__ == '__main__':
    main()
