import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent's browser and the video renderer run natively in Node; Next must not bundle them.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@remotion/renderer",
    "@remotion/bundler",
    "@remotion/compositor-win32-x64-msvc",
    "@remotion/compositor-linux-x64-gnu",
    "openai",
  ],
};

export default nextConfig;
