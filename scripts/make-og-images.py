"""Share images (Open Graph / WhatsApp / X previews), 1200x630, one per page -> public/og/<name>.png

Run when a page title changes:  python3 scripts/make-og-images.py
Needs Pillow with raqm (Tamil shaping) and the fonts below (macOS paths; pass --en/--ta to use others).
The PNGs are committed, so the site build does not need this script.
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFont, features

W, H = 1200, 630
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "og")

# name -> (title, English line, Tamil line)
PAGES = {
    "home": ("Lifelike AI voices", "Text to speech, speech to text and voice cloning in Tamil and English", "தமிழிலும் English-லும் AI குரல்கள்"),
    "text-to-speech": ("Text to Speech", "Natural Tamil and English voices. Free MP3 download.", "எழுத்தை இயல்பான குரலாக மாற்றுங்கள்"),
    "tamil-text-to-speech": ("Tamil Text to Speech", "Natural Tamil voices that read prices, dates and times right", "இயல்பான தமிழ் குரல்கள்"),
    "speech-to-text": ("Speech to Text", "Voice typing and transcription in Tamil, English and Indian languages", "பேசுங்க, எழுத்தா மாறிடும்"),
    "audio-to-text": ("Audio to Text", "Transcribe WhatsApp voice notes, calls and recordings", "Voice note-ஐ எழுத்தாக மாற்றுங்கள்"),
    "tamil-speech-to-text": ("Tamil Speech to Text", "Tamil voice typing, Tanglish and subtitles", "தமிழ் voice typing"),
    "voice-cloning": ("Voice Cloning", "Speak any text in your own voice. Your own voice only.", "உங்கள் சொந்த குரலில் பேசுங்கள்"),
    "voice-changer": ("Voice Changer", "Same words, a new voice", "அதே வார்த்தைகள், புதிய குரல்"),
    "audio-cleanup": ("Audio Cleanup", "Remove background noise, right in your browser", "பின்னணி சத்தத்தை நீக்குங்கள்"),
    "default": ("SANSA AI", "AI voice tools for Tamil and English", "தமிழுக்கான AI குரல் கருவிகள்"),
}


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index, layout_engine=ImageFont.Layout.RAQM)


def wrap(draw, text, f, width):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur] if cur else lines


def make(name, title, en, ta, a):
    img = Image.new("RGB", (W, H), "#0B1020")
    d = ImageDraw.Draw(img)
    # brand gradient bar (same colours as the site: #FF6B00 -> #FF3D00 -> #7C3AED -> #2563EB)
    stops = [(0, (255, 107, 0)), (0.33, (255, 61, 0)), (0.66, (124, 58, 237)), (1, (37, 99, 235))]
    for x in range(W):
        p = x / (W - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= p <= p1:
                k = (p - p0) / (p1 - p0)
                d.line([(x, 0), (x, 12)], fill=tuple(round(c0[i] + (c1[i] - c0[i]) * k) for i in range(3)))
                break
    icon = Image.open(os.path.join(ROOT, "public", "brand", "sansa-icon-512.png")).convert("RGBA").resize((88, 88))
    img.paste(icon, (72, 64), icon)
    d.text((176, 80), "SANSA AI", font=font(a.en_bold, 44), fill="#FFFFFF")
    y = 210
    ft = font(a.en_bold, 84 if len(title) <= 18 else 70)
    for line in wrap(d, title, ft, W - 144):
        d.text((72, y), line, font=ft, fill="#FFFFFF")
        y += ft.size + 10
    y += 14
    fe = font(a.en, 36)
    for line in wrap(d, en, fe, W - 144)[:2]:
        d.text((72, y), line, font=fe, fill="#CBD5E1")
        y += 48
    d.text((72, H - 112), ta, font=font(a.ta, 38, a.ta_index), fill="#FFB27A")
    d.text((72, H - 58), "sansaai.in", font=font(a.en_bold, 30), fill="#94A3B8")
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, name + ".png"), optimize=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--en", default="/System/Library/Fonts/Supplemental/Arial.ttf")
    ap.add_argument("--en-bold", dest="en_bold", default="/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    ap.add_argument("--ta", default="/System/Library/Fonts/Supplemental/Tamil Sangam MN.ttc")
    ap.add_argument("--ta-index", dest="ta_index", type=int, default=0)
    a = ap.parse_args()
    if not features.check("raqm"):
        raise SystemExit("Pillow without raqm: Tamil letters would be drawn wrong. Install libraqm.")
    for n, (t, e, ta) in PAGES.items():
        make(n, t, e, ta, a)
        print("og/" + n + ".png")
