#!/usr/bin/env python3
"""Build the coordinated-survey replay (FleetReplay.astro) from a CSV of synchronised poses.

Input is the output of scripts/extract-mission-poses.py. Only local coordinates leave this script:
x/y are metres from the buoy's mean position, time is seconds from the start, and no latitude,
longitude or absolute timestamp is written.

Writes to src/assets/surveys/<name>/:
  fleet.json   platforms, sample layout, terrain grid info and summary stats
  tracks.bin   float32 samples, one row per time step (layout in fleet.json)
  terrain.bin  uint16 seafloor depth in cm per grid cell, 0 where there is no data

Usage:
  python3 scripts/build-fleet-replay.py POSES.csv coordinated-survey [--rate 2] [--cell 2]
"""
import argparse
import csv
import json
import math
import os

import numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import distance_transform_edt, gaussian_filter

ROOT = os.path.join(os.path.dirname(__file__), '..')


def load(path):
    with open(path) as f:
        rows = list(csv.reader(f))
    head = rows[0]
    data = np.array([[float(v) if v else np.nan for v in r] for r in rows[1:]])
    return {k: data[:, i] for i, k in enumerate(head)}


def unwrap_deg(a):
    return np.degrees(np.unwrap(np.radians(a)))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv')
    ap.add_argument('name')
    ap.add_argument('--rate', type=float, default=2.0, help='samples per second kept for the replay')
    ap.add_argument('--cell', type=float, default=2.0, help='terrain grid cell size, m')
    ap.add_argument('--max-altitude', type=float, default=8.0,
                    help='soundings from higher up (descents, ascents) are left out of the terrain')
    ap.add_argument('--reach', type=float, default=12.0, help='terrain is kept this far (m) from a sounding')
    args = ap.parse_args()

    c = load(args.csv)
    vehicles = sorted({k[: -len('_altitude')] for k in c if k.endswith('_altitude')})

    # Downsample: the replay interpolates between samples. Angles are unwrapped first so that
    # averaging/interpolating across north works; the viewer interpolates them linearly.
    t = c['t']
    step = max(1, round(1 / (args.rate * np.median(np.diff(t)))))
    idx = np.arange(0, len(t), step)

    # Positions are rounded to centimetres; no global reference survives.
    fields = [('t', t)]
    fields += [('bob_x', c['bob_x']), ('bob_y', c['bob_y']), ('bob_roll', c['bob_roll']),
               ('bob_pitch', c['bob_pitch']), ('bob_heading', unwrap_deg(c['bob_heading']))]
    for v in vehicles:
        alt = c[f'{v}_altitude']
        fields += [(f'{v}_x', c[f'{v}_x']), (f'{v}_y', c[f'{v}_y']), (f'{v}_depth', c[f'{v}_depth']),
                   (f'{v}_altitude', np.where(np.isnan(alt), -1, alt)),
                   (f'{v}_roll', c[f'{v}_roll']), (f'{v}_pitch', c[f'{v}_pitch']),
                   (f'{v}_heading', unwrap_deg(c[f'{v}_heading']))]
    tracks = np.column_stack([np.round(col[idx], 2) for _, col in fields]).astype(np.float32)

    # Rough terrain from the vehicles' soundings (depth + altitude beneath each vehicle).
    pts, depths = [], []
    for v in vehicles:
        ok = ~np.isnan(c[f'{v}_seafloor_depth']) & (c[f'{v}_altitude'] <= args.max_altitude)
        pts.append(np.column_stack([c[f'{v}_x'][ok], c[f'{v}_y'][ok]]))
        depths.append(c[f'{v}_seafloor_depth'][ok])
    pts, depths = np.concatenate(pts), np.concatenate(depths)

    pad = args.reach + args.cell
    xs = np.concatenate([pts[:, 0], tracks[:, 1]])
    ys = np.concatenate([pts[:, 1], tracks[:, 2]])
    x0, x1 = math.floor(xs.min() - pad), math.ceil(xs.max() + pad)
    y0, y1 = math.floor(ys.min() - pad), math.ceil(ys.max() + pad)
    nx, ny = int((x1 - x0) / args.cell) + 1, int((y1 - y0) / args.cell) + 1
    gx, gy = np.meshgrid(x0 + np.arange(nx) * args.cell, y1 - np.arange(ny) * args.cell)  # rows north to south

    # Median per cell first: soundings are dense along track, and outliers from the altimeter
    # (fish, steep slopes) shouldn't punch holes in the surface.
    ci = np.clip(np.round((pts[:, 0] - x0) / args.cell).astype(int), 0, nx - 1)
    cj = np.clip(np.round((y1 - pts[:, 1]) / args.cell).astype(int), 0, ny - 1)
    cell_id = cj * nx + ci
    order = np.argsort(cell_id)
    ids, starts = np.unique(cell_id[order], return_index=True)
    med = np.array([np.median(d) for d in np.split(depths[order], starts[1:])])
    cell_xy = np.column_stack([x0 + (ids % nx) * args.cell, y1 - (ids // nx) * args.cell])

    lin = griddata(cell_xy, med, (gx, gy), method='linear')
    near = griddata(cell_xy, med, (gx, gy), method='nearest')
    grid = np.where(np.isnan(lin), near, lin)
    have = np.zeros((ny, nx), bool)
    have.flat[ids] = True
    reach = distance_transform_edt(~have) * args.cell <= args.reach
    grid = gaussian_filter(grid, 1.0)
    terrain = np.where(reach, np.round(grid * 100), 0).astype(np.uint16)

    out = os.path.join(ROOT, 'src/assets/surveys', args.name)
    os.makedirs(out, exist_ok=True)
    tracks.tofile(os.path.join(out, 'tracks.bin'))
    terrain.tofile(os.path.join(out, 'terrain.bin'))

    depth_all = np.concatenate([c[f'{v}_depth'] for v in vehicles])
    meta = {
        'rate': args.rate,
        'duration': float(round(tracks[-1, 0], 1)),
        'fields': [name for name, _ in fields],
        'samples': int(len(tracks)),
        'vehicles': vehicles,
        'terrain': {
            'bounds': [x0, y1 - (ny - 1) * args.cell, x0 + (nx - 1) * args.cell, y1],
            'cols': nx, 'rows': ny, 'cell': args.cell,
            'minDepth': float(round(med.min(), 2)), 'maxDepth': float(round(med.max(), 2)),
        },
        'stats': {
            'maxDepth': float(round(np.nanmax(depth_all), 1)),
            'soundings': int(len(depths)),
            'trackKm': {v: float(round(np.nansum(np.hypot(np.diff(c[f'{v}_x']), np.diff(c[f'{v}_y']))) / 1000, 2))
                        for v in vehicles},
        },
    }
    with open(os.path.join(out, 'fleet.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta['stats']), f'tracks {tracks.nbytes // 1024} KB, terrain {nx}x{ny} '
          f'({terrain.nbytes // 1024} KB, {np.mean(terrain > 0) * 100:.0f}% filled)')


if __name__ == '__main__':
    main()
