import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type { z } from "zod";

// Meta Model API is OpenAI-compatible; Responses API is required for computer use.
let client: OpenAI | null = null;
export function meta() {
  if (!client) {
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) throw new Error("MODEL_API_KEY is not set");
    client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey });
  }
  return client;
}

// As of 2026-10-31 the API rejects the computer tool on muse-wonder-1.0 for hackathon keys
// ("Unsupported tool type"), while muse-spark-1.3 accepts it. Set the env vars to switch back.
export const MODELS = {
  explorer: process.env.VIST_EXPLORE_MODEL ?? "muse-spark-1.3",
  shooter: process.env.VIST_SHOOT_MODEL ?? "muse-spark-1.3",
  director: process.env.VIST_DIRECTOR_MODEL ?? "muse-spark-1.3",
};

// USD per 1M tokens: [cached input, input, output] from dev.meta.ai/docs/pricing-rate-limits.
// Unknown models are priced as Wonder, the most expensive, so the budget errs on the safe side.
const PRICES: Record<string, [number, number, number]> = {
  "muse-wonder-1.0": [0.2, 4, 20],
  "muse-spark-1.3": [0.15, 1.25, 4.25],
};
const NO_USAGE_ESTIMATE_USD = 0.1;

// Hard spending cap shared by every run on this machine. The ledger persists across runs,
// and no request is sent once the total reaches the budget.
export const BUDGET_USD = Number(process.env.VIST_BUDGET_USD ?? 20);
const LEDGER = path.join(process.cwd(), "renders", "spend-ledger.json");

export class BudgetExceededError extends Error {}

function loadLedger(): { usd: number; calls: number } {
  try {
    return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch {
    return { usd: 0, calls: 0 };
  }
}

export const spend = { ...loadLedger(), run: 0 };

function assertBudget() {
  if (spend.usd >= BUDGET_USD) {
    throw new BudgetExceededError(
      `Budget reached: $${spend.usd.toFixed(2)} spent of $${BUDGET_USD}. Stopped before sending another request. ` +
        `Raise VIST_BUDGET_USD or reset ${LEDGER} to continue.`,
    );
  }
}

function trackUsage(model: string, res: any) {
  const price = PRICES[model] ?? PRICES["muse-wonder-1.0"];
  const u = res?.usage;
  let usd = NO_USAGE_ESTIMATE_USD;
  if (u) {
    const cached = u.input_tokens_details?.cached_tokens ?? 0;
    const fresh = (u.input_tokens ?? 0) - cached;
    usd = (cached * price[0] + fresh * price[1] + (u.output_tokens ?? 0) * price[2]) / 1e6;
  } else {
    console.warn(`  ! no usage data from ${model}; counting $${NO_USAGE_ESTIMATE_USD} to stay safe`);
  }
  charge(usd);
}

function charge(usd: number) {
  spend.usd += usd;
  spend.run += usd;
  spend.calls += 1;
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify({ usd: spend.usd, calls: spend.calls }, null, 2));
}

const IMAGE_USD = 0.01; // muse-image-1.0, per generated image

export async function generateImage(prompt: string, size = "1792x1024"): Promise<Buffer> {
  assertBudget();
  const res: any = await meta().images.generate({
    model: "muse-image-1.0",
    prompt,
    size,
    response_format: "b64_json",
    output_format: "png",
  } as any);
  charge(IMAGE_USD * (res.data?.length ?? 1));
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Muse Image returned no image");
  return Buffer.from(b64, "base64");
}

// Every model call goes through here so the budget is checked before and counted after.
export async function createResponse(params: Record<string, unknown> & { model: string }): Promise<any> {
  assertBudget();
  const res = await meta().responses.create(params as any);
  trackUsage(params.model, res);
  assertBudget();
  return res;
}

export function dataUrl(bytes: Buffer, mime = "image/jpeg") {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("No JSON found in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

// Ask a model for JSON matching `schema`, feeding validation errors back on retry.
export async function askJson<T>(
  schema: z.ZodType<T>,
  opts: { instructions: string; prompt: string; images?: Buffer[]; model?: string },
): Promise<T> {
  const content: any[] = [{ type: "input_text", text: opts.prompt }];
  for (const img of opts.images ?? []) content.push({ type: "input_image", image_url: dataUrl(img) });

  let input: any[] = [{ role: "user", content }];
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await createResponse({
      model: opts.model ?? MODELS.director,
      instructions: opts.instructions + "\nRespond with JSON only. No prose, no markdown.",
      input,
    });
    const text: string = res.output_text ?? "";
    try {
      return schema.parse(extractJson(text));
    } catch (err) {
      lastError = (err as Error).message;
      input = [
        ...input,
        { role: "assistant", content: text },
        { role: "user", content: `That was not valid. Error: ${lastError.slice(0, 500)}. Return corrected JSON only.` },
      ];
    }
  }
  throw new Error(`Model did not return valid JSON: ${lastError}`);
}
