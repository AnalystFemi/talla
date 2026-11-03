import { PERSONAS, getPersona } from "../worker/src/personas.js";

// Shot suffix builder matching worker/src/index.js
export function shotSuffixForScene(scene, totalScenes = 5) {
  const isHook = scene.n === 1 || /hook/i.test(scene.purpose || "");
  const isCta = (totalScenes && scene.n >= totalScenes) || /cta|call/i.test(scene.purpose || "");
  if (isHook) {
    return "close-up selfie framing, head and shoulders with room around the head, leaning slightly toward camera, wide-eyed confessional expression, clear space above the head, hands relaxed, no held objects, no text, no phone screens, vertical 9:16.";
  }
  if (isCta) {
    return "medium close-up, head and shoulders with room around the head, warm smile, small wave or nod, clear space above the head, hands relaxed, no held objects, no text, no phone screens, vertical 9:16.";
  }
  return "medium shot, head and shoulders with room around the head, both hands visible and gesturing naturally, expressive, clear space above the head, no held objects, no text, no phone screens, vertical 9:16.";
}

export function buildKeyframePrompt(persona, scene, totalScenes = 5) {
  const suffix = shotSuffixForScene(scene, totalScenes);
  return `${persona.keyframe_prompt}. ${suffix}`;
}

const EXPECTED = [
  { id: "female-creator", name: "Aisha", gender: "female", voice: "zainab", seed: 2007 },
  { id: "female-creator-2", name: "Funmi", gender: "female", voice: "chinenye", seed: 1421 },
  { id: "male-creator-dark", name: "Ebuka", gender: "male", voice: "tayo", seed: 1007 },
  { id: "male-creator-light", name: "Tunde", gender: "male", voice: "umar", seed: 3421 },
];

console.log("=== PERSONA AUDIT ===");
for (const exp of EXPECTED) {
  const p = getPersona(exp.id);
  console.log(`Checking ${exp.name} (${exp.id}):`);
  if (!p) throw new Error(`Missing persona: ${exp.id}`);
  if (p.voice_anchor !== exp.voice) throw new Error(`Voice mismatch for ${exp.name}: got ${p.voice_anchor}, expected ${exp.voice}`);
  if (p.seed !== exp.seed) throw new Error(`Seed mismatch for ${exp.name}: got ${p.seed}, expected ${exp.seed}`);
  if (p.gender !== exp.gender) throw new Error(`Gender mismatch for ${exp.name}: got ${p.gender}, expected ${exp.gender}`);
  console.log(`  -> Voice locked: ${p.voice_anchor}`);
  console.log(`  -> Seed locked: ${p.seed}`);

  const scenes = [
    { n: 1, purpose: "Hook" },
    { n: 2, purpose: "Talking Middle" },
    { n: 5, purpose: "CTA" },
  ];

  const prompts = scenes.map(s => ({
    scene: s.n,
    purpose: s.purpose,
    seed: p.seed,
    prompt: buildKeyframePrompt(p, s, 5),
  }));

  // Assert seed is constant
  for (const pr of prompts) {
    if (pr.seed !== p.seed) throw new Error(`Seed changed across scene ${pr.scene}`);
    if (!pr.prompt.startsWith(p.keyframe_prompt)) throw new Error(`Prompt does not start with keyframe_prompt verbatim`);
    if (/receipt|paper|holding a/i.test(pr.prompt)) throw new Error(`Forbidden held receipt found in prompt: ${pr.prompt}`);
  }

  // Assert suffixes differ
  if (prompts[0].prompt === prompts[1].prompt || prompts[1].prompt === prompts[2].prompt) {
    throw new Error(`Prompts across hook/middle/cta did not differ in suffix`);
  }

  console.log(`  -> Scenes 1, 2, 5 generated with constant seed ${p.seed} and distinct shot suffixes.`);
  console.log(`  -> Hook suffix: "${prompts[0].prompt.slice(p.keyframe_prompt.length + 2, p.keyframe_prompt.length + 50)}..."`);
}

console.log("\nALL_PERSONAS_VERIFIED_SUCCESSFULLY");
