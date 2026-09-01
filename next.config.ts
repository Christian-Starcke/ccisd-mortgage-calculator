import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The floating dev badge sits on top of the sticky input column.
  devIndicators: false,
  // Without this, Turbopack walks up to the home directory looking for a
  // lockfile and then refuses to use it.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
