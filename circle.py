import sys
import urllib.request
from PIL import Image, ImageDraw

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else src

if src.startswith("http://") or src.startswith("https://"):
    urllib.request.urlretrieve(src, out)
    src = out

img = Image.open(src).convert("RGBA")
size = min(img.size)
img = img.resize((size, size), Image.LANCZOS)
mask = Image.new("L", (size, size), 0)
ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
img.putalpha(mask)
img.save(out)
print(f"Saved to {out}")
