import os
import subprocess

videos = [
    "final_1793697700_b1ad8cc9.mp4",
    "final_1793696559_bc23ce82.mp4",
    "final_1793695349_1cb1793b.mp4",
    "final_1793651985_24a5359c.mp4",
    "final_1793646153_f2252ced.mp4",
    "talk_1793697679_b2816235.mp4",
    "talk_1793696491_61905c03.mp4",
    "talk_1793695263_338965cd.mp4"
]

dest_dir = os.path.join("talla", "data", "renders")
os.makedirs(dest_dir, exist_ok=True)

env = os.environ.copy()
env["PYTHONIOENCODING"] = "utf-8"

for vid in videos:
    dest_path = os.path.join(dest_dir, vid)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"Already exists: {vid} ({os.path.getsize(dest_path)} bytes)")
        continue
    cmd = ["modal", "volume", "get", "--force", "talla-outputs", vid, dest_path]
    print(f"Downloading {vid}...")
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"Downloaded: {vid} ({os.path.getsize(dest_path)} bytes)")
    else:
        print(f"Failed {vid}: {res.stderr[:200]}")

print("Done downloading videos!")
