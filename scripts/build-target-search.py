#!/usr/bin/env python3
"""
Prepare a sidescan search + photomosaic inspection case study for the website's target viewer.

  python3 scripts/build-target-search.py <name> --sidescan SSS.tif --photomosaic ORTHO.tif --dem DEM.tif
  python3 scripts/build-target-search.py <name> --sidescan SSS.tif --photomosaic ORTHO.tif --targets-only
  python3 scripts/build-target-search.py <name> ... --only terrain,targets   # rebuild some parts

Inputs are GeoTIFFs in any CRS; they are warped into the sidescan's projected CRS so they line up.

Output (the site is public, so nothing written here carries a geographic location):
  public/surveys/<name>/sidescan/{z}/{x}/{y}.webp     tile pyramids in a local metre grid whose
  public/surveys/<name>/photomosaic/{z}/{x}/{y}.webp  origin is the sidescan's top-left corner;
  public/surveys/<name>/relief/{z}/{x}/{y}.webp       tile z holds 2^z pixels per metre (Leaflet CRS.Simple)
  public/surveys/<name>/terrain/                      3D view: heights (uint16), colour and normal maps
  public/surveys/<name>/targets/<id>.webp             close-ups for each entry in targets.json
  src/assets/surveys/<name>/site.json                 extents, zoom levels and which tiles exist

Coordinates and heights are relative (metres from the local origin, metres above the lowest point),
images are written from raw pixels so no georeferencing or EXIF metadata survives, and file names
don't carry the source names.

Targets are hand-edited in src/assets/surveys/<name>/targets.json:
  [{ "id": "main-wreckage", "label": "...", "description": "...", "x": 230.1, "y": -270.4, "size": 6 }]
x/y are local metres (the viewer's ?pick mode reports them on click), size is the close-up's width in
metres. Rerun with --targets-only after editing it to refresh the close-ups.
"""
import argparse
import base64
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from osgeo import gdal, osr
from PIL import Image

gdal.UseExceptions()
gdal.SetConfigOption('GDAL_NUM_THREADS', 'ALL_CPUS')

TILE = 256
ROOT = Path(__file__).resolve().parent.parent

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('name', help='output folder name, e.g. wreck-search')
parser.add_argument('--sidescan')
parser.add_argument('--photomosaic')
parser.add_argument('--dem')
parser.add_argument('--targets-only', action='store_true', help='only regenerate target close-ups')
parser.add_argument('--only', help='comma-separated parts to rebuild (sidescan,photomosaic,relief,terrain,targets), '
                    'keeping the rest of an existing site.json')
parser.add_argument('--sidescan-zoom', type=int, default=4, help='finest sidescan tile level (4 = 6.25 cm/px)')
parser.add_argument('--photo-zoom', type=int, default=8, help='finest photomosaic tile level (8 = 3.9 mm/px)')
parser.add_argument('--relief-zoom', type=int, default=6, help='finest relief tile level (6 = 1.6 cm/px)')
parser.add_argument('--quality', type=int, default=80, help='WebP quality')
args = parser.parse_args()

public_dir = ROOT / 'public' / 'surveys' / args.name
assets_dir = ROOT / 'src' / 'assets' / 'surveys' / args.name
site_path = assets_dir / 'site.json'


def log(*a):
    print(*a, flush=True)


# --- Local frame --------------------------------------------------------------------------------
# All output is in metres relative to an origin that is never written out: the sidescan's top-left
# corner in its projected CRS, rounded to whole metres. It's recomputed from the sidescan on each run.

def local_frame():
    if not args.sidescan:
        sys.exit('Need --sidescan (it defines the local origin), also with --targets-only.')
    ds = gdal.Open(args.sidescan)
    srs = osr.SpatialReference(wkt=ds.GetProjection())
    if not srs.IsProjected():
        sys.exit('The sidescan mosaic must be in a projected (metre) CRS.')
    gt = ds.GetGeoTransform()
    return srs.ExportToWkt(), math.floor(gt[0]), math.ceil(gt[3])


CRS, E0, N0 = local_frame()


def to_local_bounds(path):
    """Bounds of a raster in local metres: (xmin, ymin, xmax, ymax), y negative southwards."""
    vrt = gdal.Warp('', path, format='VRT', dstSRS=CRS)
    gt = vrt.GetGeoTransform()
    xmin, ymax = gt[0], gt[3]
    xmax, ymin = xmin + gt[1] * vrt.RasterXSize, ymax + gt[5] * vrt.RasterYSize
    return xmin - E0, ymin - N0, xmax - E0, ymax - N0


def warp(path, bounds, res, resample, band_list=None, dst_nodata=None):
    """Warp `path` to the local grid: `bounds` in local metres, square pixels of `res` metres."""
    xmin, ymin, xmax, ymax = bounds
    opts = dict(
        format='MEM', dstSRS=CRS, outputBounds=(xmin + E0, ymin + N0, xmax + E0, ymax + N0),
        xRes=res, yRes=res, resampleAlg=resample, multithread=True,
        warpOptions=['NUM_THREADS=ALL_CPUS'],
    )
    if dst_nodata is not None:
        opts['dstNodata'] = dst_nodata
    ds = gdal.Warp('', path, **opts)
    bands = band_list or range(1, ds.RasterCount + 1)
    return np.stack([ds.GetRasterBand(b).ReadAsArray() for b in bands], axis=-1)


# --- Tiles --------------------------------------------------------------------------------------

def tile_range(bounds, z):
    """Tile columns/rows covering local `bounds` at level z (row 0 starts at y = 0, going south)."""
    span = TILE / 2 ** z
    xmin, ymin, xmax, ymax = bounds
    return (math.floor(xmin / span), math.floor(-ymax / span), math.ceil(xmax / span) - 1, math.ceil(-ymin / span) - 1)


def encode_mask(mask):
    return base64.b64encode(np.packbits(mask.astype(np.uint8).ravel()).tobytes()).decode()


def save_webp(img, path, quality, lossless=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(img)
    if im.mode == 'RGBA' and img[..., 3].min() == 255:
        im = im.convert('RGB')
    im.save(path, 'WEBP', quality=quality, method=6, lossless=lossless, exact=False)


def build_pyramid(layer, render, bounds, zmin, zmax):
    """Render each level with render(bounds, res) -> RGBA uint8, cut it into tiles, skip empty ones."""
    out_dir = public_dir / layer
    shutil.rmtree(out_dir, ignore_errors=True)
    levels = {}
    total_bytes = 0
    for z in range(zmin, zmax + 1):
        span = TILE / 2 ** z
        x0, y0, x1, y1 = tile_range(bounds, z)
        grid = (x0 * span, -(y1 + 1) * span, (x1 + 1) * span, -y0 * span)
        img = render(grid, 1 / 2 ** z)
        cols, rows = x1 - x0 + 1, y1 - y0 + 1
        assert img.shape[:2] == (rows * TILE, cols * TILE), (img.shape, rows, cols)
        present = np.zeros((rows, cols), bool)
        for r in range(rows):
            for c in range(cols):
                t = img[r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE]
                if t[..., 3].max() < 8:
                    continue
                present[r, c] = True
                p = out_dir / str(z) / str(x0 + c) / f'{y0 + r}.webp'
                save_webp(np.ascontiguousarray(t), p, args.quality)
                total_bytes += p.stat().st_size
        levels[z] = {'x0': x0, 'y0': y0, 'cols': cols, 'rows': rows, 'mask': encode_mask(present)}
        log(f'  {layer} z{z}: {present.sum()} tiles ({cols}x{rows} grid)')
    log(f'  {layer}: {total_bytes / 1e6:.1f} MB')
    return {'bounds': [round(v, 3) for v in bounds], 'minZoom': zmin, 'maxZoom': zmax, 'levels': levels}


def rgba(path, stretch=None):
    def render(grid, res):
        img = warp(path, grid, res, 'cubic' if res < 0.01 else 'average')
        if img.shape[-1] == 3:
            img = np.concatenate([img, np.full(img.shape[:2] + (1,), 255, np.uint8)], -1)
        if stretch is not None:
            img[..., :3] = stretch(img[..., :3])
        img[img[..., 3] == 0, :3] = 0
        return img
    return render


def make_stretch(path):
    """Gentle per-channel levels from a coarse look at the image: lifts murky underwater colour."""
    sample = warp(path, to_local_bounds(path), 0.05, 'average')
    valid = sample[..., 3] > 250
    lo = np.array([np.percentile(sample[..., i][valid], 0.5) for i in range(3)])
    hi = np.array([np.percentile(sample[..., i][valid], 99.9) for i in range(3)])
    # A shared range keeps the hue honest; per-channel lows still remove the blue-grey veil.
    span = (hi - lo).max()
    lut = np.empty((3, 256), np.uint8)
    strength = 0.5  # 0 = untouched, 1 = full stretch (which bleaches the sand)
    x = np.arange(256)
    for i in range(3):
        v = np.clip((x - lo[i]) / span, 0, 1) * 255
        lut[i] = np.round(x + strength * (v - x)).clip(0, 255).astype(np.uint8)
    log(f'  photomosaic levels: lo={lo.round()} hi={hi.round()}')

    def apply(rgb):
        out = np.empty_like(rgb)
        for i in range(3):
            out[..., i] = lut[i][rgb[..., i]]
        return out
    return apply


def relief_render(dem_path):
    def render(grid, res):
        # Pad by a pixel so the hillshade has neighbours at the edges.
        pad = res
        g = (grid[0] - pad, grid[1] - pad, grid[2] + pad, grid[3] + pad)
        dem = warp(dem_path, g, res, 'average', dst_nodata=-32767)[..., 0].astype(np.float32)
        valid = dem > -32000
        mem = gdal.GetDriverByName('MEM').Create('', dem.shape[1], dem.shape[0], 1, gdal.GDT_Float32)
        mem.SetGeoTransform((0, res, 0, 0, 0, -res))
        b = mem.GetRasterBand(1)
        b.WriteArray(np.where(valid, dem, -32767))
        b.SetNoDataValue(-32767)
        hs = gdal.DEMProcessing('', mem, 'hillshade', format='MEM', zFactor=2, multiDirectional=True,
                                computeEdges=True).ReadAsArray().astype(np.float32)
        hs = hs[1:-1, 1:-1]
        valid = valid[1:-1, 1:-1]
        # Grey around 50% (no change under a soft-light blend), darker in shadow, lighter on lit faces.
        v = np.clip((hs - 181) * 1.1 + 128, 0, 255).astype(np.uint8)
        out = np.stack([v, v, v, np.where(valid & (hs > 0), 255, 0).astype(np.uint8)], -1)
        return out
    return render


def data_bounds(path, res=1.0):
    """Bounds of the pixels that hold data (alpha), in local metres."""
    b = to_local_bounds(path)
    a = warp(path, b, res, 'average')[..., 3]
    m = a > 64
    # Ignore rows/columns with only a few stray pixels (the sidescan has a speck in its corner).
    ys = np.nonzero(m.sum(1) >= 10)[0]
    xs = np.nonzero(m.sum(0) >= 10)[0]
    return [round(b[0] + xs.min() * res, 2), round(b[3] - (ys.max() + 1) * res, 2),
            round(b[0] + (xs.max() + 1) * res, 2), round(b[3] - ys.min() * res, 2)]


def footprint(path):
    """Convex outline of the photomosaic's coverage in local metres, for the search overview."""
    from scipy.spatial import ConvexHull
    b = to_local_bounds(path)
    res = 0.25
    a = warp(path, b, res, 'average')[..., 3]
    ys, xs = np.nonzero(a > 128)
    pts = np.stack([b[0] + (xs + 0.5) * res, b[3] - (ys + 0.5) * res], 1)
    hull = pts[ConvexHull(pts).vertices]
    return [[round(x, 2), round(y, 2)] for x, y in hull]


# --- 3D terrain ---------------------------------------------------------------------------------

def build_terrain(dem_path, photo_path, stretch, bounds):
    """Heights (uint16 mm above the lowest point), colour and normal maps over the photomosaic area."""
    out = public_dir / 'terrain'
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    xmin, ymin, xmax, ymax = bounds
    size = max(xmax - xmin, ymax - ymin)
    cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
    sq = (cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2)

    n = 1024  # height samples per side
    res = size / n
    dem = warp(dem_path, sq, res, 'average', dst_nodata=-32767)[..., 0].astype(np.float64)
    valid = dem > -32000
    floor = np.percentile(dem[valid], 0.5)
    top = dem[valid].max()
    # Fill gaps with the floor so the mesh has no cliffs; they're transparent in the colour map anyway.
    h = np.where(valid, np.clip(dem - floor, 0, None), 0)
    # A median filter removes spikes (fish, noise) that become needles in the mesh.
    from scipy.ndimage import median_filter
    h = median_filter(h, size=5)
    top = floor + h.max()
    heights = np.round(h * 1000).astype('<u2')  # millimetres
    (out / 'heights.bin').write_bytes(heights.tobytes())

    # Normal map at 2x the height resolution, from a finer DEM, for lighting detail between vertices.
    nn = 2048
    r2 = size / nn
    d2 = warp(dem_path, sq, r2, 'average', dst_nodata=-32767)[..., 0].astype(np.float64)
    v2 = d2 > -32000
    d2 = np.where(v2, d2, floor)
    gy, gx = np.gradient(d2, r2)
    # Image rows go south; tangent-space normal: +x east, +y north (flip row gradient).
    nx, ny, nz = -gx, gy, np.ones_like(gx)
    norm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    nmap = np.stack([nx / norm, ny / norm, nz / norm], -1)
    save_webp(np.round((nmap * 0.5 + 0.5) * 255).astype(np.uint8), out / 'normal.webp', 90)

    color = rgba(photo_path, stretch)(sq, size / 4096)
    save_webp(color, out / 'color.webp', 85)

    # Sidescan around it, for context in the 3D view.
    ctx = 4 * size
    csq = (cx - ctx / 2, cy - ctx / 2, cx + ctx / 2, cy + ctx / 2)
    save_webp(rgba(args.sidescan)(csq, ctx / 2048), out / 'sidescan.webp', 80)

    log(f'  terrain: {size:.1f} m square, relief {top - floor:.2f} m')
    return {
        'bounds': [round(v, 3) for v in sq], 'samples': n, 'relief': round(float(top - floor), 3),
        'contextBounds': [round(v, 3) for v in csq],
    }


# --- Targets ------------------------------------------------------------------------------------

def build_targets(photo_path, stretch):
    targets_path = assets_dir / 'targets.json'
    out = public_dir / 'targets'
    shutil.rmtree(out, ignore_errors=True)
    if not targets_path.exists():
        log('  no targets.json yet')
        return
    targets = json.loads(targets_path.read_text())
    for t in targets:
        s = float(t.get('size', 4))
        px = min(900, max(400, round(s / 0.004)))  # ~native resolution, within sensible limits
        b = (t['x'] - s / 2, t['y'] - s / 2, t['x'] + s / 2, t['y'] + s / 2)
        img = rgba(photo_path, stretch)(b, s / px)
        save_webp(img, out / f"{t['id']}.webp", 85)
        log(f"  target {t['id']}: {px}px")


# --- Main ---------------------------------------------------------------------------------------

assets_dir.mkdir(parents=True, exist_ok=True)
stretch = make_stretch(args.photomosaic) if args.photomosaic else None

if args.targets_only:
    build_targets(args.photomosaic, stretch)
    sys.exit(0)

if not (args.sidescan and args.photomosaic):
    sys.exit('Need --sidescan and --photomosaic (and optionally --dem).')

parts = set((args.only or 'sidescan,photomosaic,relief,terrain,targets').split(','))
site = json.loads(site_path.read_text()) if args.only and site_path.exists() else {}
site['tileSize'] = TILE
photo_bounds = to_local_bounds(args.photomosaic)
if 'sidescan' in parts:
    log('Sidescan…')
    site['sidescan'] = build_pyramid('sidescan', rgba(args.sidescan), to_local_bounds(args.sidescan), -1, args.sidescan_zoom)
    site['sidescan']['dataBounds'] = data_bounds(args.sidescan)
if 'photomosaic' in parts:
    log('Photomosaic…')
    site['photomosaic'] = build_pyramid('photomosaic', rgba(args.photomosaic, stretch), photo_bounds, 1, args.photo_zoom)
    site['photomosaic']['footprint'] = footprint(args.photomosaic)
if args.dem and 'relief' in parts:
    log('Relief…')
    site['relief'] = build_pyramid('relief', relief_render(args.dem), photo_bounds, 2, args.relief_zoom)
if args.dem and 'terrain' in parts:
    log('Terrain…')
    site['terrain'] = build_terrain(args.dem, args.photomosaic, stretch, photo_bounds)
if 'targets' in parts:
    log('Targets…')
    build_targets(args.photomosaic, stretch)

site_path.write_text(json.dumps(site, indent=1) + '\n')
log(f'Wrote {site_path.relative_to(ROOT)}')
