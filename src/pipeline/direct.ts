import fs from "node:fs/promises";
import { z } from "zod";
import { askJson, generateImage } from "./meta";
import { FONT_NAMES, type AdScript, type AdShot, type Exploration, type Score, type Storyboard, type StyleKit, type Take } from "./types";

const energy = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const beats = z.number().int().min(2).max(16);

const ShotSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), beats, energy, lines: z.array(z.string()).min(1).max(3) }),
  z.object({ kind: z.literal("clip"), beats, energy, sceneId: z.string(), caption: z.string(), sub: z.string() }),
  z.object({ kind: z.literal("stat"), beats, energy, value: z.string(), label: z.string() }),
  z.object({ kind: z.literal("features"), beats, energy, items: z.array(z.string()).min(2).max(5) }),
  z.object({ kind: z.literal("logo"), beats, energy, tagline: z.string() }),
]);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const StyleSchema = z.object({
  theme: z.enum(["dark", "light", "brand"]),
  palette: z.object({ primary: hex, secondary: hex, background: hex, ink: hex, muted: hex }),
  displayFont: z.enum(FONT_NAMES),
  bodyFont: z.enum(FONT_NAMES),
  caps: z.boolean(),
  motion: z.enum(["snappy", "smooth", "bouncy"]),
  align: z.enum(["center", "left"]),
  frame: z.enum(["browser", "floating", "bleed"]),
  backdrop: z.enum(["glow", "grid", "mesh", "image", "solid"]),
  imagePrompt: z.string(),
  radius: z.number().min(0).max(40),
});

const AdScriptSchema = z.object({
  mood: z.string(),
  bpm: z.number().int().min(70).max(140),
  style: StyleSchema,
  shots: z.array(ShotSchema).min(5).max(18),
});

const DIRECTOR = `You are Vist's creative director. You turn a product into a 40-65 second motion-graphics launch ad, the kind startups post on X and Product Hunt.
The ad is cut to music, so every shot is measured in beats. Think Apple / Linear / Arc launch films: bold kinetic type, confident pacing, real product moments.

Shot kinds:
- "text": kinetic typography. 1-3 lines, max 5 words per line. Punchy, specific, no buzzwords ("revolutionize", "seamless", "leverage", "unlock").
- "clip": a real product moment. sceneId MUST be one of the available scenes. caption: max 4 words. sub: max 9 words, the benefit.
- "stat": one real number you can SEE in the screenshots (never invent numbers). value like "$3.4K", label max 5 words.
- "features": 3-4 short items (max 3 words each) that pop in one by one.
- "logo": the final card with the product name; tagline max 7 words. Always the last shot.

Structure: hook (1-2 text shots naming the tension) -> turn ("Meet <name>.") -> hero moments (clips, with text or stat shots between) -> features recap -> logo.
Beats: text 4-8, clip 8-16, stat 4-6, features 8-12, logo 8. Use even numbers.
Energy (0-3) drives the music: start at 1, rise to 3 on the first hero clip, keep 2-3 through the middle, 2 on the logo.
bpm: 85-100 for warm or heartfelt products, 105-118 for productivity, 120-128 for bold or energetic ones.

You also design the ad's style kit so it looks like THIS brand and no other. Derive it from the screenshots and the product's personality:
- theme: "light" for friendly, clean, human or wellness brands; "dark" for dev tools, fintech, premium or night-mode brands; "brand" to flood the background with the brand colour when it is bold.
- palette (#rrggbb): primary = the product's main brand colour from the screenshots (never black, white or grey); secondary = a complementary colour from the product or a harmonious partner; background matches the theme (light: near-white, tinted; dark: near-black, tinted; brand: a deep or vivid brand shade); ink = headline colour with strong contrast on background; muted = softer text colour.
- displayFont / bodyFont: pick a pairing with character. Geometric tech: "Space Grotesk", "Sora", "Unbounded", "Syne". Friendly/rounded: "Nunito", "Outfit", "Poppins". Clean product: "Inter", "Manrope", "DM Sans". Editorial/premium/emotional: "Playfair Display", "Fraunces", "DM Serif Display", "Instrument Serif" (display only, pair with a sans body). Expressive: "Bricolage Grotesque". Developer: "JetBrains Mono" as body or display.
- caps: true only for bold, loud brands.
- motion: "snappy" (tech, productivity, energy), "smooth" (premium, calm, wellness, finance), "bouncy" (playful consumer, social, kids).
- align: "left" for editorial/serious, "center" for bold/punchy.
- frame: how product footage is shown. "browser" (classic window, tilted), "floating" (chromeless card floating in space, premium), "bleed" (huge, edge-to-edge, confident).
- backdrop: "image" when the brand has a strong mood that art can express (then write imagePrompt), else "glow", "mesh", "grid" (technical) or "solid" (minimal).
- imagePrompt: abstract background art for Muse Image that expresses the brand's mood in its palette, e.g. "soft morning light through layered paper shapes, warm greens and cream". Never text, logos, UI or faces. Write it even if backdrop is not "image".
- radius: 0-8 sharp/serious, 14-24 modern, 28-40 soft/friendly.`;

export async function writeAdScript(
  exp: Exploration,
  board: Storyboard,
  takes: Take[],
  homeShot?: string,
): Promise<AdScript> {
  const usable = takes.filter((t) => t.verified);
  const scenes = board.scenes.filter((s) => usable.some((t) => t.sceneId === s.id));
  if (!scenes.length) throw new Error("No approved product footage to build an ad from");
  const images = await Promise.all(usable.slice(0, 4).map((t) => fs.readFile(t.endShot)));
  const home = homeShot ? await fs.readFile(homeShot).catch(() => null) : null;
  if (home) images.push(home);

  const script = await askJson(AdScriptSchema, {
    instructions: DIRECTOR,
    images,
    prompt: `Product: ${exp.brand.name} (${exp.brand.url})
What it is: ${exp.summary}
Features the scout found:
${exp.features.map((f) => `- ${f.name}: ${f.why}`).join("\n")}

Available product footage (use these sceneIds for clip shots):
${scenes.map((s) => `- ${s.id} "${s.title}": ${s.narration}`).join("\n")}

The attached images are the final frames of those clips, in the same order${home ? ", then the product's main screen (the best place to find real numbers for stat shots)" : ""}.
For stat shots prefer product-wide numbers (totals, users, money raised) over a single form value.
Return {"mood": "<3-6 words>", "bpm": <int>, "style": {...}, "shots": [...]}.`,
  });
  script.style = ensureContrast(script.style);

  // Keep only clips we actually have, and end on a full bar so the music resolves cleanly.
  const valid = new Set(scenes.map((s) => s.id));
  const shots = script.shots.filter((s) => s.kind !== "clip" || valid.has(s.sceneId)) as AdShot[];
  if (shots[shots.length - 1]?.kind !== "logo") {
    shots.push({ kind: "logo", beats: 8, energy: 2, tagline: exp.brand.tagline || exp.summary.split(".")[0] });
  }
  const total = shots.reduce((n, s) => n + s.beats, 0);
  shots[shots.length - 1].beats += (4 - (total % 4)) % 4;
  return { ...script, shots };
}

function luminance(hexColor: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hexColor.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The model sometimes picks a stylish but unreadable pairing; keep headlines legible.
function ensureContrast(style: StyleKit): StyleKit {
  const bgIsDark = luminance(style.palette.background) < 0.25;
  const palette = { ...style.palette };
  if (contrast(palette.ink, palette.background) < 7) palette.ink = bgIsDark ? "#f7f7fa" : "#0d0d12";
  if (contrast(palette.muted, palette.background) < 3.5) palette.muted = bgIsDark ? "#b4b4c6" : "#55556a";
  return { ...style, palette };
}

// Muse Image paints a backdrop unique to this product's mood and palette.
export async function paintBackdrop(style: StyleKit, outFile: string) {
  const { primary, secondary, background } = style.palette;
  const png = await generateImage(
    `Abstract background artwork for a product launch film: ${style.imagePrompt}. ` +
      `Colour palette built from ${primary}, ${secondary} and ${background}. ` +
      "Wide cinematic composition, soft depth, calm empty centre area. No text, no letters, no logos, no user interface, no people.",
  );
  await fs.writeFile(outFile, png);
  return outFile;
}

const step16 = z.string().regex(/^[x.]{16}$/, "16 characters of x and .");
const PatternSchema = z.object({ kick: step16, snare: step16, hat: step16, bass: step16, arp: z.boolean() });
const ScoreSchema = z.object({
  sound: z.object({
    kit: z.enum(["punchy", "808", "soft", "lofi"]),
    lead: z.enum(["pluck", "piano", "bell", "saw"]),
    pad: z.enum(["warm", "airy", "dark"]),
    swing: z.number().min(0).max(0.3),
  }),
  key: z.string().regex(/^[A-G][#b]?$/),
  scale: z.enum(["major", "minor"]),
  progression: z.array(z.string().regex(/^[A-G][#b]?(m|maj7|m7|7|sus2|sus4|add9)?$/)).min(2).max(8),
  patterns: z.object({ "0": PatternSchema, "1": PatternSchema, "2": PatternSchema, "3": PatternSchema }),
  padBrightness: z.number().min(0).max(1),
});

const COMPOSER = `You are Vist's composer. You write the backing track for a motion-graphics ad as a compact score that a synthesizer will play.
The track has pads, a bassline, drums and an optional arpeggio. It must feel modern and polished, never busy.
Drum and bass patterns are 16 steps per bar (16th notes): "x" = hit, "." = rest.
Energy levels: 0 = near silence (pads only, empty drums), 1 = intro (soft kick or none, light hats), 2 = groove (full beat, bass), 3 = peak (driving hats, busier bass, arp on).
Chords: one per bar, looped. Use chord names like "Am", "F", "C", "G", "Dm7", "Cmaj7", "Esus4". 4-chord loops work best.
Match the mood: warm/hopeful -> major or gentle minor, 4-on-the-floor only at higher energy; bold/tech -> minor, punchy kick, offbeat hats.

Choose the sound palette so the track belongs to this brand:
- kit: "punchy" (clean modern electronic), "808" (deep booming trap/hip-hop kick, claps, for bold consumer or creator brands), "soft" (gentle kick, rimshot, shaker: warm, human, wellness, nonprofit), "lofi" (dusty, muffled, swung: creative, cozy, indie).
- lead (plays the arpeggio): "pluck" (crisp electronic), "piano" (warm, human, emotional), "bell" (sparkly, magical, premium), "saw" (bright energetic synth lead).
- pad: "warm" (rich analog), "airy" (light, open, hopeful), "dark" (moody, low, serious).
- swing: 0 for straight electronic, 0.08-0.15 for human groove, 0.18-0.28 for lofi/hip-hop bounce.`;

export async function composeScore(script: AdScript): Promise<Score> {
  const arc = script.shots.map((s) => `${s.kind}(${s.beats} beats, energy ${s.energy})`).join(" -> ");
  return askJson(ScoreSchema, {
    instructions: COMPOSER,
    prompt: `Ad mood: ${script.mood}
Visual style: ${script.style.theme} theme, ${script.style.motion} motion, ${script.style.displayFont} headlines
Tempo: ${script.bpm} BPM
Shot sequence: ${arc}

Return {"sound": {"kit": "soft", "lead": "piano", "pad": "airy", "swing": 0.1}, "key": "A", "scale": "minor", "progression": ["Am","F","C","G"],
 "patterns": {"0": {"kick": "................", "snare": "................", "hat": "................", "bass": "................", "arp": false}, "1": {...}, "2": {...}, "3": {...}},
 "padBrightness": 0.5}`,
  });
}
