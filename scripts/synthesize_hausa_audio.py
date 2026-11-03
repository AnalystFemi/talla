import os
import json
import requests
import time

TOKEN = os.environ.get("TALLA_ENDPOINT_TOKEN") or os.environ.get("MODAL_ENDPOINT_TOKEN", "")
YARN_URL = "https://akinspajo--talla-yarngpt-speak-http.us-east.modal.run"
FILE_URL = "https://akinspajo--talla-stitch-file-http.us-east.modal.run"

manifest_path = r"C:\Users\DELL\Downloads\Talla\talla\data\hausa_storyboard\storyboard_manifest.json"
out_dir = r"C:\Users\DELL\Downloads\Talla\talla\data\hausa_storyboard"

with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = json.load(f)

headers = {
    "Content-Type": "application/json",
    "X-Talla-Token": TOKEN
}

results = []

for scene in manifest["scenes"]:
    n = scene["n"]
    text = scene["hausa"]
    print(f"\n[Scene {n}] Synthesizing TTS with YarnGPT...")
    print(f"Text: {text}")
    
    t0 = time.time()
    payload = {
        "text": text,
        "language": "hausa",
        "voice": "hausa_female2"
    }
    
    resp = requests.post(YARN_URL, json=payload, headers=headers, timeout=120)
    if resp.status_code != 200:
        print(f"Error ({resp.status_code}): {resp.text}")
        continue
        
    data = resp.json()
    vol_path = data.get("audio_volume_path")
    dur = data.get("duration_s")
    elapsed = time.time() - t0
    print(f"Done in {elapsed:.2f}s -> volume_path: {vol_path}, duration: {dur}s")
    
    # Download audio locally
    audio_local = os.path.join(out_dir, f"scene_{n}_audio.wav")
    file_resp = requests.get(f"{FILE_URL}?name={vol_path}", headers={"X-Talla-Token": TOKEN}, timeout=60)
    if file_resp.status_code == 200:
        with open(audio_local, "wb") as f_out:
            f_out.write(file_resp.content)
        print(f"Saved locally: {audio_local} ({len(file_resp.content)} bytes)")
    else:
        print(f"Failed to fetch audio file: {file_resp.status_code}")
        
    results.append({
        "n": n,
        "text": text,
        "volume_path": vol_path,
        "duration_s": dur,
        "local_path": audio_local
    })

results_path = os.path.join(out_dir, "hausa_audio_manifest.json")
with open(results_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("\nAll audio synthesized successfully!")
