#!/usr/bin/env python3
"""Measure paired reference/render image patches and fit a shared display color grade."""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def linear_rgb(rgb):
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def oklab(rgb):
    # Björn Ottosson's linear sRGB to OKLab transform.
    lms = rgb @ np.array([
        [.4122214708, .5363325363, .0514459929],
        [.2119034982, .6806995451, .1073969566],
        [.0883024619, .2817188376, .6299787005],
    ]).T
    return np.cbrt(lms) @ np.array([
        [.2104542553, .7936177850, -.0040720468],
        [1.9779984951, -2.4285922050, .4505937099],
        [.0259040371, .7827717662, -.8086757660],
    ]).T


def measure(image, rect):
    x0, y0, x1, y1 = rect
    if not 0 <= x0 < x1 <= 1 or not 0 <= y0 < y1 <= 1:
        raise ValueError(f"Invalid normalized patch: {rect}")
    width, height = image.size
    boundaries = (round(x0 * width), round(y0 * height), round(x1 * width), round(y1 * height))
    patch = image.crop(boundaries)
    if min(patch.size) < 2:
        raise ValueError(f"Patch contains fewer than two pixels per side: {rect}")
    return linear_rgb(np.asarray(patch, dtype=float) / 255).mean((0, 1))


def grade(rows, params):
    ev, red, blue, saturation = params
    balanced = rows * np.exp2([ev + red, ev, ev + blue])
    luminance = (balanced @ np.array([.2126, .7152, .0722]))[:, None]
    return np.clip(luminance + (balanced - luminance) * np.exp(saturation), 0, 1)


def fit(render, reference):
    target = oklab(reference)
    params = np.zeros(4)
    low, high = np.array([-2, -.6, -.6, -.8]), np.array([2, .6, .6, .8])

    def residual(p):
        return (oklab(grade(render, p)) - target).ravel()

    for _ in range(35):
        error = residual(params)
        jacobian = np.column_stack([(residual(params + column) - error) / 1e-4
                                    for column in np.eye(4) * 1e-4])
        step = np.linalg.lstsq(np.vstack([jacobian, .03 * np.eye(4)]),
                               np.r_[-error, np.zeros(4)], rcond=None)[0]
        for rate in (1, .5, .25, .125):
            trial = np.clip(params + step * rate, low, high)
            if np.linalg.norm(residual(trial)) < np.linalg.norm(error) - 1e-8:
                params = trial
                break
        else:
            break
    return params


def metrics(rows):
    light, a, b = rows
    chroma = np.hypot(a, b)
    return {"L": light, "C": chroma, "h": np.degrees(np.arctan2(b, a)) % 360 if chroma > .005 else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="JSON file with training and holdout frame pairs.")
    args = parser.parse_args()
    pairs = json.loads(args.manifest.read_text(encoding="utf-8"))
    if len({pair["reference"] for pair in pairs}) < 12 or sum(len(pair["patches"]) for pair in pairs) < 100:
        parser.error("Provide at least 12 distinct reference frames and 100 paired patches.")
    train, holdout, names = [], [], []
    for pair in pairs:
        split = holdout if pair.get("holdout") else train
        if pair["reference"] in names:
            parser.error("A reference frame may only appear once.")
        names.append(pair["reference"])
        with Image.open(args.manifest.parent / pair["reference"]) as ref_image, Image.open(args.manifest.parent / pair["render"]) as out_image:
            reference, render = ref_image.convert("RGB"), out_image.convert("RGB")
            for patch in pair["patches"]:
                split.append((measure(render, patch["render"]), measure(reference, patch["reference"]),
                              pair["reference"], patch["label"]))
    if len(train) < 70 or len(holdout) < 8:
        parser.error("Use at least 70 training patches and 8 holdout patches from different frames.")
    render, reference = [np.stack(values) for values in zip(*(row[:2] for row in train))]
    params = fit(render, reference)

    def summarize(split):
        render, reference = [np.stack(values) for values in zip(*(row[:2] for row in split))]
        before, target, after = oklab(render), oklab(reference), oklab(grade(render, params))
        rmse = lambda estimate: float(np.sqrt(np.mean(np.sum((estimate - target) ** 2, axis=1))))
        return {"patches": len(split), "rmse_before": rmse(before), "rmse_after": rmse(after),
                "measurements": [{"frame": frame, "label": label, "reference": metrics(t), "render": metrics(b),
                                  "graded": metrics(a)} for (_, _, frame, label), t, b, a in zip(split, target, before, after)]}

    report = {"display_grade": dict(zip(("exposure_ev", "red_ev", "blue_ev", "log_saturation"), params)),
              "training": summarize(train), "holdout": summarize(holdout)}
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
