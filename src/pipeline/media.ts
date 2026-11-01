import { spawn } from "node:child_process";

export const FPS = 30;

// Runs the ffmpeg/ffprobe binaries that ship with Remotion, so there is nothing extra to install.
function remotionTool(tool: "ffmpeg" | "ffprobe", args: string[]) {
  return run("npx", ["remotion", tool, ...args]);
}

export function run(cmd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const quoted = args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
    const proc = spawn(cmd, quoted, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${cmd} failed: ${stderr}`))));
  });
}

// Playwright records variable-frame-rate webm that can't be seeked frame-accurately,
// so re-encode to constant 30fps H.264 with frequent keyframes.
export async function toConstantFrameRate(input: string, output: string) {
  await remotionTool("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-r", String(FPS), "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", "15", "-bf", "0", "-pix_fmt", "yuv420p", "-an", output]);
}

export async function probeDurationMs(file: string) {
  const out = await remotionTool("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = parseFloat(out.trim().split(/\s+/).pop() ?? "");
  if (!Number.isFinite(seconds)) throw new Error(`Could not read duration of ${file}`);
  return seconds * 1000;
}
