import path from "node:path";

// Every run for a product shares one folder, so a saved login is picked up automatically.
export function jobPaths(url: string, jobId?: string, root = process.cwd()) {
  const id = jobId ?? new URL(url).hostname.replace(/[^a-z0-9]+/gi, "-");
  const workDir = path.join(root, "renders", id);
  return { id, workDir, statePath: path.join(workDir, "state.json") };
}
