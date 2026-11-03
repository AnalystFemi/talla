import re

with open('talla/web/src/api.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the last two lines
pattern = r"// Worker media paths[\s\S]*"
replacement = """// Worker media paths (/api/media/file/..., /api/media/r2/...) live on the API origin.
export const mediaUrl = (u) => {
  if (typeof u !== "string" || !u) return "";
  if (u.startsWith("/api/")) return API + u;
  if (u.startsWith("modal-volume://")) {
    const filename = u.split("/").pop();
    return `${API}/api/media/file/${filename}`;
  }
  return u;
};
export const isPlayable = (u) => {
  if (typeof u !== "string" || !u) return false;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/api/") || u.startsWith("blob:") || u.startsWith("data:")) return true;
  if (u.startsWith("modal-volume://")) {
    const ext = u.split(".").pop()?.toLowerCase();
    return ["mp4", "webm", "wav", "mp3", "jpg", "jpeg", "png", "webp"].includes(ext);
  }
  return false;
};
"""

text = re.sub(pattern, replacement, text)
with open('talla/web/src/api.js', 'w', encoding='utf-8') as f:
    f.write(text)
print("api.js updated successfully")
