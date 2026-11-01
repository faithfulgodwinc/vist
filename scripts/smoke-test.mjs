// Smoke test for the Meta Model API. Run: node --env-file=.env scripts/smoke-test.mjs
const BASE = "https://api.meta.ai/v1";
const key = process.env.MODEL_API_KEY;
if (!key) throw new Error("MODEL_API_KEY is not set in .env");

const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function call(name, path, body) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, {
      method: body ? "POST" : "GET",
      headers,
      body: body && JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    const ms = Date.now() - started;
    if (!res.ok) {
      console.log(`✗ ${name} (${res.status}, ${ms}ms): ${JSON.stringify(json).slice(0, 300)}`);
      return null;
    }
    console.log(`✓ ${name} (${ms}ms)`);
    return json;
  } catch (err) {
    console.log(`✗ ${name}: ${err.message}`);
    return null;
  }
}

const models = await call("list models", "/models");
if (models?.data) console.log("  ", models.data.map((m) => m.id).join(", "));

for (const model of ["muse-spark-1.3", "muse-wonder-1.0"]) {
  const r = await call(`${model} responses`, "/responses", {
    model,
    input: "In one sentence, pitch a product that turns a URL into a launch video.",
  });
  if (r) console.log("  ", r.output_text ?? JSON.stringify(r.output).slice(0, 200));
}

// Computer-use handshake: just checks the tool is accepted (no screenshot yet).
const cu = await call("muse-wonder-1.0 computer tool accepted", "/responses", {
  model: "muse-wonder-1.0",
  tools: [{ type: "computer" }],
  input: "Reply 'ready' without taking any action.",
});
if (cu) console.log("  ", cu.output_text ?? JSON.stringify(cu.output).slice(0, 200));
