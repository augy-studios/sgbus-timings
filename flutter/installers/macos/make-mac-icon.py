#!/usr/bin/env python3
"""Makes the macOS app icon of SG Bus Timings: the mint UwU bus on Apple's rounded-square tile.

Why the Mac has an icon of its own: since Big Sur, macOS expects every app icon to be a rounded
square of a set size, with a soft shadow, on a see-through 1024 x 1024 canvas. The icon the other
systems use (main-site/sgbusicon1.png, the same picture as the Electron app's build/icon.png)
fills the whole square, so recent macOS shrinks it and puts it inside a grey rounded square of
its own. Windows (windows/runner/resources/app_icon.ico) and Linux (installers/linux/icons/) keep
the full square, which is right on those systems.

What it writes (paths from the flutter folder):

  installers/macos/icon-mac-1024.png      the master, kept so the result is easy to look at
  macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_<size>.png
                                          every size Contents.json there asks for (16 to 1024),
                                          which Xcode turns into the app's icon when it builds

To make it again, for example from new artwork, run from the flutter folder:

  python3 -m pip install --user pillow    once, if Python says "No module named 'PIL'"
  python3 installers/macos/make-mac-icon.py
  python3 installers/macos/make-mac-icon.py path/to/new-art.png --scale 1.1

The artwork is a square picture with the mark in the middle on one flat background colour (its
top-left pixel is taken as that colour), like main-site/sgbusicon1.png. The mark is centred on the
tile. --scale sets how big the artwork is drawn on the tile: 1.0 fits the whole picture to the
tile, so the mark keeps the same margins as on the other systems; bigger numbers zoom in on the
mark. Then open the master to check it, and run `flutter build macos` to see it in the Dock.
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

FLUTTER_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = FLUTTER_DIR.parent
DEFAULT_ARTWORK = REPO_DIR / 'main-site' / 'sgbusicon1.png'
MASTER = FLUTTER_DIR / 'installers' / 'macos' / 'icon-mac-1024.png'
ICON_SET = FLUTTER_DIR / 'macos' / 'Runner' / 'Assets.xcassets' / 'AppIcon.appiconset'

# How big the artwork is on the tile (see --scale). At 1.12 the bus is about three quarters of
# the tile's width, about as big as the marks on other Mac apps' icons.
DEFAULT_SCALE = 1.12

# Apple's macOS icon grid: a 824 x 824 tile in the middle of the 1024 x 1024 canvas, 100 px in
# from each side, with corners of radius 185.4. These match the icons of other Mac apps.
CANVAS = 1024
TILE = 824
TILE_INSET = (CANVAS - TILE) // 2
CORNER_RADIUS = 185.4

# The tile's shadow, measured from other Mac apps' icons: black at 30%, 10 px down, blurred so it
# fades out about 30 px below the tile (well inside the canvas, so nothing gets cut off).
SHADOW_OPACITY = 0.30
SHADOW_DROP = 10
SHADOW_BLUR = 9

# The shape is drawn this many times bigger, then shrunk, which gives it smooth edges.
SUPERSAMPLE = 8

# Apple's "continuous" corner, read from SwiftUI's RoundedRectangle(style: .continuous), the shape
# macOS uses for app icons. Unlike a quarter circle it eases in from the straight edge, which is
# why Mac icons look soft rather than stamped out. Each point is (distance back along the edge we
# came in on, distance along the edge we leave on), in corner radii, from the sharp corner. The
# corner starts 1.53 radii before the sharp corner and is three Bezier curves, each given as
# (first control point, second control point, end point).
CORNER_START = (1.52866495, 0.0)
CORNER_CURVES = [
    ((1.08849001, 0.0), (0.86840701, 0.0), (0.63149399, 0.07491140)),
    ((0.37282401, 0.16906001), (0.16906001, 0.37282401), (0.07491140, 0.63149399)),
    ((0.0, 0.86840701), (0.0, 1.08849001), (0.0, 1.52866495)),
]
CURVE_STEPS = 48


def main():
    """Reads the options, makes the master icon and writes it with every size Xcode needs."""
    parser = argparse.ArgumentParser(description='Makes the macOS app icon (see the top of this file).')
    parser.add_argument('artwork', nargs='?', type=Path, default=DEFAULT_ARTWORK,
                        help='square artwork on a flat background (default: main-site/sgbusicon1.png)')
    parser.add_argument('--scale', type=float, default=DEFAULT_SCALE,
                        help=f'how big the artwork is on the tile, 1.0 = fitted (default: {DEFAULT_SCALE})')
    args = parser.parse_args()

    artwork = Image.open(args.artwork).convert('RGBA')
    master = make_icon(artwork, args.scale)
    master.save(MASTER, optimize=True)
    print(f'Wrote {MASTER.relative_to(FLUTTER_DIR)}')
    for filename, pixels in icon_set_sizes().items():
        shrink(master, pixels).save(ICON_SET / filename, optimize=True)
        print(f'Wrote {(ICON_SET / filename).relative_to(FLUTTER_DIR)} ({pixels} x {pixels})')


def make_icon(artwork, scale):
    """Returns the 1024 x 1024 icon: [artwork] on the rounded tile, with the shadow under it."""
    shape = tile_shape()

    # The tile: the artwork's background colour, with the artwork on it so the mark sits in the
    # middle, cut to the shape.
    background = artwork.getpixel((0, 0))
    tile = Image.new('RGBA', (CANVAS, CANVAS), background)
    size = round(TILE * scale)
    art = artwork.resize((size, size), Image.Resampling.LANCZOS)
    off_x, off_y = mark_offset(artwork, background)
    zoom = size / artwork.width
    corner = (CANVAS - size) // 2
    tile.paste(art, (corner - round(off_x * zoom), corner - round(off_y * zoom)), art)
    tile.putalpha(shape)

    # The shadow: the same shape in see-through black, moved down and blurred.
    shadow = Image.new('L', (CANVAS, CANVAS), 0)
    shadow.paste(shape.point(lambda alpha: round(alpha * SHADOW_OPACITY)), (0, SHADOW_DROP))
    shadow = shadow.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))

    icon = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    icon.putalpha(shadow)
    icon.alpha_composite(tile)
    return icon


def mark_offset(artwork, background):
    """Returns how far (x, y) the middle of the mark is from the middle of [artwork], in pixels.

    The mark is everything that isn't the [background] colour. The bus in main-site/sgbusicon1.png
    sits a little low (17 px of 2475), which shows once it's zoomed in on the tile.
    """
    plain = Image.new('RGBA', artwork.size, background)
    # Small differences (8 of 255) are the edge smoothing of the background, not the mark.
    marked = ImageChops.difference(artwork, plain).convert('L').point(lambda v: 255 if v > 8 else 0)
    box = marked.getbbox()
    if box is None:
        return 0, 0
    left, top, right, bottom = box
    return (left + right) / 2 - artwork.width / 2, (top + bottom) / 2 - artwork.height / 2


def tile_shape():
    """Returns the tile's shape as a 1024 x 1024 mask: white inside, black outside, smooth edges."""
    big = Image.new('L', (CANVAS * SUPERSAMPLE, CANVAS * SUPERSAMPLE), 0)
    outline = [(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in tile_outline()]
    ImageDraw.Draw(big).polygon(outline, fill=255)
    return big.resize((CANVAS, CANVAS), Image.Resampling.BOX)


def tile_outline():
    """Returns the tile's outline as a list of points, clockwise from the top-right corner.

    Each corner is Apple's continuous corner (CORNER_CURVES), turned to face the right way; the
    straight edges are the gaps between one corner's last point and the next corner's first.
    """
    near, far = TILE_INSET, TILE_INSET + TILE
    # Each corner: where it is, the way we travel along the edge coming in, and along the edge
    # going out (x to the right, y down).
    corners = [
        ((far, near), (1, 0), (0, 1)),    # top right
        ((far, far), (0, 1), (-1, 0)),    # bottom right
        ((near, far), (-1, 0), (0, -1)),  # bottom left
        ((near, near), (0, -1), (1, 0)),  # top left
    ]
    points = []
    for (cx, cy), (in_x, in_y), (out_x, out_y) in corners:

        def place(point):
            """Turns a corner-table point into canvas pixels for this corner."""
            back, on = point
            return (cx - back * CORNER_RADIUS * in_x + on * CORNER_RADIUS * out_x,
                    cy - back * CORNER_RADIUS * in_y + on * CORNER_RADIUS * out_y)

        start = place(CORNER_START)
        points.append(start)
        for control1, control2, end in CORNER_CURVES:
            curve = [start, place(control1), place(control2), place(end)]
            points.extend(bezier_points(curve))
            start = curve[3]
    return points


def bezier_points(curve):
    """Returns CURVE_STEPS points along a cubic Bezier curve (start, 2 controls, end), end included."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = curve
    points = []
    for step in range(1, CURVE_STEPS + 1):
        t = step / CURVE_STEPS
        u = 1 - t
        points.append((u**3 * x0 + 3 * u**2 * t * x1 + 3 * u * t**2 * x2 + t**3 * x3,
                       u**3 * y0 + 3 * u**2 * t * y1 + 3 * u * t**2 * y2 + t**3 * y3))
    return points


def icon_set_sizes():
    """Returns {file name: width in pixels} for every picture the icon set's Contents.json names.

    Contents.json lists each icon size at 1x and 2x (a 16 x 16 icon at 2x is 32 pixels); several
    entries share one file, so each file is listed once.
    """
    contents = json.loads((ICON_SET / 'Contents.json').read_text())
    sizes = {}
    for image in contents['images']:
        points = float(image['size'].split('x')[0])
        pixels = round(points * float(image['scale'].rstrip('x')))
        if sizes.setdefault(image['filename'], pixels) != pixels:
            raise SystemExit(f"Contents.json asks for {image['filename']} at two different sizes.")
    return sizes


def shrink(icon, pixels):
    """Returns [icon] scaled down to [pixels] x [pixels].

    Each small pixel is the plain average of the big pixels it covers (BOX). Sharper filters
    (LANCZOS) leave faint rings round the tile's edge, and at 16 px macOS then no longer sees the
    Mac icon shape and puts the icon in a grey square. The average is taken with premultiplied
    alpha ('RGBa'), so the see-through pixels round the tile don't bleed a dark fringe into it.
    """
    if pixels == icon.width:
        return icon
    return icon.convert('RGBa').resize((pixels, pixels), Image.Resampling.BOX).convert('RGBA')


if __name__ == '__main__':
    main()
