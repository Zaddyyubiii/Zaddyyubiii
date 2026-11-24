from pathlib import Path
import shutil
import subprocess
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / "scripts" / "motion-hero.html"
ASSETS_DIR = ROOT / "assets"
SCRATCH_DIR = Path(r"C:\Users\Ayubi\.gemini\antigravity\brain\fbeebaf0-ca9f-4917-bbf9-7aa8bb4898f9\scratch")
FRAMES_ROOT = SCRATCH_DIR / "hero-frames"

WIDTH = 1200
HEIGHT = 460
FPS = 20
DURATION = 7.2
TOTAL_FRAMES = int(round(DURATION * FPS))  # 144 frames (i = 0..143)
KEY_TIMES = [0.0, 1.4, 3.2, 5.1, 6.4, 7.15]


def encode_webp_pillow(frame_paths: list[Path], out_webp: Path, quality: int = 84):
    frames = [Image.open(p).convert("RGBA") for p in frame_paths]
    frames[0].save(
        out_webp,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=int(round(1000 / FPS)),
        loop=0,
        quality=quality,
        method=2,
        allow_mixed=True,
    )
    for im in frames:
        im.close()


def render_theme(page, theme: str) -> Path:
    frame_dir = FRAMES_ROOT / theme
    if frame_dir.exists():
        shutil.rmtree(frame_dir)
    frame_dir.mkdir(parents=True, exist_ok=True)

    url = f"{HTML_PATH.as_uri()}?clean=1&theme={theme}"
    page.goto(url, wait_until="networkidle")
    page.evaluate("() => document.fonts.ready")
    page.wait_for_timeout(300)

    frame_paths = []
    for i in range(TOTAL_FRAMES):
        t = i / FPS
        page.evaluate(f"window.__setMotionTime({t:.6f})")
        fp = frame_dir / f"frame_{i:04d}.png"
        page.screenshot(path=str(fp), omit_background=True)
        frame_paths.append(fp)

    out_webp = ASSETS_DIR / f"hero-{theme}.webp"
    encode_webp_pillow(frame_paths, out_webp, quality=84)

    if out_webp.stat().st_size > 1_500_000:
        encode_webp_pillow(frame_paths, out_webp, quality=74)

    return out_webp


def build_contact_sheet():
    thumb_w, thumb_h = 600, 230
    cols, rows = 3, 4
    pad = 14
    sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * pad, rows * thumb_h + (rows + 1) * pad), (226, 232, 240))
    draw = ImageDraw.Draw(sheet)

    themes = ["light", "dark"]
    for t_idx, theme in enumerate(themes):
        frame_dir = FRAMES_ROOT / theme
        for k_idx, sec in enumerate(KEY_TIMES):
            f_idx = min(TOTAL_FRAMES - 1, max(0, int(round(sec * FPS))))
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

    out_sheet = SCRATCH_DIR / "hero-contact-sheet.png"
    sheet.save(out_sheet)
    return out_sheet


def main():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_ROOT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="msedge", headless=True)
        except Exception:
            browser = p.chromium.launch(headless=True)

        context = browser.new_context(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1)
        page = context.new_page()

        light_webp = render_theme(page, "light")
        dark_webp = render_theme(page, "dark")
        browser.close()

    sheet_path = build_contact_sheet()
    print(f"LIGHT_WEBP={light_webp} ({light_webp.stat().st_size} bytes)", flush=True)
    print(f"DARK_WEBP={dark_webp} ({dark_webp.stat().st_size} bytes)", flush=True)
    print(f"CONTACT_SHEET={sheet_path}", flush=True)


if __name__ == "__main__":
    main()
