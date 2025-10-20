import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Align with the workspace root so dependency resolution matches npm workspaces.
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
