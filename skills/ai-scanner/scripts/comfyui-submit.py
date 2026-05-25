#!/usr/bin/env python3
"""ComfyUI workflow builder & job submitter.

Builds valid workflow JSON from discovered nodes/models,
submits to /prompt, polls /history, downloads results.

Usage:
  # List what's available
  python3 comfyui-submit.py --host http://120.240.155.198:8188 --list

  # Text-to-image (Flux/SDXL)
  python3 comfyui-submit.py --host http://120.240.155.198:8188 \
    --mode txt2img --prompt "a cat in space" --checkpoint flux1-dev-fp8.safetensors

  # Image-to-video
  python3 comfyui-submit.py --host http://120.240.155.198:8188 \
    --mode img2vid --image input.png --model wan2.2_i2v

  # Download results to a directory
  python3 comfyui-submit.py --host http://120.240.155.198:8188 \
    --mode txt2img --prompt "sunset over mountains" --output-dir ./generated
"""

import json, sys, os, time, argparse, urllib.request, urllib.error, base64, tempfile
from io import BytesIO


# ── helpers ──────────────────────────────────────────────────────────────

def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        # Handle huge responses
        return json.loads(raw.decode("utf-8", errors="replace"))

def post_json(url, data, timeout=15):
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def upload_image(host, image_path):
    """Upload an image to ComfyUI's /upload/image endpoint."""
    boundary = "----ComfyUIUploadBoundary"
    filename = os.path.basename(image_path)
    
    with open(image_path, "rb") as f:
        image_data = f.read()
    
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + image_data + f"\r\n--{boundary}--\r\n".encode()
    
    req = urllib.request.Request(
        f"{host}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


# ── node discovery ───────────────────────────────────────────────────────

def find_nodes(obj_info, *patterns):
    """Find node types matching any pattern (case-insensitive substring)."""
    found = {}
    for name in obj_info:
        nlower = name.lower()
        for pat in patterns:
            if pat.lower() in nlower and name not in found:
                found[name] = obj_info[name]
    return found

def find_checkpoints(host):
    """Get available checkpoints from /models/checkpoints."""
    try:
        models = get_json(f"{host}/models/checkpoints")
        if isinstance(models, list):
            return [m.get("name", m) if isinstance(m, dict) else m for m in models]
        return []
    except Exception:
        return []


# ── workflow builders ────────────────────────────────────────────────────

def build_txt2img(host, obj_info, checkpoint, prompt, negative, width, height, steps, cfg, seed):
    """Build a standard ComfyUI text-to-image workflow."""
    # Find required node types
    loader = find_nodes(obj_info, "checkpointloader", "loadcheckpoint")
    if not loader:
        # Try ComfyUI's load_diffusion_model + load_clip + load_vae separately
        loader = find_nodes(obj_info, "unetloader", "diffusionloader")
    
    clip_encode = find_nodes(obj_info, "cliptextencode", "cliptext")
    ksampler = find_nodes(obj_info, "ksampler")
    vae_decode = find_nodes(obj_info, "vaedecode")
    save_image = find_nodes(obj_info, "saveimage", "previewimage")
    latent_empty = find_nodes(obj_info, "emptylatentimage")
    
    clip_name = next(iter(clip_encode)) if clip_encode else "CLIPTextEncode"
    ksampler_name = next(iter(ksampler)) if ksampler else "KSampler"
    vae_name = next(iter(vae_decode)) if vae_decode else "VAEDecode"
    save_name = next(iter(save_image)) if save_image else "SaveImage"
    latent_name = next(iter(latent_empty)) if latent_empty else "EmptyLatentImage"
    
    # Check if we should use LoadDiffusionModel style (newer ComfyUI)
    use_new_loader = False
    loader_name = "CheckpointLoaderSimple"
    if loader:
        loader_name = next(iter(loader))
    if "unet" in loader_name.lower() or "diffusion" in loader_name.lower():
        use_new_loader = True
    
    wf = {}
    next_id = 1
    
    if use_new_loader:
        # New-style: separate UNET, CLIP, VAE loaders
        unet_id = next_id; next_id += 1
        clip_id = next_id; next_id += 1
        vae_loader_id = next_id; next_id += 1
        
        wf[str(unet_id)] = {
            "class_type": loader_name,
            "inputs": {"unet_name": checkpoint}
        }
        wf[str(clip_id)] = {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": checkpoint}
        }
        wf[str(vae_loader_id)] = {
            "class_type": "VAELoader",
            "inputs": {"vae_name": checkpoint}
        }
        model = [str(unet_id), 0]
        clip = [str(clip_id), 0]
        vae = [str(vae_loader_id), 0]
    else:
        # Classic CheckpointLoaderSimple
        ckpt_id = next_id; next_id += 1
        wf[str(ckpt_id)] = {
            "class_type": loader_name,
            "inputs": {"ckpt_name": checkpoint}
        }
        model = [str(ckpt_id), 0]
        clip = [str(ckpt_id), 1]
        vae = [str(ckpt_id), 2]
    
    # Positive prompt
    pos_id = next_id; next_id += 1
    wf[str(pos_id)] = {
        "class_type": clip_name,
        "inputs": {"text": prompt, "clip": clip}
    }
    
    # Negative prompt
    neg_id = next_id; next_id += 1
    wf[str(neg_id)] = {
        "class_type": clip_name,
        "inputs": {"text": negative, "clip": clip}
    }
    
    # Empty latent
    latent_id = next_id; next_id += 1
    wf[str(latent_id)] = {
        "class_type": latent_name,
        "inputs": {"width": width, "height": height, "batch_size": 1}
    }
    
    # KSampler
    ksampler_id = next_id; next_id += 1
    wf[str(ksampler_id)] = {
        "class_type": ksampler_name,
        "inputs": {
            "model": model,
            "positive": [str(pos_id), 0],
            "negative": [str(neg_id), 0],
            "latent_image": [str(latent_id), 0],
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0
        }
    }
    
    # VAE Decode
    vae_decode_id = next_id; next_id += 1
    wf[str(vae_decode_id)] = {
        "class_type": vae_name,
        "inputs": {
            "samples": [str(ksampler_id), 0],
            "vae": vae
        }
    }
    
    # Save image
    save_id = next_id; next_id += 1
    # Look up SaveImage node to see required inputs
    save_node_def = obj_info.get(save_name, {}).get("input", {}).get("required", {})
    save_inputs = {"images": [str(vae_decode_id), 0]}
    if "filename_prefix" in save_node_def:
        save_inputs["filename_prefix"] = "ComfyUI"
    wf[str(save_id)] = {
        "class_type": save_name,
        "inputs": save_inputs
    }
    
    return {"prompt": wf}


def build_img2vid(host, obj_info, image_path_or_name, model_hint, prompt, negative, 
                  width, height, length, steps, cfg, seed):
    """Build an image-to-video workflow."""
    
    # Find video nodes
    i2v_nodes = find_nodes(obj_info, "imagetovideo", "i2v", "image2video")
    load_image = find_nodes(obj_info, "loadimage")
    save_video = find_nodes(obj_info, "savevideo", "vhs_videocombine", "saveanimated")
    sampler = find_nodes(obj_info, "ksampler", "sampler")
    vae_decoder = find_nodes(obj_info, "vaedecode")
    
    if not i2v_nodes:
        # Try hunyuan / wan specific nodes
        i2v_nodes = find_nodes(obj_info, "hunyuanimage", "hunyuanvideoi2v", 
                               "bytedancei2v", "bytedanceimagetovideo",
                               "wani2v", "wanimage", "wanvideoi2v")
    
    if not i2v_nodes:
        print("Error: no image-to-video nodes found on this host", file=sys.stderr)
        print("Available video-related nodes:", file=sys.stderr)
        video_nodes = find_nodes(obj_info, "video", "i2v", "wan", "hunyuan", "bytedance")
        for name in sorted(video_nodes)[:30]:
            print(f"  {name}", file=sys.stderr)
        sys.exit(1)
    
    i2v_name = next(iter(i2v_nodes))
    load_name = next(iter(load_image)) if load_image else "LoadImage"
    save_name = next(iter(save_video)) if save_video else "VHS_VideoCombine"
    sampler_name = next(iter(sampler)) if sampler else "KSampler"
    vae_name = next(iter(vae_decoder)) if vae_decoder else "VAEDecode"
    
    wf = {}
    next_id = 1
    
    # Load image (either upload first or use existing name)
    image_filename = os.path.basename(image_path_or_name)
    
    # If it's a local file path, upload it first
    if os.path.isfile(image_path_or_name):
        result = upload_image(host, image_path_or_name)
        image_filename = result.get("name", image_filename)
        print(f"Uploaded: {image_filename}", file=sys.stderr)
    
    # Load image node
    img_id = next_id; next_id += 1
    wf[str(img_id)] = {
        "class_type": load_name,
        "inputs": {"image": image_filename}
    }
    
    # I2V node — try to match available model
    i2v_id = next_id; next_id += 1
    i2v_inputs = {"image": [str(img_id), 0]}
    
    # Check what inputs the I2V node expects
    node_def = obj_info.get(i2v_name, {})
    required_inputs = node_def.get("input", {}).get("required", {})
    
    # Add model/checkpoint if needed
    if "ckpt_name" in required_inputs or "model" in required_inputs:
        i2v_inputs["ckpt_name"] = model_hint if model_hint else ""
    if "prompt" in required_inputs:
        i2v_inputs["prompt"] = prompt
    if "negative_prompt" in required_inputs:
        i2v_inputs["negative_prompt"] = negative
    if "width" in required_inputs:
        i2v_inputs["width"] = width
    if "height" in required_inputs:
        i2v_inputs["height"] = height
    if "num_frames" in required_inputs:
        i2v_inputs["num_frames"] = length
    if "steps" in required_inputs:
        i2v_inputs["steps"] = steps
    if "cfg" in required_inputs:
        i2v_inputs["cfg"] = cfg
    if "seed" in required_inputs:
        i2v_inputs["seed"] = seed
    
    wf[str(i2v_id)] = {
        "class_type": i2v_name,
        "inputs": i2v_inputs
    }
    
    # Save output
    save_id = next_id; next_id += 1
    target_output = [str(i2v_id), 0]
    
    # Some nodes output latents, others output images directly
    # Try to detect from node output
    save_inputs = {}
    if "images" in (obj_info.get(save_name, {}).get("input", {}).get("required", {})):
        save_inputs["images"] = target_output
    else:
        save_inputs["filename_prefix"] = "ComfyUI"
    
    wf[str(save_id)] = {
        "class_type": save_name,
        "inputs": save_inputs
    }
    
    return {"prompt": wf}


# ── job management ───────────────────────────────────────────────────────

def submit_and_wait(host, workflow, output_dir=None, poll_interval=5, max_wait=600):
    """Submit workflow, poll /history until complete, download results."""
    
    # Submit
    print(f"Submitting workflow to {host}...", file=sys.stderr)
    try:
        result = post_json(f"{host}/prompt", workflow)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        print(f"Submit failed ({e.code}): {body}", file=sys.stderr)
        sys.exit(1)
    
    prompt_id = result.get("prompt_id")
    if not prompt_id:
        print(f"Unexpected response: {json.dumps(result, indent=2)}", file=sys.stderr)
        sys.exit(1)
    
    print(f"Submitted: {prompt_id}", file=sys.stderr)
    
    # Poll queue for status
    started = time.time()
    while time.time() - started < max_wait:
        try:
            queue = get_json(f"{host}/queue")
        except Exception as e:
            print(f"Queue poll error: {e}", file=sys.stderr)
            time.sleep(poll_interval)
            continue
        
        running = queue.get("queue_running", [])
        pending = queue.get("queue_pending", [])
        
        still_queued = any(p[1] == prompt_id for p in pending)
        is_running = any(p[1] == prompt_id for p in running)
        
        if not still_queued and not is_running:
            # Check history
            try:
                history = get_json(f"{host}/history/{prompt_id}")
            except Exception:
                time.sleep(poll_interval)
                continue
            
            if history and prompt_id in history:
                entry = history[prompt_id]
                status = entry.get("status", {})
                
                if status.get("completed") == True:
                    print(f"✓ Complete in {time.time() - started:.0f}s", file=sys.stderr)
                    
                    # Download outputs
                    outputs = entry.get("outputs", {})
                    downloaded = []
                    
                    if output_dir:
                        os.makedirs(output_dir, exist_ok=True)
                    
                    for node_id, node_output in outputs.items():
                        images = node_output.get("images", [])
                        gifs = node_output.get("gifs", [])
                        all_files = images + gifs
                        
                        for img_info in all_files:
                            img_name = img_info.get("filename", f"output_{node_id}")
                            img_type = img_info.get("type", "output")
                            subfolder = img_info.get("subfolder", "")
                            
                            dl_url = f"{host}/view"
                            params = f"filename={img_name}&type={img_type}"
                            if subfolder:
                                params += f"&subfolder={subfolder}"
                            
                            full_url = f"{dl_url}?{params}"
                            
                            try:
                                req = urllib.request.Request(full_url)
                                with urllib.request.urlopen(req, timeout=60) as r:
                                    data = r.read()
                                
                                out_path = os.path.join(output_dir, img_name) if output_dir else img_name
                                if output_dir:
                                    with open(out_path, "wb") as f:
                                        f.write(data)
                                    downloaded.append(out_path)
                                else:
                                    # Print base64 for piping
                                    print(json.dumps({
                                        "filename": img_name,
                                        "size_bytes": len(data),
                                        "base64": base64.b64encode(data).decode()
                                    }))
                            except Exception as e:
                                print(f"Download error ({img_name}): {e}", file=sys.stderr)
                    
                    print(json.dumps({
                        "prompt_id": prompt_id,
                        "status": "completed",
                        "elapsed_s": round(time.time() - started, 1),
                        "downloaded": downloaded
                    }))
                    return
                
                elif status.get("completed") == False:
                    error_msg = status.get("messages", [["unknown error"]])[-1]
                    print(f"✗ Failed: {error_msg}", file=sys.stderr)
                    sys.exit(1)
        else:
            elapsed = time.time() - started
            status_str = "running" if is_running else "queued"
            print(f"  [{status_str}] {elapsed:.0f}s elapsed...", end="\r", file=sys.stderr)
        
        time.sleep(poll_interval)
    
    print(f"Timed out after {max_wait}s", file=sys.stderr)
    sys.exit(1)


# ── list mode ─────────────────────────────────────────────────────────────

def list_resources(host):
    """Print what's available on this ComfyUI host."""
    print(f"=== ComfyUI: {host} ===\n")
    
    # System stats
    try:
        stats = get_json(f"{host}/system_stats", timeout=10)
        devices = stats.get("devices", [])
        if devices:
            print("GPUs:")
            for d in devices:
                name = d.get("name", "?")
                vram_total = d.get("vram_total") or d.get("torch_vram_total") or 0
                vram_free = d.get("vram_free") or d.get("torch_vram_free") or 0
                print(f"  {name}: {vram_total/1e9:.1f}GB total, {vram_free/1e9:.1f}GB free")
        system = stats.get("system", {})
        if system:
            ram = system.get("ram_total", 0)
            ram_free = system.get("ram_free", 0)
            print(f"  RAM: {ram/1e9:.1f}GB total, {ram_free/1e9:.1f}GB free")
        print()
    except Exception as e:
        print(f"  (system stats unavailable: {e})\n")
    
    # Models
    print("Checkpoints:")
    try:
        ckpts = find_checkpoints(host)
        for c in ckpts[:20]:
            print(f"  {c}")
        if len(ckpts) > 20:
            print(f"  ... and {len(ckpts) - 20} more")
    except Exception as e:
        print(f"  (error: {e})")
    print()
    
    # Object info summary
    print("Node types (by category):")
    try:
        obj_info = get_json(f"{host}/object_info", timeout=10)
        categories = {}
        for name, info in obj_info.items():
            cat = info.get("category", "other")
            categories.setdefault(cat, []).append(name)
        
        for cat in sorted(categories):
            nodes = categories[cat]
            print(f"  {cat}: {len(nodes)} nodes")
            for n in sorted(nodes)[:5]:
                print(f"    - {n}")
            if len(nodes) > 5:
                print(f"    ... and {len(nodes) - 5} more")
        print(f"\n  Total: {len(obj_info)} node types")
        
        # Check for interesting nodes
        video = find_nodes(obj_info, "video", "i2v", "t2v", "wan", "hunyuan", "bytedance")
        train = find_nodes(obj_info, "train", "lora")
        if video:
            print(f"\n  Video nodes ({len(video)}): {', '.join(sorted(video)[:10])}")
        if train:
            print(f"\n  Training nodes ({len(train)}): {', '.join(sorted(train)[:10])}")
    except Exception as e:
        print(f"  (error: {e})")
    
    # Queue status
    try:
        queue = get_json(f"{host}/queue")
        running = len(queue.get("queue_running", []))
        pending = len(queue.get("queue_pending", []))
        print(f"\nQueue: {running} running, {pending} pending")
    except Exception:
        pass


# ── main ──────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="ComfyUI workflow builder & submitter")
    p.add_argument("--host", required=True, help="ComfyUI base URL (e.g. http://1.2.3.4:8188)")
    p.add_argument("--list", action="store_true", help="List available models/nodes/GPUs")
    
    p.add_argument("--mode", choices=["txt2img", "img2vid"], help="Generation mode")
    p.add_argument("--prompt", default="", help="Positive prompt")
    p.add_argument("--negative", default="blurry, low quality, distorted", help="Negative prompt")
    p.add_argument("--checkpoint", default="", help="Checkpoint name for txt2img")
    p.add_argument("--model", default="", help="Model hint for img2vid")
    p.add_argument("--image", default="", help="Input image path for img2vid")
    
    p.add_argument("--width", type=int, default=1024, help="Output width (default: 1024)")
    p.add_argument("--height", type=int, default=1024, help="Output height (default: 1024)")
    p.add_argument("--steps", type=int, default=20, help="Sampling steps (default: 20)")
    p.add_argument("--cfg", type=float, default=7.0, help="CFG scale (default: 7.0)")
    p.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    p.add_argument("--length", type=int, default=81, help="Video frame count (default: 81)")
    
    p.add_argument("--output-dir", default="", help="Directory to download outputs")
    p.add_argument("--timeout", type=int, default=600, help="Max wait for job (default: 600s)")
    p.add_argument("--poll", type=int, default=5, help="Poll interval in seconds (default: 5)")
    
    args = p.parse_args()
    host = args.host.rstrip("/")
    
    # Validate host
    try:
        get_json(f"{host}/system_stats", timeout=10)
    except Exception as e:
        print(f"Cannot reach ComfyUI at {host}: {e}", file=sys.stderr)
        sys.exit(1)
    
    if args.list:
        list_resources(host)
        return
    
    if not args.mode:
        p.error("--mode is required (or use --list)")
    
    # Get object info (can be huge — 2.5MB+ on large installs)
    # Try cache first, then fetch with long timeout
    obj_info_path = os.path.join(tempfile.gettempdir(), f"comfyui_obj_info_{host.replace('://','_').replace(':','_').replace('/','')}.json")
    obj_info = None
    if os.path.exists(obj_info_path):
        try:
            mtime = os.path.getmtime(obj_info_path)
            if time.time() - mtime < 3600:  # 1 hour cache
                with open(obj_info_path) as f:
                    obj_info = json.load(f)
        except Exception:
            pass
    if obj_info is None:
        try:
            print(f"Fetching /object_info (this may take 60-120s for large installs)...", file=sys.stderr)
            obj_info = get_json(f"{host}/object_info", timeout=120)
            with open(obj_info_path, "w") as f:
                json.dump(obj_info, f)
        except Exception as e:
            print(f"Warning: /object_info failed ({e}), using blind fallback", file=sys.stderr)
            obj_info = {}
    
    if args.mode == "txt2img":
        if not args.prompt:
            p.error("--prompt is required for txt2img")
        if not args.checkpoint:
            # Auto-detect first available checkpoint
            ckpts = find_checkpoints(host)
            if ckpts:
                args.checkpoint = ckpts[0]
                print(f"Auto-detected checkpoint: {args.checkpoint}", file=sys.stderr)
            else:
                p.error("--checkpoint required (no checkpoints auto-detected)")
        
        wf = build_txt2img(host, obj_info, args.checkpoint, args.prompt, args.negative,
                          args.width, args.height, args.steps, args.cfg, args.seed)
    
    elif args.mode == "img2vid":
        if not args.image:
            p.error("--image is required for img2vid")
        if not args.model:
            args.model = "wan2.2_i2v"  # default hint
        
        wf = build_img2vid(host, obj_info, args.image, args.model, args.prompt, args.negative,
                          args.width, args.height, args.length, args.steps, args.cfg, args.seed)
    
    else:
        p.error(f"Unknown mode: {args.mode}")
    
    submit_and_wait(host, wf, args.output_dir, args.poll, args.timeout)


if __name__ == "__main__":
    main()
