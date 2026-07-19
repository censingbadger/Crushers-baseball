import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM from disk at runtime; bundling breaks its asset
  // paths, so it must stay external on the server.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
