from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROOF_DIR = ROOT / "data" / "proof"
PROOF_DIR.mkdir(parents=True, exist_ok=True)
OUT_PATH = PROOF_DIR / "rcpt_payment_verified_fullscreen.png"
RECEIPT_SRC = PROOF_DIR / "rcpt_receipt_bisi.png"

# Canvas 1080 x 1920 (9:16 vertical mobile screen)
canvas = Image.new("RGBA", (1080, 1920), (15, 23, 42, 255)) # Dark slate background #0f172a
draw = ImageDraw.Draw(canvas)

# Let's load font or default
try:
    font_lg = ImageFont.truetype("arialbd.ttf", 52)
    font_md = ImageFont.truetype("arialbd.ttf", 36)
    font_sm = ImageFont.truetype("arial.ttf", 28)
    font_bold = ImageFont.truetype("arialbd.ttf", 32)
except:
    font_lg = font_md = font_sm = font_bold = ImageFont.load_default()

# Header status bar: 09:41, wifi, battery
draw.text((80, 50), "09:41", fill=(241, 245, 249), font=font_sm)
draw.text((920, 50), "5G 100%", fill=(241, 245, 249), font=font_sm)

# Green success banner
draw.rounded_rectangle([60, 140, 1020, 310], radius=28, fill=(22, 101, 52, 255)) # dark green
draw.rounded_rectangle([70, 150, 1010, 300], radius=24, fill=(34, 197, 94, 255)) # vivid emerald green
# Success check icon + text
draw.ellipse([110, 185, 200, 275], fill=(255, 255, 255, 255))
draw.polygon([(135, 228), (150, 245), (175, 210)], fill=(22, 101, 52, 255))

draw.text((225, 185), "PAYMENT VERIFIED", fill=(255, 255, 255), font=font_bold)
draw.text((225, 232), "₦45,000 received via Bank Transfer", fill=(240, 253, 244), font=font_sm)

# Subtitle
draw.text((60, 345), "Digital Receipt Generated (0.8s)", fill=(148, 163, 184), font=font_md)

# Embed receipt image in the middle
if RECEIPT_SRC.exists():
    rcpt_img = Image.open(RECEIPT_SRC).convert("RGBA")
    # Resize receipt to fit comfortably: width ~760px, maintaining aspect ratio
    w, h = rcpt_img.size
    new_w = 780
    new_h = int(h * (new_w / w))
    if new_h > 1100:
        new_h = 1100
        new_w = int(w * (new_h / h))
    rcpt_resized = rcpt_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # White background card with slight rounded shadow
    rx = (1080 - new_w) // 2
    ry = 420
    draw.rounded_rectangle([rx - 10, ry - 10, rx + new_w + 10, ry + new_h + 10], radius=20, fill=(255, 255, 255, 40))
    canvas.paste(rcpt_resized, (rx, ry), rcpt_resized)

# Bottom CTA Buttons: "Share Receipt on WhatsApp"
draw.rounded_rectangle([60, 1680, 1020, 1810], radius=32, fill=(37, 211, 102, 255)) # WhatsApp green
draw.text((280, 1720), "Share Receipt on WhatsApp", fill=(255, 255, 255), font=font_lg)

# Bottom indicator bar
draw.rounded_rectangle([420, 1880, 660, 1892], radius=6, fill=(148, 163, 184, 180))

canvas.save(OUT_PATH)
print(f"Generated clean fullscreen proof screenshot: {OUT_PATH} (size: {canvas.size})")
