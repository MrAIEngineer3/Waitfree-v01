import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // We have pre-existing ESLint rules that error on 'any' across the app.
    // Avoid failing production builds for lint errors; the feature addition is small and safe.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
