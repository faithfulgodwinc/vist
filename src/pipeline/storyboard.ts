import { z } from "zod";
import { askJson } from "./meta";
import type { Exploration, Storyboard } from "./types";

const StoryboardSchema = z.object({
  hook: z.string(),
  cta: z.string(),
  scenes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        goal: z.string(),
        narration: z.string(),
      }),
    )
    .min(3)
    .max(8),
});

const INSTRUCTIONS = `You are Vist's director. You write storyboards for 60-90 second product demo videos, the kind founders post on Product Hunt and landing pages.
Structure: a hook that names the pain, then 4-6 scenes that each show ONE feature working, then a call to action.
Narration: confident, specific, benefit-first, second person ("you"). 15-30 words per scene. No buzzwords like "revolutionize", "seamless", "leverage".
The product is live: a goal may fill in a form to show it, but must end BEFORE any final submit, publish, payment or donation.
Never make signing up, logging in, or onboarding a scene: the agent is already signed in, and viewers want to see the product doing its job.
Each scene "goal" is an instruction for a browser agent that starts at the product's main screen. It must be concrete (which buttons, what sample text to type) and end in a visible result worth showing.`;

export async function writeStoryboard(exp: Exploration): Promise<Storyboard> {
  return askJson(StoryboardSchema, {
    instructions: INSTRUCTIONS,
    prompt: `Product: ${exp.brand.name} (${exp.brand.url})
Tagline: ${exp.brand.tagline}
Summary: ${exp.summary}
Main screen: ${exp.homeUrl}
Features found by the scout:
${exp.features.map((f, i) => `${i + 1}. ${f.name}: ${f.why}\n   How: ${f.howTo}`).join("\n")}

Return JSON: {"hook": "<one line, under 12 words>", "cta": "<under 8 words>", "scenes": [{"id": "s1", "title": "<2-4 words>", "goal": "...", "narration": "..."}]}`,
  });
}
