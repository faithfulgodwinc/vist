import { log } from "./events";
import { createResponse, dataUrl } from "./meta";
import type { Driver } from "./browser";

// One previous_response_id chain holds at most 29 call/output pairs; stay well under it.
const MAX_CHAIN_STEPS = 26;
const WRAP_UP_STEPS_LEFT = 3;

const ENVIRONMENT_NOTE = `
Environment: you see only the web page itself. There is no address bar, no tabs and no browser menu,
so shortcuts like Ctrl+L, Ctrl+T or Ctrl+U do nothing. Navigate by clicking links and buttons on the page.
This is a live product with real users. Never pay, donate, or enter card details. Never publish, post, send,
or submit anything other people would see. You may open forms and fill them in to show how they work, but stop
before the final submit/publish/pay button.`;

export type TaskResult = { text: string; stopped: boolean };

// The Muse computer-use loop: screenshot in, actions out, until the model stops calling the tool.
export async function runComputerTask(opts: {
  driver: Driver;
  model: string;
  instructions: string;
  task: string;
  maxSteps: number;
  label: string;
  wrapUpNote?: string;
}): Promise<TaskResult> {
  const { driver, model } = opts;
  const tools = [{ type: "computer" }];
  const maxSteps = Math.min(opts.maxSteps, MAX_CHAIN_STEPS);
  let warnedSafety = false;

  let res: any = await createResponse({
    model,
    instructions: opts.instructions + ENVIRONMENT_NOTE,
    tools,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: `${opts.task}\n\nYou have at most ${maxSteps} turns.` },
          { type: "input_image", image_url: dataUrl(await driver.screenshot()) },
        ],
      },
    ],
  });

  for (let step = 1; step <= maxSteps; step++) {
    const call = (res.output ?? []).find((item: any) => item.type === "computer_call");
    if (!call) return { text: finalAnswer(res.output_text ?? ""), stopped: false };

    const actions: any[] = call.actions ?? (call.action ? [call.action] : []);
    log(`  [${opts.label}] step ${step}: ${actions.map(describe).join(", ")}`);

    // Vist only runs against the founder's own product with a test account, so we accept
    // safety checks; they are logged once per task for the job record.
    const checks = call.pending_safety_checks ?? [];
    if (checks.length && !warnedSafety) {
      warnedSafety = true;
      log(`  [${opts.label}] acknowledging safety checks: ${checks.map((c: any) => c.code).join(", ")}`);
    }

    await driver.execute(actions);

    const input: any[] = [
      {
        type: "computer_call_output",
        call_id: call.call_id,
        acknowledged_safety_checks: checks,
        output: { type: "computer_screenshot", image_url: dataUrl(await driver.screenshot()) },
      },
    ];
    const left = maxSteps - step;
    if (left === WRAP_UP_STEPS_LEFT || left === 0) {
      input.push({
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              left === 0
                ? `No turns left. Stop using the computer now. ${opts.wrapUpNote ?? "Give your final answer."}`
                : `Only ${left} turns left. Wrap up. ${opts.wrapUpNote ?? ""}`,
          },
        ],
      });
    }
    res = await createResponse({ model, previous_response_id: res.id, tools, input });
  }

  const call = (res.output ?? []).find((item: any) => item.type === "computer_call");
  return { text: finalAnswer(res.output_text ?? ""), stopped: Boolean(call) };
}

// Spark sometimes ends with a pseudo tool call instead of plain text:
// <x:invoke name="computer.stop"><x:parameter name="answer">...</x:parameter></x:invoke>
function finalAnswer(text: string) {
  const m = text.match(/<[\w:]*parameter name="answer">([\s\S]*?)<\/[\w:]*parameter>/);
  return (m ? m[1] : text).trim();
}

function describe(a: any) {
  switch (a.type) {
    case "click":
    case "double_click":
    case "move":
      return `${a.type}(${a.x},${a.y})`;
    case "type":
      return `type("${String(a.text).slice(0, 24)}")`;
    case "keypress":
      return `key(${(a.keys ?? [a.key]).join("+")})`;
    default:
      return a.type;
  }
}
