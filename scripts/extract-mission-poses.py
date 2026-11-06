#!/usr/bin/env python3
"""Synchronise the poses of two AUVs and the Bob topside buoy from one mission site into a CSV.

Reads each vehicle's navigation solution (<VEHICLE>.ACFR_NAV, 10 Hz) and Bob's Subsonus state
(BOB.SUBSONUS.SYSTEM_STATE, 10 Hz), keeps the period both vehicles were submerged, and resamples
everything onto one 10 Hz time base.

The CSV holds real latitude/longitude: keep it out of the repo. x/y are metres east/north of Bob's
mean position, which is what the website should use.

Needs the lcm Python package and the ACFR message types (acfr-lcm-types), e.g. in a venv:
  pip install lcm numpy "git+ssh://git@gitlab.acfr.usyd.edu.au/auv-packaging/acfr-lcm-types.git"

Usage:
  python scripts/extract-mission-poses.py OUT.csv --bob BOB.lcm --auv VEH1.lcm --auv VEH2.lcm
      [--rate 10] [--pad 30] [--min-depth 2]
"""
import argparse
import csv
import math
import struct

import numpy as np
from acfrlcm import auv_acfr_nav_t
from senlcm import subsonus_system_state_t

EARTH_RADIUS = 6378137.0


def events(path, want):
    """Yield (utime, channel, payload) for channels accepted by `want`, seeking past the rest."""
    with open(path, 'rb', buffering=1 << 20) as f:
        while True:
            header = f.read(28)
            if len(header) < 28:
                return
            sync, _, utime, clen, dlen = struct.unpack('>IqqII', header)
            if sync != 0xEDA1DA01:
                raise ValueError(f'{path}: bad sync word at byte {f.tell() - 28}')
            channel = f.read(clen).decode()
            if want(channel):
                yield utime, channel, f.read(dlen)
            else:
                f.seek(dlen, 1)


def read_auv(path):
    """Navigation solution of the vehicle that wrote this log."""
    rows, name = [], None
    for _, channel, data in events(path, lambda c: c.endswith('.ACFR_NAV')):
        m = auv_acfr_nav_t.decode(data)
        name = channel.split('.')[0]
        rows.append((m.utime, m.latitude, m.longitude, m.depth, m.altitude, m.roll, m.pitch, m.heading))
    if not rows:
        raise SystemExit(f'{path}: no *.ACFR_NAV messages')
    return name.lower(), np.array(rows, dtype=float)


def read_bob(path):
    rows = []
    for _, _, data in events(path, lambda c: c == 'BOB.SUBSONUS.SYSTEM_STATE'):
        m = subsonus_system_state_t.decode(data)
        # utime is the logging computer's clock, the same clock as the vehicles' nav utime.
        rows.append((m.utime, m.latitude, m.longitude, m.height, *m.rpy))
    if not rows:
        raise SystemExit(f'{path}: no BOB.SUBSONUS.SYSTEM_STATE messages')
    return np.array(rows, dtype=float)


def submerged_span(nav, min_depth):
    under = nav[nav[:, 3] > min_depth, 0]
    if not len(under):
        raise SystemExit('a vehicle never went below --min-depth')
    return under[0], under[-1]


def resample(t, src, angle_cols=()):
    """Interpolate every column of src (first column is time) at times t.

    Angles are unwrapped before interpolating and returned in [-pi, pi)."""
    src = src[np.argsort(src[:, 0])]
    _, keep = np.unique(src[:, 0], return_index=True)
    src = src[keep]
    out = np.empty((len(t), src.shape[1] - 1))
    for j in range(1, src.shape[1]):
        col = np.unwrap(src[:, j]) if j in angle_cols else src[:, j]
        v = np.interp(t, src[:, 0], col, left=np.nan, right=np.nan)
        out[:, j - 1] = np.mod(v + math.pi, 2 * math.pi) - math.pi if j in angle_cols else v
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('out')
    ap.add_argument('--bob', required=True)
    ap.add_argument('--auv', action='append', required=True)
    ap.add_argument('--rate', type=float, default=10.0, help='output rate, Hz')
    ap.add_argument('--pad', type=float, default=30.0, help='seconds kept either side of the overlap')
    ap.add_argument('--min-depth', type=float, default=2.0, help='depth (m) that counts as submerged')
    ap.add_argument('--max-altitude', type=float, default=30.0, help='altitudes above this are no bottom lock')
    args = ap.parse_args()

    auvs = [read_auv(p) for p in args.auv]
    bob = read_bob(args.bob)

    spans = [submerged_span(nav, args.min_depth) for _, nav in auvs]
    t0 = max(s[0] for s in spans) - args.pad * 1e6
    t1 = min(s[1] for s in spans) + args.pad * 1e6
    if t1 <= t0:
        raise SystemExit('the vehicles were never submerged at the same time')
    t = np.arange(t0, t1, 1e6 / args.rate)

    # Local frame: metres east/north of Bob's mean position over the window.
    window = bob[(bob[:, 0] >= t0) & (bob[:, 0] <= t1)]
    lat0, lon0 = window[:, 1].mean(), window[:, 2].mean()

    def local(lat, lon):
        return (lon - lon0) * math.cos(lat0) * EARTH_RADIUS, (lat - lat0) * EARTH_RADIUS

    columns = {'utime': t.astype(np.int64), 't': (t - t[0]) / 1e6}
    b = resample(t, bob, angle_cols=(6,))  # lat lon height roll pitch heading
    bx, by = local(b[:, 0], b[:, 1])
    def heading(rad):
        return np.mod(np.degrees(rad), 360)

    columns.update({
        'bob_lat': np.degrees(b[:, 0]), 'bob_lon': np.degrees(b[:, 1]), 'bob_x': bx, 'bob_y': by,
        'bob_roll': np.degrees(b[:, 3]), 'bob_pitch': np.degrees(b[:, 4]), 'bob_heading': heading(b[:, 5]),
    })
    for name, nav in auvs:
        v = resample(t, nav, angle_cols=(5, 6, 7))  # lat lon depth altitude roll pitch heading
        x, y = local(v[:, 0], v[:, 1])
        alt = v[:, 3]
        # Altitude only means something with bottom lock: zero means none, and interpolating
        # across a dropout invents values, so require a valid sample both sides.
        valid = resample(t, np.column_stack([nav[:, 0], (nav[:, 4] > 0) & (nav[:, 4] < args.max_altitude)]))[:, 0] == 1
        # Near the surface the altimeter picks up false returns, so only trust it while submerged.
        seafloor = np.where(valid & (v[:, 2] > args.min_depth), v[:, 2] + alt, np.nan)
        columns.update({
            f'{name}_lat': np.degrees(v[:, 0]), f'{name}_lon': np.degrees(v[:, 1]),
            f'{name}_x': x, f'{name}_y': y,
            f'{name}_depth': v[:, 2], f'{name}_altitude': np.where(valid, alt, np.nan),
            f'{name}_seafloor_depth': seafloor,
            f'{name}_roll': np.degrees(v[:, 4]), f'{name}_pitch': np.degrees(v[:, 5]),
            f'{name}_heading': heading(v[:, 6]),
        })

    fmt = {k: ('{:.8f}' if k.endswith(('_lat', '_lon')) else '{:.3f}') for k in columns}
    fmt['utime'] = '{:d}'
    with open(args.out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(columns)
        for i in range(len(t)):
            w.writerow('' if (isinstance(c[i], float) and math.isnan(c[i])) else fmt[k].format(c[i])
                       for k, c in columns.items())

    names = ', '.join(n for n, _ in auvs)
    print(f'{args.out}: {len(t)} rows at {args.rate:g} Hz, {(t1 - t0) / 60e6:.1f} min, vehicles {names} and bob')


if __name__ == '__main__':
    main()
