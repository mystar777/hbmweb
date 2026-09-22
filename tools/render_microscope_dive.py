"""Render the HBM microscope dive as a real 30 fps video asset.

Five original HBM keyframes are transformed into a continuous optical feed.
Every output frame fills the viewport; transitions use full-frame zoom,
defocus/refocus and temporal drift, so a smaller "next image" is never shown.
"""

from __future__ import annotations

import argparse
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / ".video-tools"
sys.path.insert(0, str(TOOLS))

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter  # noqa: E402
import imageio_ffmpeg  # noqa: E402


KEYFRAMES = [
    ROOT / "assets/scale-dive/keyframes/01-package.png",
    ROOT / "assets/scale-dive/keyframes/02-stack.png",
    ROOT / "assets/scale-dive/keyframes/03-die.png",
    ROOT / "assets/scale-dive/keyframes/04-tsv.png",
    ROOT / "assets/scale-dive/keyframes/05-cell.png",
]


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smootherstep(value: float) -> float:
    value = clamp(value)
    return value * value * value * (value * (value * 6 - 15) + 10)


def crop_cover(image: Image.Image, size: int) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side)).resize(
        (size, size), Image.Resampling.LANCZOS
    )


def camera_frame(
    image: Image.Image,
    size: int,
    zoom: float,
    drift_x: float,
    drift_y: float,
    rotation: float,
) -> Image.Image:
    crop_size = max(32, int(size / max(zoom, 1.0)))
    half = crop_size / 2
    center_x = size / 2 + drift_x
    center_y = size / 2 + drift_y
    left = int(clamp(center_x - half, 0, size - crop_size))
    top = int(clamp(center_y - half, 0, size - crop_size))
    frame = image.crop((left, top, left + crop_size, top + crop_size)).resize(
        (size, size), Image.Resampling.LANCZOS
    )
    if abs(rotation) > 0.01:
        frame = frame.rotate(
            rotation,
            resample=Image.Resampling.BICUBIC,
            expand=False,
            fillcolor=(4, 8, 12),
        )
    return frame


def build_lens_overlays(size: int) -> tuple[Image.Image, Image.Image]:
    radial = Image.radial_gradient("L").resize((size, size), Image.Resampling.LANCZOS)
    darkness = radial.point(lambda value: int(max(0, value - 118) * 0.46))
    vignette = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    vignette.putalpha(darkness)

    glass = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glass)
    inset = max(5, int(size * 0.012))
    draw.ellipse(
        (inset, inset, size - inset, size - inset),
        outline=(80, 224, 255, 76),
        width=max(2, int(size * 0.007)),
    )
    draw.ellipse(
        (inset * 2, inset * 2, size - inset * 2, size - inset * 2),
        outline=(35, 118, 154, 44),
        width=max(1, int(size * 0.003)),
    )
    return vignette, glass


def render_frame(
    keyframes: list[Image.Image],
    frame_number: int,
    total_frames: int,
    size: int,
    vignette: Image.Image,
    glass: Image.Image,
) -> Image.Image:
    progress = frame_number / max(total_frames - 1, 1)
    scaled = progress * (len(keyframes) - 1)
    index = min(int(scaled), len(keyframes) - 1)
    next_index = min(index + 1, len(keyframes) - 1)
    local = 1.0 if index == len(keyframes) - 1 else scaled - index
    eased = smootherstep(local)

    global_time = progress * math.tau * 2.35
    drift_x = math.sin(global_time * 0.77) * size * 0.012
    drift_y = math.cos(global_time * 0.61 + 0.8) * size * 0.010
    rotation = math.sin(global_time * 0.43) * 0.32

    outgoing = camera_frame(
        keyframes[index],
        size,
        1.0 + 1.75 * eased,
        drift_x,
        drift_y,
        rotation,
    )

    if index == next_index:
        frame = outgoing
        blend = 0.0
    else:
        incoming = camera_frame(
            keyframes[next_index],
            size,
            1.12 - 0.12 * eased,
            drift_x * 0.72,
            drift_y * 0.72,
            -rotation * 0.45,
        )
        blend = smootherstep(clamp((local - 0.30) / 0.48))
        frame = Image.blend(outgoing, incoming, blend)

    focus_loss = math.sin(math.pi * blend) ** 2 if 0.0 < blend < 1.0 else 0.0
    if focus_loss > 0.01:
        frame = frame.filter(ImageFilter.GaussianBlur(0.25 + focus_loss * 3.3))

    # A short exposure/focus breath sells a physical microscope refocus.
    exposure = 1.0 + math.sin(math.pi * blend) * 0.055
    frame = ImageEnhance.Brightness(frame).enhance(exposure)
    frame = ImageEnhance.Contrast(frame).enhance(1.07)

    cyan_grade = Image.new("RGB", (size, size), (4, 21, 27))
    frame = Image.blend(frame, cyan_grade, 0.035)
    frame = Image.alpha_composite(frame.convert("RGBA"), vignette)
    frame = Image.alpha_composite(frame, glass)

    # Fine per-frame sensor grain avoids the sterile slideshow look.
    noise = Image.effect_noise((size, size), 8.0).convert("RGB")
    frame = Image.blend(frame.convert("RGB"), noise, 0.018)
    return frame


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=768)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "assets/scale-dive/hbm-microscope-dive.mp4",
    )
    args = parser.parse_args()

    missing = [path for path in KEYFRAMES if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing keyframes: {missing}")

    keyframes = [crop_cover(Image.open(path).convert("RGB"), args.size) for path in KEYFRAMES]
    vignette, glass = build_lens_overlays(args.size)
    total_frames = max(2, round(args.fps * args.seconds))
    args.output.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{args.size}x{args.size}",
        "-r",
        str(args.fps),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "15",
        "-movflags",
        "+faststart",
        "-metadata",
        "comment=Original HBM microscope sequence generated for the HBM Interactive Museum",
        str(args.output),
    ]

    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_number in range(total_frames):
            frame = render_frame(
                keyframes,
                frame_number,
                total_frames,
                args.size,
                vignette,
                glass,
            )
            process.stdin.write(frame.tobytes())
            if frame_number % args.fps == 0:
                print(f"rendered {frame_number:03d}/{total_frames}", flush=True)
    finally:
        process.stdin.close()

    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"ffmpeg exited with status {return_code}")
    print(f"wrote {args.output} ({args.output.stat().st_size / 1_048_576:.2f} MiB)")


if __name__ == "__main__":
    main()
