"""Recompute VADİ reference regions. Requires Python 3, Pillow and NumPy.

Run: python measure_reference.py reference-regions.json CACHE_DIR [--download]
Input screenshots stay in CACHE_DIR. Values in the JSON are updated only after
each frame's original bytes match its SHA-256 and its dimensions match.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image

D65 = np.array([0.95047, 1.0, 1.08883])
RGB_TO_XYZ = np.array([
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041],
])

def measure(image, rect):
    width, height = image.size
    x0, y0, x1, y1 = rect
    box = (round(x0 * width), round(y0 * height),
           round(x1 * width), round(y1 * height))
    patch = np.asarray(image.crop(box), dtype=np.float64) / 255
    linear = np.where(patch <= 0.04045, patch / 12.92,
                      ((patch + 0.055) / 1.055) ** 2.4)
    rgb = linear.mean(axis=(0, 1))
    xyz = RGB_TO_XYZ @ rgb
    relative = xyz / D65
    delta = 6 / 29
    f = np.where(relative > delta ** 3, np.cbrt(relative),
                 relative / (3 * delta ** 2) + 4 / 29)
    lightness = 116 * f[1] - 16
    a, b = 500 * (f[0] - f[1]), 200 * (f[1] - f[2])
    chroma = math.hypot(a, b)
    return {
        'linearRGB': rgb.round(8).tolist(), 'Y': round(xyz[1], 8),
        'L': round(lightness, 6), 'C': round(chroma, 6),
        'h': round(math.degrees(math.atan2(b, a)) % 360, 6) if chroma > 1e-6 else None,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('cache', type=Path)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    data = json.loads(args.manifest.read_text())
    args.cache.mkdir(exist_ok=True, parents=True)
    for frame in data['frames']:
        path = args.cache / (frame['id'] + '.jpg')
        if not path.exists() and args.download:
            with urlopen(frame['source'], timeout=45) as response:
                path.write_bytes(response.read())
        if hashlib.sha256(path.read_bytes()).hexdigest() != frame['sha256']:
            raise ValueError(f'Wrong source bytes: {path}')
        with Image.open(path) as raw:
            if list(raw.size) != frame['size']:
                raise ValueError(f'Wrong source dimensions: {path}')
            image = raw.convert('RGB')
            for region in frame['regions']:
                region.update(measure(image, region['rect']))
    args.manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

if __name__ == '__main__':
    main()
