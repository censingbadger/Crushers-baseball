import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM from disk at runtime; bundling breaks its asset
  // paths, so it must stay external on the server.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Read at runtime, invisible to static tracing: the drizzle migration
  // files (boot) and PGlite's WASM assets (the no-database fallback).
  // Include both in the serverless trace for every route.
  outputFileTracingIncludes: {
    "/": ["./drizzle/**/*", "./node_modules/@electric-sql/pglite/dist/**/*"],
    "/*": ["./drizzle/**/*", "./node_modules/@electric-sql/pglite/dist/**/*"],
    "/**": ["./drizzle/**/*", "./node_modules/@electric-sql/pglite/dist/**/*"],
  },
};

export default nextConfig;
