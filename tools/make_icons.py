# アプリのアイコンを作る（ノート＋チェック）
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
S = 1024
C1, C2 = (51, 85, 232), (91, 63, 224)

def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(C1[i] + (C2[i] - C1[i]) * t) for i in range(3))
    return img

def draw_icon(scale=1.0, rounded=True):
    base = gradient(S).convert('RGBA')
    if rounded:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
        bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        bg.paste(base, (0, 0), mask)
        base = bg
    d = ImageDraw.Draw(base)
    cx, cy = S / 2, S / 2
    w, h = S * 0.50 * scale, S * 0.60 * scale
    x0, y0 = cx - w / 2, cy - h / 2
    # 影
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0 + 10, y0 + 22, x0 + w + 10, y0 + h + 22], radius=int(S * 0.06 * scale), fill=(20, 20, 60, 70))
    from PIL import ImageFilter
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    base = Image.alpha_composite(base, sh)
    d = ImageDraw.Draw(base)
    # ノート
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=int(S * 0.06 * scale), fill=(255, 255, 255, 255))
    # とじ部分
    d.rounded_rectangle([x0, y0, x0 + w * 0.16, y0 + h], radius=int(S * 0.06 * scale), fill=(226, 232, 255, 255))
    d.rectangle([x0 + w * 0.10, y0, x0 + w * 0.16, y0 + h], fill=(226, 232, 255, 255))
    for i in range(4):
        yy = y0 + h * (0.2 + i * 0.2)
        r = S * 0.018 * scale
        d.ellipse([x0 + w * 0.08 - r, yy - r, x0 + w * 0.08 + r, yy + r], fill=(160, 172, 235, 255))
    # 線
    for i in range(3):
        yy = y0 + h * (0.24 + i * 0.13)
        d.rounded_rectangle([x0 + w * 0.28, yy, x0 + w * (0.86 if i < 2 else 0.62), yy + S * 0.022 * scale], radius=8, fill=(226, 232, 245, 255))
    # チェック
    pts = [(x0 + w * 0.33, y0 + h * 0.70), (x0 + w * 0.50, y0 + h * 0.84), (x0 + w * 0.86, y0 + h * 0.56)]
    lw = int(S * 0.062 * scale)
    d.line(pts, fill=(18, 160, 106, 255), width=lw, joint='curve')
    for p in (pts[0], pts[2]):
        d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=(18, 160, 106, 255))
    return base

icon = draw_icon(1.0, True)
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'))
icon.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'icon-192.png'))
full = draw_icon(0.82, False).convert('RGB')
full.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'maskable-512.png'))
draw_icon(0.9, False).convert('RGB').resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, 'apple-touch-icon.png'))
print('ok')
