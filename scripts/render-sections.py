from pathlib import Path
from urllib.parse import quote
import shutil
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "assets"
SCRATCH_DIR = Path(r"C:\Users\Ayubi\.gemini\antigravity\brain\fbeebaf0-ca9f-4917-bbf9-7aa8bb4898f9\scratch")
WORK_SOURCES = SCRATCH_DIR / "work-sources"
FRAMES_ROOT = SCRATCH_DIR / "section-frames"

FPS = 16

JOBS = [
    {
        "name": "featured-agrisymphony",
        "html": ROOT / "scripts" / "motion-featured.html",
        "width": 1100,
        "height": 400,
        "duration": 6.4,
        "keys": [0.0, 2.0, 3.1, 4.5, 5.7, 6.32],
        "sheet": SCRATCH_DIR / "featured-contact-sheet.png",
    },
    {
        "name": "selected-work",
        "html": ROOT / "scripts" / "motion-works.html",
        "width": 1100,
        "height": 410,
        "duration": 8.4,
        "keys": [0.0, 1.4, 3.8, 6.4, 7.9, 8.32],
        "sheet": SCRATCH_DIR / "works-contact-sheet.png",
    },
]


def encode_webp(frame_paths: list[Path], out_webp: Path, quality: int = 76):
    frames = [Image.open(p).convert("RGBA") for p in frame_paths]
    frames[0].save(
        out_webp,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=int(round(1000 / FPS)),
        loop=0,
        quality=quality,
        method=1,
        allow_mixed=False,
    )
    for im in frames:
        im.close()


def render_job(browser, job: dict):
    total_frames = int(round(job["duration"] * FPS))
    assets_uri = quote(WORK_SOURCES.as_uri(), safe="")

    context = browser.new_context(
        viewport={"width": job["width"], "height": job["height"]},
        device_scale_factor=1,
    )
    page = context.new_page()

    for theme in ("light", "dark"):
        frame_dir = FRAMES_ROOT / job["name"] / theme
        if frame_dir.exists():
            shutil.rmtree(frame_dir)
        frame_dir.mkdir(parents=True, exist_ok=True)

        url = f"{job['html'].as_uri()}?clean=1&theme={theme}&assets={assets_uri}"
        page.goto(url, wait_until="networkidle")
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(300)

        frame_paths = []
        for i in range(total_frames):
            t = i / FPS
            page.evaluate(f"window.__setMotionTime({t:.6f})")
            fp = frame_dir / f"frame_{i:04d}.png"
            page.screenshot(path=str(fp), omit_background=True)
            frame_paths.append(fp)

        out_webp = ASSETS_DIR / f"{job['name']}-{theme}.webp"
        encode_webp(frame_paths, out_webp, quality=76)
        if out_webp.stat().st_size > 1_800_000:
            encode_webp(frame_paths, out_webp, quality=66)

        print(f"RENDERED {out_webp.name}: {out_webp.stat().st_size} bytes", flush=True)

    context.close()

    # Build 4x3 contact sheet (2 rows light + 2 rows dark)
    thumb_w = 550
    thumb_h = int(round(job["height"] * (thumb_w / job["width"])))
    cols, rows = 3, 4
    pad = 12
    sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * pad, rows * thumb_h + (rows + 1) * pad), (226, 232, 240))
    draw = ImageDraw.Draw(sheet)

    for t_idx, theme in enumerate(("light", "dark")):
        frame_dir = FRAMES_ROOT / job["name"] / theme
        for k_idx, sec in enumerate(job["keys"]):
            f_idx = min(total_frames - 1, max(0, int(round(sec * FPS))))
            frame_img = Image.open(frame_dir / f"frame_{f_idx:04d}.png").convert("RGBA")
            bg = Image.new("RGB", frame_img.size, (255, 255, 255) if theme == "light" else (13, 17, 23))
            bg.paste(frame_img, (0, 0), frame_img)
            thumb = bg.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)

            row = t_idx * 2 + (k_idx // 3)
            col = k_idx % 3
            x = pad + col * (thumb_w + pad)
            y = pad + row * (thumb_h + pad)
            sheet.paste(thumb, (x, y))
            draw.rectangle([x + 8, y + 8, x + 132, y + 30], fill=(22, 28, 43))
            draw.text((x + 14, y + 13), f"{theme.upper()} @ {sec:.2f}s", fill=(250, 226, 198))

    sheet.save(job["sheet"])
    print(f"SHEET {job['sheet']}", flush=True)


def main():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_ROOT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="msedge", headless=True)
        except Exception:
            browser = p.chromium.launch(headless=True)

        for job in JOBS:
            render_job(browser, job)

        browser.close()


if __name__ == "__main__":
    main()
