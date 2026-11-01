import { loadFont as bricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as dmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as dmSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as fraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as instrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as jetbrains } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";
import { loadFont as nunito } from "@remotion/google-fonts/Nunito";
import { loadFont as outfit } from "@remotion/google-fonts/Outfit";
import { loadFont as playfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as sora } from "@remotion/google-fonts/Sora";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as syne } from "@remotion/google-fonts/Syne";
import { loadFont as unbounded } from "@remotion/google-fonts/Unbounded";
import type { FontName } from "../pipeline/types";

type Loader = (style?: any, options?: any) => { fontFamily: string };

// Each font with the weights we load and the weight headlines use.
const FONTS: Record<FontName, { load: Loader; weights: string[]; heavy: number }> = {
  Inter: { load: inter, weights: ["400", "500", "600", "800"], heavy: 800 },
  "Space Grotesk": { load: spaceGrotesk, weights: ["400", "500", "700"], heavy: 700 },
  Manrope: { load: manrope, weights: ["400", "600", "800"], heavy: 800 },
  "DM Sans": { load: dmSans, weights: ["400", "500", "800"], heavy: 800 },
  Sora: { load: sora, weights: ["400", "600", "800"], heavy: 800 },
  Outfit: { load: outfit, weights: ["400", "600", "800"], heavy: 800 },
  Nunito: { load: nunito, weights: ["400", "600", "800"], heavy: 800 },
  Poppins: { load: poppins, weights: ["400", "500", "800"], heavy: 800 },
  "Playfair Display": { load: playfair, weights: ["400", "600", "800"], heavy: 800 },
  Fraunces: { load: fraunces, weights: ["400", "600", "800"], heavy: 800 },
  "DM Serif Display": { load: dmSerif, weights: ["400"], heavy: 400 },
  "Instrument Serif": { load: instrumentSerif, weights: ["400"], heavy: 400 },
  Syne: { load: syne, weights: ["400", "600", "800"], heavy: 800 },
  Unbounded: { load: unbounded, weights: ["400", "600", "800"], heavy: 800 },
  "Bricolage Grotesque": { load: bricolage, weights: ["400", "600", "800"], heavy: 800 },
  "JetBrains Mono": { load: jetbrains, weights: ["400", "700"], heavy: 700 },
};

const loaded = new Map<FontName, string>();

// Loads only the fonts an ad actually uses; Remotion waits for them before rendering frames.
export function font(name: FontName) {
  const entry = FONTS[name] ?? FONTS.Inter;
  if (!loaded.has(name)) {
    const { fontFamily } = entry.load("normal", { weights: entry.weights, subsets: ["latin"] });
    loaded.set(name, fontFamily);
  }
  return { family: `'${loaded.get(name)}', 'Segoe UI', sans-serif`, heavy: entry.heavy };
}
