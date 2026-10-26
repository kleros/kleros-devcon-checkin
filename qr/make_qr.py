"""
Kleros booth QR codes, drawn in the check-in site's look: night background, the kleros.io
icosahedron, Urbanist + Space Mono, and a crisp violet-to-blue QR with the Kleros mark inside.

    python3 qr/make_qr.py                      # https://devcon.kleros.io
    python3 qr/make_qr.py https://other.url    # any other address

Writes into qr/:
  devcon-kleros-qr-display.png  2480x3508 booth display (A4 at 300 dpi; scales to A3/A2): "Check in & grab
                                limited-edition merch", the merch tiers with photos, the QR. Also as .pdf
  devcon-kleros-qr-poster.png   1800x2400 portrait card (6x8 in at 300 dpi) for a table stand
  devcon-kleros-qr-square.png   1500x1500 sticker / social square
  devcon-kleros-qr-plain.png    QR only on white, for designers to drop into other artwork
  devcon-kleros-qr-plain.svg    QR only, vector, same styling, for large-format print

The address is the same every year (devcon.kleros.io), so these can be reprinted as-is.
Fonts are bundled in qr/fonts (SIL Open Font License).
Needs: pip install "qrcode[pil]" (and opencv-python-headless + zxing-cpp to self-check scanning).
"""
import os
import re
import sys

import qrcode
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

URL = sys.argv[1] if len(sys.argv) > 1 else "https://devcon.kleros.io"
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "site", "assets")   # the flat Kleros mark, shared with the site
FONTS = os.path.join(HERE, "fonts")

# Same tokens as index.html
NIGHT, NIGHT_2, DUSK = (15, 10, 46), (29, 16, 80), (52, 24, 112)
KLEROS, KLEROS_DEEP = (144, 19, 254), (77, 0, 180)
GOLD, LILAC, MUTED, WHITE = (242, 196, 109), (199, 182, 255), (184, 172, 220), (255, 255, 255)
TEAL, PURPLE = (127, 240, 224), (183, 123, 255)
# QR ink: violet into the blue edge of the icosahedron (both well over 6:1 on white)
INK_A, INK_B = (77, 0, 180), (40, 72, 206)
# Finder-eye corner radii in modules (outer, hole, centre). Rounder eyes look softer but some
# scanners (OpenCV among them) stop finding them past ~0.5, so keep these small.
EYE_R = (0.45, 0.22, 0.32)

HEADLINE = "Check in with Kleros"
PERK = "Claim your limited-edition merch"
CAPTION = "Scan with your phone camera"
DOMAIN = re.sub(r"^https?://", "", URL).rstrip("/")


def urbanist(size, weight="ExtraBold"):
    f = ImageFont.truetype(os.path.join(FONTS, "Urbanist.ttf"), size)
    f.set_variation_by_name(weight)
    return f


def mono(size, bold=True):
    return ImageFont.truetype(os.path.join(FONTS, "SpaceMono-Bold.ttf" if bold else "SpaceMono-Regular.ttf"), size)


# ---------- QR ----------

def matrix():
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=0)
    q.add_data(URL)
    q.make(fit=True)
    return q.get_matrix()


def layout(m):
    """Split the code into finder eyes, data modules and the cleared centre for the mark."""
    n = len(m)
    eyes = [(0, 0), (n - 7, 0), (0, n - 7)]
    c = 7 if n < 33 else 9                     # cleared square, a small share of H-level redundancy
    c0 = (n - c) // 2

    def in_eye(x, y):
        return any(ex <= x < ex + 7 and ey <= y < ey + 7 for ex, ey in eyes)

    def in_centre(x, y):
        return c0 <= x < c0 + c and c0 <= y < c0 + c

    dots = [(x, y) for y in range(n) for x in range(n) if m[y][x] and not in_eye(x, y) and not in_centre(x, y)]
    return n, eyes, dots, (c0, c)


def gradient(size, a, b):
    """Diagonal a -> b gradient, top-left to bottom-right."""
    w, h = size
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return small.resize((w, h), Image.BILINEAR)


def kleros_mark(d):
    """App-icon style Kleros mark: violet rounded square with the white flat icosahedron."""
    ss = 4
    big = d * ss
    tile = gradient((big, big), KLEROS, KLEROS_DEEP).convert("RGBA")
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.26), fill=255)
    tile.putalpha(mask)
    s = int(big * 0.62)
    tile.alpha_composite(symbol_png(s), ((big - s) // 2, (big - s) // 2))
    return tile.resize((d, d), Image.LANCZOS)


def symbol_png(size):
    """Rasterise the flat white icosahedron from the bundled SVG path (no SVG renderer needed)."""
    svg = open(os.path.join(ASSETS, "kleros-symbol-white-flat.svg"), encoding="utf-8").read()
    tx, ty = map(float, re.search(r'translate\(([\d.]+),\s*([\d.]+)\)', svg).groups())
    d = re.search(r'<path d="([^"]+)"', svg).group(1)
    vb = 1445.0
    k = size / vb
    img = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(img)
    for i, sub in enumerate(re.findall(r'M[^M]+', d)):
        pts = [(float(x), float(y)) for x, y in re.findall(r'([\d.]+),([\d.]+)', sub)]
        poly = [((x + tx) * k, (y + ty) * k) for x, y in pts]
        draw.polygon(poly, fill=255 if i == 0 else 0)   # first path is the outline, the rest are holes
    out = Image.new("RGBA", (size, size), WHITE + (0,))
    out.putalpha(img)
    return out


def qr_image(size):
    """Separated rounded modules, soft-cornered eyes, violet-to-blue ink, Kleros mark in the middle."""
    n, eyes, dots, (c0, c) = layout(matrix())
    ss = 4
    S = size * ss
    u = S / n
    mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mask)
    g = u * 0.09                                  # gap around each module
    for x, y in dots:
        d.rounded_rectangle((x * u + g, y * u + g, (x + 1) * u - g, (y + 1) * u - g), radius=u * 0.3, fill=255)
    for ex, ey in eyes:
        x0, y0 = ex * u, ey * u
        d.rounded_rectangle((x0, y0, x0 + 7 * u, y0 + 7 * u), radius=u * EYE_R[0], fill=255)
        d.rounded_rectangle((x0 + u, y0 + u, x0 + 6 * u, y0 + 6 * u), radius=u * EYE_R[1], fill=0)
        d.rounded_rectangle((x0 + 2 * u, y0 + 2 * u, x0 + 5 * u, y0 + 5 * u), radius=u * EYE_R[2], fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)

    img = Image.new("RGBA", (size, size), WHITE + (0,))
    ink = gradient((size, size), INK_A, INK_B).convert("RGBA")
    ink.putalpha(mask)
    img.alpha_composite(ink)

    mark = int(size * (c - 1.2) / n)
    img.alpha_composite(kleros_mark(mark), ((size - mark) // 2, (size - mark) // 2))
    return img


# ---------- poster pieces ----------

def background(w, h):
    """Night gradient, a violet glow behind the code, a blue one near the top, light grain."""
    small = Image.new("RGB", (8, 256))
    px = small.load()
    for y in range(256):
        t = y / 255
        a, b, k = (NIGHT, NIGHT_2, t / 0.5) if t < 0.5 else (NIGHT_2, DUSK, (t - 0.5) / 0.5)
        for x in range(8):
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))
    bg = small.resize((w, h), Image.BILINEAR).convert("RGBA")
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((w * -0.1, h * 0.38, w * 1.1, h * 1.02), fill=KLEROS + (70,))
    gd.ellipse((w * 0.22, h * -0.06, w * 0.78, h * 0.26), fill=(70, 110, 255, 45))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(w // 8)))
    grain = Image.effect_noise((w, h), 22).convert("RGBA")
    grain.putalpha(10)
    return Image.alpha_composite(bg, grain)


def text_width(text, f, tracking=0):
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    if not tracking:
        return d.textlength(text, font=f)
    return sum(d.textlength(ch, font=f) for ch in text) + tracking * (len(text) - 1)


def draw_text(img, xy, text, f, fill, tracking=0):
    d = ImageDraw.Draw(img)
    x, y = xy
    if not tracking:
        d.text((x, y), text, font=f, fill=fill)
        return
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + tracking


def centered(img, y, text, f, fill, tracking=0):
    draw_text(img, ((img.width - text_width(text, f, tracking)) / 2, y), text, f, fill, tracking)


def gradient_headline(img, y, text, f):
    """White fading to lilac top to bottom, like the site's h1."""
    w = int(text_width(text, f)) + 20
    asc, desc = f.getmetrics()
    h = asc + desc
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((10, 0), text, font=f, fill=255)
    fill = Image.new("RGB", (1, h))
    for yy in range(h):
        t = min(1, max(0, (yy / h - 0.35) / 0.8))
        fill.putpixel((0, yy), tuple(int(WHITE[i] + (LILAC[i] - WHITE[i]) * t) for i in range(3)))
    fill = fill.resize((w, h)).convert("RGBA")
    fill.putalpha(mask)
    img.alpha_composite(fill, (int((img.width - w) / 2), int(y)))


def perk_pill(img, y, text, f):
    """Gold hairline pill with a small gold diamond: the merch line, kept quiet."""
    pad_x, dia = int(f.size * 1.0), int(f.size * 0.42)
    tw = text_width(text, f)
    w = int(tw + pad_x * 2 + dia + f.size * 0.55)
    h = int(f.size * 2.05)
    x0 = (img.width - w) // 2
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x0, y, x0 + w, y + h), radius=h // 2, fill=GOLD + (22,), outline=GOLD + (170,), width=max(2, f.size // 18))
    cx, cy = x0 + pad_x + dia / 2, y + h / 2
    d.polygon([(cx, cy - dia / 2), (cx + dia / 2, cy), (cx, cy + dia / 2), (cx - dia / 2, cy)], fill=GOLD + (255,))
    asc, desc = f.getmetrics()
    d.text((x0 + pad_x + dia + f.size * 0.55, cy - (asc + desc) / 2 + f.size * 0.04), text, font=f, fill=GOLD + (255,))
    img.alpha_composite(layer)
    return y + h


def qr_card(img, x0, y0, card, qr):
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0 + 30, y0 + 50, x0 + card - 30, y0 + card + 30), radius=card // 14, fill=(20, 0, 60, 200))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(card // 22)))
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0, x0 + card, y0 + card), radius=card // 14, fill=WHITE + (255,))
    img.alpha_composite(layer)
    img.alpha_composite(qr_image(qr), (x0 + (card - qr) // 2, y0 + (card - qr) // 2))


def gem(img, cx, y, width):
    """The kleros.io icosahedron with a soft halo."""
    g = Image.open(os.path.join(HERE, "assets", "kleros-icosahedron.png")).convert("RGBA")
    h = int(g.height * width / g.width)
    g = g.resize((width, h), Image.LANCZOS)
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    r = width * 0.62
    ImageDraw.Draw(halo).ellipse((cx - r, y + h / 2 - r, cx + r, y + h / 2 + r), fill=(150, 120, 255, 70))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(width // 4)))
    img.alpha_composite(g, (int(cx - width / 2), int(y)))
    return y + h


def poster():
    W, H = 1800, 2400
    img = background(W, H)
    y = gem(img, W / 2, 150, 300)
    gradient_headline(img, y + 60, HEADLINE, urbanist(148))
    y = perk_pill(img, y + 290, PERK, urbanist(50, "SemiBold"))
    card, qr = 1180, 940
    qr_card(img, (W - card) // 2, y + 90, card, qr)
    y += 90 + card
    centered(img, y + 80, DOMAIN, mono(70), WHITE, tracking=4)
    centered(img, y + 190, CAPTION, urbanist(42, "Medium"), MUTED)
    return img.convert("RGB")


def square():
    W = H = 1500
    img = background(W, H)
    gradient_headline(img, 95, HEADLINE, urbanist(112))
    y = perk_pill(img, 265, PERK, urbanist(40, "SemiBold"))
    card, qr = 900, 720
    qr_card(img, (W - card) // 2, y + 60, card, qr)
    centered(img, y + 60 + card + 58, DOMAIN, mono(56), WHITE, tracking=3)
    return img.convert("RGB")


# Merch tiers on the booth display, matching site/config.js. Photos (600px crops of the supplier
# mock-ups) are in qr/assets/merch.
TIERS = [("Teal", TEAL, ["flipflops"], "Flip-flops", "Check in"),
         ("Purple", PURPLE, ["bottle", "gamcha"], "Copper bottle or gamcha", "+ Telegram, X, LinkedIn"),
         ("Gold", GOLD, ["kurta"], "Kleros kurta", "+ Kleros 101 quiz")]


def photo_tile(img, x, y, size, name, ring):
    """Rounded merch photo with a coloured ring, like the thumbnails on the site."""
    p = Image.open(os.path.join(HERE, "assets", "merch", name + ".jpg")).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.28), fill=255)
    p.putalpha(mask)
    rw = max(4, size // 28)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((x - rw, y - rw, x + size + rw, y + size + rw), radius=int(size * 0.28) + rw, fill=ring + (255,))
    img.alpha_composite(layer)
    img.alpha_composite(p, (int(x), int(y)))


def display():
    W, H = 2480, 3508
    img = background(W, H)
    y = gem(img, W / 2, 130, 260)
    gradient_headline(img, y + 40, "Check in & grab", urbanist(200))
    centered(img, y + 290, "limited-edition merch", urbanist(150), GOLD)
    centered(img, y + 500, "More steps, better merch", urbanist(64, "SemiBold"), MUTED)

    # Three tier columns: photos, tier name, reward, what it takes.
    top, col, tile = y + 640, W // 3, 300
    for i, (name, colour, photos, reward, how) in enumerate(TIERS):
        cx = col * i + col / 2
        n = len(photos)
        step = int(tile * 0.72)
        x0 = cx - (tile + step * (n - 1)) / 2
        for k, ph in enumerate(photos):
            photo_tile(img, x0 + k * step, top, tile, ph, colour)
        ty = top + tile + 50
        draw_text(img, (cx - text_width(name.upper(), urbanist(54, "Bold"), 8) / 2, ty), name.upper(), urbanist(54, "Bold"), colour, tracking=8)
        f = urbanist(52, "Bold")
        draw_text(img, (cx - text_width(reward, f) / 2, ty + 80), reward, f, WHITE)
        draw_text(img, (cx - text_width(how, urbanist(44, "Medium")) / 2, ty + 155), how, urbanist(44, "Medium"), MUTED)

    y = perk_pill(img, top + tile + 340, "Free stickers & tattoos for everyone", urbanist(54, "SemiBold"))
    card, qr = 1320, 1060
    qr_card(img, (W - card) // 2, y + 90, card, qr)
    y += 90 + card
    centered(img, y + 70, DOMAIN, mono(96), WHITE, tracking=5)
    centered(img, y + 205, CAPTION, urbanist(56, "Medium"), MUTED)
    return img.convert("RGB")


def plain():
    img = Image.new("RGBA", (2000, 2000), WHITE + (255,))
    img.alpha_composite(qr_image(1700), (150, 150))   # 150px white margin as quiet zone
    write_svg(os.path.join(HERE, "devcon-kleros-qr-plain.svg"))
    return img.convert("RGB")


def write_svg(path):
    """Vector twin of qr_image: same modules, eyes, gradient and centre mark."""
    n, eyes, dots, (c0, c) = layout(matrix())
    q = 4                                         # quiet zone in modules
    V = n + 2 * q
    g = 0.09
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {V} {V}" width="{V * 40}" height="{V * 40}">',
             '<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">'
             f'<stop offset="0" stop-color="#{"%02x%02x%02x" % INK_A}"/><stop offset="1" stop-color="#{"%02x%02x%02x" % INK_B}"/></linearGradient>'
             '<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">'
             f'<stop offset="0" stop-color="#{"%02x%02x%02x" % KLEROS}"/><stop offset="1" stop-color="#{"%02x%02x%02x" % KLEROS_DEEP}"/></linearGradient></defs>',
             f'<rect width="{V}" height="{V}" fill="#fff"/>',
             f'<g fill="url(#ink)" transform="translate({q} {q})">']
    for x, y in dots:
        parts.append(f'<rect x="{x + g:.2f}" y="{y + g:.2f}" width="{1 - 2 * g:.2f}" height="{1 - 2 * g:.2f}" rx=".3"/>')
    for ex, ey in eyes:
        parts.append(f'<path fill-rule="evenodd" d="{rrect(ex, ey, 7, EYE_R[0])} {rrect(ex + 1, ey + 1, 5, EYE_R[1])}"/>')
        parts.append(f'<rect x="{ex + 2}" y="{ey + 2}" width="3" height="3" rx="{EYE_R[2]}"/>')
    parts.append('</g>')
    m = c - 1.2
    mx = q + (n - m) / 2
    parts.append(f'<rect x="{mx:.3f}" y="{mx:.3f}" width="{m:.3f}" height="{m:.3f}" rx="{m * 0.26:.3f}" fill="url(#tile)"/>')
    svg = open(os.path.join(ASSETS, "kleros-symbol-white-flat.svg"), encoding="utf-8").read()
    tx, ty = re.search(r'translate\(([\d.]+),\s*([\d.]+)\)', svg).groups()
    d = re.search(r'<path d="([^"]+)"', svg).group(1)
    s = m * 0.62
    k = s / 1445
    o = mx + (m - s) / 2
    parts.append(f'<path fill="#fff" fill-rule="evenodd" transform="translate({o:.3f} {o:.3f}) scale({k:.6f}) translate({tx} {ty})" d="{d}"/>')
    parts.append('</svg>')
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(parts))


def rrect(x, y, s, r):
    return (f"M{x + r} {y}H{x + s - r}A{r} {r} 0 0 1 {x + s} {y + r}V{y + s - r}A{r} {r} 0 0 1 {x + s - r} {y + s}"
            f"H{x + r}A{r} {r} 0 0 1 {x} {y + s - r}V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z")


def self_check(paths):
    """Decode each file at phone-ish sizes with OpenCV and ZXing (the engine in many phone
    scanners), the ZXing pass slightly blurred like a camera frame. Fails loudly on a miss."""
    try:
        import cv2
    except ImportError:
        print("opencv not installed; skipped scan check")
        return
    try:
        import zxingcpp
    except ImportError:
        zxingcpp = None
        print("zxing-cpp not installed; checking with OpenCV only")
    det = cv2.QRCodeDetector()
    for p in paths:
        im = cv2.imread(p)
        cv_hits = zx_hits = 0
        scales = (0.6, 0.4, 0.25, 0.15)
        for scale in scales:
            small = cv2.resize(im, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            try:
                cv_hits += det.detectAndDecode(small)[0] == URL
            except cv2.error:
                pass
            if zxingcpp:
                found = zxingcpp.read_barcodes(cv2.GaussianBlur(small, (0, 0), 1.0))
                zx_hits += bool(found) and found[0].text == URL
        # OpenCV is the pickier decoder and can miss one odd size; ZXing must read every size.
        ok = cv_hits >= len(scales) - 1 and (not zxingcpp or zx_hits == len(scales))
        print(("scans OK  " if ok else "NO SCAN   ") + f"{os.path.basename(p)}  "
              f"(OpenCV {cv_hits}/{len(scales)}" + (f", ZXing {zx_hits}/{len(scales)})" if zxingcpp else ")"))
        if not ok:
            sys.exit(1)


if __name__ == "__main__":
    out = []
    for name, fn in (("display", display), ("poster", poster), ("square", square), ("plain", plain)):
        p = os.path.join(HERE, f"devcon-kleros-qr-{name}.png")
        im = fn()
        im.save(p, dpi=(300, 300))
        if name == "display":
            im.save(p[:-4] + ".pdf", resolution=300)   # A4 print file
        out.append(p)
    print("encoded:", URL)
    self_check(out)
