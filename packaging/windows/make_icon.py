from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path("packaging/windows/assets")
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle((48, 48, SIZE - 48, SIZE - 48), radius=220, fill=255)

# Diagonal purple gradient.
grad = Image.new("RGB", (SIZE, SIZE))
pix = grad.load()
for y in range(SIZE):
    for x in range(SIZE):
        t = (x + y) / (2 * SIZE)
        # 139,122,255 -> 92,74,212
        pix[x, y] = (
            int(139 + (92 - 139) * t),
            int(122 + (74 - 122) * t),
            int(255 + (212 - 255) * t),
        )
img.paste(grad, (0, 0), mask)

# Soft top-left highlight.
glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow)
gdraw.ellipse((-260, -300, 620, 420), fill=(255, 255, 255, 42))
img = Image.alpha_composite(img, Image.composite(glow, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask))

draw = ImageDraw.Draw(img)
points = [(210, 590), (405, 390), (560, 535), (830, 270)]
width = 92
for a, b in zip(points, points[1:]):
    draw.line([a, b], fill=(255, 255, 255, 255), width=width)
for p in points:
    draw.ellipse((p[0] - width // 2, p[1] - width // 2, p[0] + width // 2, p[1] + width // 2), fill=(255, 255, 255, 255))
draw.line([(220, 786), (804, 786)], fill=(255, 255, 255, 170), width=66)
for p in [(220, 786), (804, 786)]:
    draw.ellipse((p[0] - 33, p[1] - 33, p[0] + 33, p[1] + 33), fill=(255, 255, 255, 170))

small_icon = img.resize((256, 256), Image.LANCZOS)
small_icon.save(OUT / "clickup.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# MUI header image (150x57), right side of the installer pages.
header = Image.new("RGB", (150, 57), (32, 29, 49))
hp = header.load()
for y in range(57):
    for x in range(150):
        t = (x + y) / 207
        hp[x, y] = (int(42 - 16 * t), int(36 - 15 * t), int(72 - 22 * t))
hdraw = ImageDraw.Draw(header)
logo = small_icon.resize((38, 38), Image.LANCZOS)
header.paste(logo, (10, 9), logo)
font_path = None
for candidate in ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]:
    if Path(candidate).exists():
        font_path = candidate
        break
font = ImageFont.truetype(font_path, 15) if font_path else ImageFont.load_default()
hdraw.text((56, 14), "ClickUp", font=font, fill=(255, 255, 255))
font2 = ImageFont.truetype(font_path, 9) if font_path else ImageFont.load_default()
hdraw.text((57, 33), "LOCAL WORKSPACE", font=font2, fill=(197, 187, 255))
header.save(OUT / "header.bmp")

# App icon PNG for docs/build checks.
small_icon.resize((128, 128), Image.LANCZOS).save(OUT / "clickup-128.png")
print("icon written", (OUT / "clickup.ico").stat().st_size, (OUT / "header.bmp").stat().st_size)
