// Avatar portraits for the Studio creator cards (user request 2026-11-01:
// 2 female + 2 male, all named; Funmi v5 stays locked, the other three are
// regenerated clean — no baked text, correct gender, talk-ready framing).
//
//   node scripts/gen_avatars.mjs [--only=aisha,tunde] [--n=2]
//
// Spends Muse Image calls (a few cents each). Writes data/<name>_avatar_<i>.webp
// candidates for the user to approve; nothing is wired in automatically.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { museImage, modalImage } from "../worker/src/providers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const FRAME = "Vertical 9:16 selfie-style UGC portrait, medium shot from mid-chest up, face centred and facing the camera, relaxed closed-mouth smile, clear space above the head, both hands out of frame, photorealistic smartphone photo, natural skin texture, soft daylight. No text, no captions, no logos, no phones, no watermarks.";

export const AVATARS = {
  funmi: "Light-skinned fair complexion, pale golden-beige skin. Funmi, a mixed-race woman of Yoruba Nigerian heritage in her late 20s, light caramel skin, distinctly West African facial features, full lips, long black knotless braids falling over one shoulder, natural glam makeup, glossy lips, small gold hoop earrings, warm confident smile, elegant cream satin blouse, adult woman. Background: bright upscale Lagos apartment, warm wood shelves and soft lamp light softly blurred.",
  aisha: "Aisha, a Nigerian Hausa woman in her late 20s, deep rich brown skin, elegant emerald silk headscarf neatly wrapped, small gold stud earrings, natural glam makeup, graceful warm expression, wearing a modest cream kaftan top, adult woman. Background: bright modern Abuja apartment, beige sofa and green plants softly blurred.",
  ebuka: "Ebuka, a dark-skinned Nigerian Igbo MAN in his early 30s, deep rich brown skin, masculine face, strong jawline, broad shoulders, short black fade haircut, neat short black beard, confident warm smile, plain fitted navy crew-neck tee, adult male, not female, not feminine. Background: tidy modern Lagos apartment, light-grey wall and a bookshelf softly blurred.",
  tunde: "Light-skinned fair complexion, pale golden-beige skin. Tunde, a mixed-race MAN of Yoruba Nigerian heritage in his late 20s, light caramel skin, masculine face, defined jawline, short black waves haircut, light stubble beard, friendly confident smile, crisp white open-collar shirt, adult male, not female, not feminine, no braids, no long hair. Background: bright modern Lagos apartment, cream sofa and framed wall art softly blurred.",
};

const only = ((process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "").split(",").filter(Boolean);
const seedBase = Number((process.argv.find((a) => a.startsWith("--seed=")) || "--seed=7").split("=")[1]);
const n = Number((process.argv.find((a) => a.startsWith("--n=")) || "--n=2").split("=")[1]);
for (const [name, who] of Object.entries(AVATARS)) {
  if (only.length && !only.includes(name)) continue;
  for (let i = 1; i <= n; i++) {
    const t = Date.now();
    try {
      // --muse forces Meta Muse; default is the Modal open model (Muse 402s).
      const out = process.argv.includes("--muse")
        ? await museImage(env, `${who} ${FRAME}`)
        : await modalImage(env, `${who} ${FRAME}`, { seed: 1000 * i + seedBase });
      const file = join(root, "data", `${name}_avatar_${i}.webp`);
      if (out.startsWith("data:")) writeFileSync(file, Buffer.from(out.split(",").pop(), "base64"));
      else writeFileSync(file, Buffer.from(await (await fetch(out)).arrayBuffer()));
      console.log(`${name} #${i} -> ${file} (${Math.round((Date.now() - t) / 1000)}s)`);
    } catch (e) { console.log(`${name} #${i} FAILED: ${e.message}`); }
  }
}
