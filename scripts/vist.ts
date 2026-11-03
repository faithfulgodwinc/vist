// URL in, launch ad out, from the terminal. Each stage caches its result in renders/<job>/,
// so --fresh=<stage> re-runs from that stage without paying for earlier ones.
//
//   npm run vist -- --url https://app.example.com
//   npm run vist -- --url https://app.example.com --fresh=direct --format=9:16
import { parseArgs } from "node:util";
import type { Stage } from "../src/pipeline/events";
import { BudgetExceededError } from "../src/pipeline/meta";
import { runJob } from "../src/pipeline/run";
import type { Format } from "../src/pipeline/types";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    job: { type: "string" },
    fresh: { type: "string" },
    scene: { type: "string" },
    format: { type: "string" },
  },
});
if (!values.url) throw new Error("--url is required");

runJob({
  url: values.url,
  jobId: values.job,
  email: values.email,
  password: values.password,
  fresh: values.fresh as Stage | undefined,
  scene: values.scene,
  format: values.format as Format | undefined,
}).catch((err) => {
  if (err instanceof BudgetExceededError) {
    console.error(`\n⛔ ${err.message}`);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
