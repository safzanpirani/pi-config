---
name: reverse-synthid
description: Run Google's SynthID watermark detection and removal via the reverse-SynthID project on the user's main PC (ssh main). Use when the user mentions SynthID, watermark bypass, watermark removal, AI image watermark, Gemini watermark, or wants to run reverse-SynthID on images.
---

# reverse-SynthID Skill

The user's main PC (accessible via `ssh main`) has the reverse-SynthID project cloned at `F:\specprojects\reverse-SynthID`. All dependencies (including PyTorch with CUDA) are already installed.

## Quick Reference

| Strength | Uses GPU | PSNR | Speed | Best For |
|----------|----------|------|-------|----------|
| `gentle` | No | ~50 dB | ~5 sec | Minimal disruption |
| `moderate` | No | ~48 dB | ~5 sec | Balanced spectral |
| `aggressive` | No | ~45 dB | ~5 sec | Strong spectral |
| `maximum` | No | ~50 dB | ~10 sec | Strongest non-VAE |
| `final` | **Yes** | ~16 dB | ~90 sec | **Detector-defeating** (7-stage) |
| `nuke` | **Yes** | ~12 dB | ~180 sec | Maximum attack (2× VAE) |

## Project Layout on Main PC

```
F:\specprojects\reverse-SynthID\
├── artifacts\
│   ├── spectral_codebook_v4.npz      # V4 codebook (use this)
│   └── spectral_codebook_v3.npz      # Legacy V3
├── src\extraction\
│   ├── synthid_bypass_v4.py          # V4 bypass engine
│   └── vae_regen.py                  # VAE roundtrip (GPU)
├── scripts\
│   └── dissolve_batch.py             # Batch processing CLI
└── test_output/                      # Default output dir
```

## Batch Processing

Use `dissolve_batch.py` for all operations. It handles profile auto-selection, manifest generation, and variant naming.

### Basic Command Pattern

```bash
ssh main "cd F:/specprojects/reverse-SynthID && python scripts/dissolve_batch.py \
    --input <PATH_OR_DIR> \
    --output <OUT_DIR> \
    --codebook artifacts/spectral_codebook_v4.npz \
    --strengths <STRENGTH> \
    --model nano-banana-pro-preview"
```

### Models

- `gemini-3.1-flash-image-preview` — Gemini Flash images
- `nano-banana-pro-preview` — Nano Banana Pro images (default for this user)
- Omit `--model` for auto-selection by resolution

### Strength Presets

Available: `gentle`, `moderate`, `aggressive`, `maximum`, `demolish`, `annihilate`, `combo`, `blog_pure`, `blog_plus`, `blog_combo`, `residual_pure`, `residual_plus`, `residual_combo`, `regen_pure`, `regen_plus`, `regen_combo`, `final`, `nuke`

Multiple strengths can be passed (e.g., `--strengths gentle moderate aggressive`) to generate variants A, B, C.

### Example Workflows

**Single image, maximum spectral (CPU-only, fast):**
```bash
ssh main "cd F:/specprojects/reverse-SynthID && python scripts/dissolve_batch.py \
    --input D:/lora/gemini\\ gens/images/1765719471693-to4wyv.webp \
    --output test_output \
    --codebook artifacts/spectral_codebook_v4.npz \
    --strengths maximum --model nano-banana-pro-preview"
```

**Full directory, final strength (GPU, detector-defeating):**
```bash
ssh main "cd F:/specprojects/reverse-SynthID && python scripts/dissolve_batch.py \
    --input D:/lora/gemini\\ gens/images \
    --output test_output_final \
    --codebook artifacts/spectral_codebook_v4.npz \
    --strengths final --model nano-banana-pro-preview"
```

**Multiple strength variants for manual testing:**
```bash
ssh main "cd F:/specprojects/reverse-SynthID && python scripts/dissolve_batch.py \
    --input <PATH> --output test_variants \
    --codebook artifacts/spectral_codebook_v4.npz \
    --strengths gentle moderate aggressive final \
    --model nano-banana-pro-preview"
```

## Output Files

For each input image, outputs are named: `<basename>__<VARIANT>_<strength>.png`

A `manifest.csv` is generated with per-image metrics (PSNR, SSIM, profile, elapsed time).

## File Transfer Between Main PC and Local

**Copy from main PC to local temp:**
```bash
# For single file
ssh main "cd <DIR> && cmd /c type <FILENAME>" > /tmp/<localname>

# For multiple files
ssh main "cd F:/specprojects/reverse-SynthID/test_output && cmd /c type file1.png" > /tmp/file1.png
```

**Copy local file to main PC:**
```bash
# Create temp file locally, then pipe via SSH
# (Use base64 encoding for binary files if needed)
```

## Creating Comparisons

To create side-by-side original vs bypassed comparisons, use Python with Pillow on the main PC:

```python
from PIL import Image, ImageDraw, ImageFont

# Load original and bypassed
img1 = Image.open(orig_path).convert('RGB')
img2 = Image.open(bypassed_path).convert('RGB')

# Resize to same height
target_h = 1080
w1 = int(img1.width * target_h / img1.height)
w2 = int(img2.width * target_h / img2.height)
img1 = img1.resize((w1, target_h), Image.LANCZOS)
img2 = img2.resize((w2, target_h), Image.LANCZOS)

# Side-by-side
result = Image.new('RGB', (w1 + w2, target_h))
result.paste(img1, (0, 0))
result.paste(img2, (w1, 0))

# Add labels
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 36)
draw = ImageDraw.Draw(result)
draw.text((20, 20), 'ORIGINAL', fill='white', font=font, stroke_width=3, stroke_fill='black')
draw.text((w1 + 20, 20), 'BYPASSED', fill='white', font=font, stroke_width=3, stroke_fill='black')

result.save(out_path, quality=95)
```

## GPU Status Check

If VAE stages are slow, verify CUDA:
```bash
ssh main "python -c 'import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))'"
```

If `torch.cuda.is_available()` is False, reinstall PyTorch with CUDA:
```bash
ssh main "python -m pip uninstall torch torchvision -y && python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126"
```

## Common Issues

| Issue | Fix |
|-------|-----|
| `UnicodeEncodeError` on `→` | Replace `\u2192` with `->` in dissolve_batch.py line ~169 |
| Spaces in Windows paths | Quote with single quotes inside double quotes: `"'D:/path/with spaces/file.webp'"` |
| VAE download timeout | First run only — cached to `~/.cache/huggingface/hub/` |
| Slow on CPU | Must use CUDA PyTorch; see GPU Status Check above |

## Calibration Loop (Advanced)

After running variants, test in Gemini app and record results:

1. Upload each output to Gemini, run SynthID detection
2. Create `tally.csv` with columns: `source,variant,still_watermarked` (y/n)
3. Run calibration:
```bash
ssh main "cd F:/specprojects/reverse-SynthID && python scripts/calibrate_from_feedback.py \
    --manifest <manifest.csv> --tally <tally.csv> \
    --codebook artifacts/spectral_codebook_v4.npz"
```
