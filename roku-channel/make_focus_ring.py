"""Generate the PosterGrid focus indicator as a Roku 9-patch PNG.

Geometry is taken from the web UI card in
C:\\Users\\vtf62\\code\\safe-yt-viewer\\src\\app\\Video.tsx:

    borderRadius: "20px"   line 34   -> outer radius
    border: "5px solid"    line 36   -> stroke thickness

so outer radius 20 and thickness 5, which puts the inner radius at 15 --
exactly the poster's own `borderRadius: "15px"` on line 46. The web card's
outer and inner corners are therefore tangent (20 == 5 + 15), and this ring
reproduces that same relationship.

The ring is drawn in pure white so `focusBitmapBlendColor` can tint it; the
blend multiplies, so white x any color == that color.
"""

from PIL import Image, ImageDraw

RADIUS = 20  # Video.tsx:34
THICKNESS = 5  # Video.tsx:36

# A rounded corner with radius R and stroke T stays curved for R + T pixels
# from the edge. That block cannot be stretched, so it is the 9-patch corner.
CORNER = RADIUS + THICKNESS  # 25
STRETCH = 30  # stretchable middle, generously wider than it needs to be
CONTENT = 2 * CORNER + STRETCH  # 80
PAD = 1  # the 1px guide border a 9-patch is required to carry
SIZE = CONTENT + 2 * PAD  # 82
SS = 4  # supersampling factor, for smooth corners

# PIL draws a rounded_rectangle outline INSIDE the given bbox, not centred on
# the path, so the bbox is the OUTER edge and the stroke runs inward from it.
# That makes the outer radius RADIUS and the inner radius RADIUS - THICKNESS,
# i.e. 20 and 15. Insetting the bbox by half the thickness instead would push
# the whole ring in by 2.5px and leave the outer edge floating off the corner.
big = Image.new("RGBA", (CONTENT * SS, CONTENT * SS), (255, 255, 255, 0))
d = ImageDraw.Draw(big)
d.rounded_rectangle(
    [0, 0, CONTENT * SS, CONTENT * SS],
    radius=RADIUS * SS,
    width=int(round(THICKNESS * SS)),
    outline=(255, 255, 255, 255),
)
ring = big.resize((CONTENT, CONTENT), Image.LANCZOS)

img = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
img.paste(ring, (PAD, PAD))

# ---- 9-patch guides -------------------------------------------------------
# Black marks the region. Top/left mark the stretchable band; bottom/right
# mark the outer content bounds, which is what "margins to fit around the
# item" means. The four corner guide pixels are left white to delimit.
p = ImageDraw.Draw(img)
t0, t1 = PAD + CORNER, PAD + CORNER + STRETCH - 1
c0, c1 = PAD, PAD + CONTENT - 1
BLACK = (0, 0, 0, 255)
for x in range(t0, t1 + 1):
    p.point((x, 0), fill=BLACK)
    p.point((x, SIZE - 1), fill=BLACK)
for y in range(t0, t1 + 1):
    p.point((0, y), fill=BLACK)
    p.point((SIZE - 1, y), fill=BLACK)
for y in range(c0, c1 + 1):
    p.point((SIZE - 1, y), fill=BLACK)
for x in range(c0, c1 + 1):
    p.point((x, SIZE - 1), fill=BLACK)

img.save(
    r"C:\Users\vtf62\code\safe-yt-viewer\roku-channel\images\focus-ring.png",
    "PNG",
)

# ---- report ---------------------------------------------------------------
print(f"size {SIZE}x{SIZE}, content {CONTENT}x{CONTENT}")
print(f"outer radius {RADIUS}, thickness {THICKNESS}, inner radius {RADIUS - THICKNESS}")
print(f"corner block {CORNER}px, stretch band x{t0}..x{t1} ({t1 - t0 + 1}px)")

# Verify the ring geometry: sample the horizontal centre line and the diagonal.
row = CONTENT // 2
line = [ring.getpixel((x, row))[3] for x in range(CONTENT)]
print(f"centre row opaque span: x={line.index(255)}..{len(line) - 1 - line[::-1].index(255)}")
print(f"centre row alpha profile: {line[:8]} ... {line[26:36]} ... {line[-8:]}")

# A point on the 45-degree arc of the outer edge. The corner arc is centred on
# (RADIUS, RADIUS), so a point ON the outer boundary sits at distance RADIUS
# from that centre, heading back toward the corner.
import math

cx = cy = float(RADIUS)
for deg in (0, 45, 90):
    a = math.radians(deg)
    px = int(round(cx - RADIUS * math.cos(a)))
    py = int(round(cy - RADIUS * math.sin(a)))
    # one pixel further in, which should now be solid ring
    qx = int(round(cx - (RADIUS - 1) * math.cos(a)))
    qy = int(round(cy - (RADIUS - 1) * math.sin(a)))
    print(
        f"  {deg:>3}deg  on outer arc ({px},{py}) alpha={ring.getpixel((px, py))[3]}"
        f"   1px in ({qx},{qy}) alpha={ring.getpixel((qx, qy))[3]}"
    )

# Same again for the inner boundary: distance RADIUS - THICKNESS from centre.
ix = int(round(cx - (RADIUS - THICKNESS) * math.cos(math.radians(45))))
iy = int(round(cy - (RADIUS - THICKNESS) * math.sin(math.radians(45))))
print(f"  45deg on inner arc ({ix},{iy}) alpha={ring.getpixel((ix, iy))[3]}")

print(f"centre transparent: alpha={ring.getpixel((row, row))[3]}")
print(f"corner (0,0) transparent: alpha={ring.getpixel((0, 0))[3]}")

