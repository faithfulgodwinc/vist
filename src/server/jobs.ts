import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setSink, type Stage, type VistEvent } from "../pipeline/events";
import { jobPaths } from "../pipeline/job";
import { runJob, type Direction } from "../pipeline/run";
import type { Format } from "../pipeline/types";

export type JobStatus = "queued" | "running" | "done" | "error";
type StoredEvent = Exclude<VistEvent, { type: "frame" }>;

export type Job = {
  id: string;
  url: string;
  status: JobStatus;
  createdAt: number;
  events: StoredEvent[];
  frame: Buffer | null;
  frameCount: number;
  videos: Partial<Record<Format, string>>;
  listeners: Set<(event: StoredEvent | { type: "frame"; count: number } | { type: "status"; status: JobStatus }) => void>;
};

type Task = { job: Job; fresh?: Stage; format: Format; email?: string; password?: string };

// Survives Next.js hot reloads in development.
const store = globalThis as unknown as { vistJobs?: Map<string, Job>; vistQueue?: Task[]; vistBusy?: boolean };
const jobs = (store.vistJobs ??= new Map());
const queue = (store.vistQueue ??= []);

export const ROOT = process.cwd();

export function getJob(id: string) {
  return jobs.get(id);
}

function setStatus(job: Job, status: JobStatus) {
  job.status = status;
  for (const l of job.listeners) l({ type: "status", status });
}

function publish(job: Job, event: VistEvent) {
  if (event.type === "frame") {
    job.frame = event.jpeg;
    job.frameCount++;
    for (const l of job.listeners) l({ type: "frame", count: job.frameCount });
    return;
  }
  job.events.push(event);
  for (const l of job.listeners) l(event);
}

// One job at a time: protects the worker's memory and the API budget.
async function pump() {
  if (store.vistBusy) return;
  const task = queue.shift();
  if (!task) return;
  store.vistBusy = true;
  const { job } = task;
  setStatus(job, "running");
  setSink((event) => publish(job, event));
  try {
    const { out } = await runJob({
      url: job.url,
      jobId: job.id,
      fresh: task.fresh,
      format: task.format,
      email: task.email,
      password: task.password,
      root: ROOT,
    });
    job.videos[task.format] = out;
    setStatus(job, "done");
  } catch (err) {
    setStatus(job, "error");
    publish(job, { type: "error", message: (err as Error).message });
  } finally {
    setSink(null);
    store.vistBusy = false;
    void pump();
  }
}

function enqueue(task: Task) {
  queue.push(task);
  if (queue.length > 1 || store.vistBusy) {
    publish(task.job, { type: "log", text: `Queued behind ${queue.length - 1 + (store.vistBusy ? 1 : 0)} other ad(s)…` });
  }
  void pump();
}

export async function createJob(opts: { url: string; sessionFile?: string; email?: string; password?: string; seedFrom?: string }) {
  const host = new URL(opts.url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
  const id = `${host}-${randomBytes(3).toString("hex")}`;
  const { workDir, statePath } = jobPaths(opts.url, id, ROOT);
  await fs.mkdir(workDir, { recursive: true });
  if (opts.sessionFile) await fs.copyFile(opts.sessionFile, statePath);
  // Development only: start from another job's cached stages to test the studio without API spend.
  if (opts.seedFrom && process.env.NODE_ENV !== "production") {
    const from = path.join(ROOT, "renders", opts.seedFrom.replace(/[^a-z0-9-]/gi, ""));
    for (const name of ["explore.json", "storyboard.json", "shoot.json", "direct.json", "home.jpg", "backdrop.png", "state.json"]) {
      await fs.copyFile(path.join(from, name), path.join(workDir, name)).catch(() => {});
    }
  }

  const job: Job = { id, url: opts.url, status: "queued", createdAt: Date.now(), events: [], frame: null, frameCount: 0, videos: {}, listeners: new Set() };
  jobs.set(id, job);
  enqueue({ job, format: "16:9", email: opts.email, password: opts.password });
  return job;
}

export function workDirOf(job: Job) {
  return jobPaths(job.url, job.id, ROOT).workDir;
}

export async function readDirection(job: Job): Promise<Direction> {
  return JSON.parse(await fs.readFile(path.join(workDirOf(job), "direct.json"), "utf8"));
}

// Saves the user's edits to the script/style and re-cuts the ad from the edit stage (no new API calls).
export async function rerender(job: Job, direction?: Direction, format: Format = "16:9") {
  if (job.status === "running" || job.status === "queued") throw new Error("This ad is still being made");
  if (direction) await fs.writeFile(path.join(workDirOf(job), "direct.json"), JSON.stringify(direction, null, 2));
  if (direction) job.videos = {};
  setStatus(job, "queued");
  enqueue({ job, fresh: "edit", format });
}
