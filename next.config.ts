import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its WASM from disk at runtime; bundling breaks its asset
  // paths, so it must stay external on the server.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The drizzle migration files are read at boot; include them in the
  // serverless trace for every route so hosted bundles always ship them.
  outputFileTracingIncludes: {
    "/": ["./drizzle/**/*"],
    "/*": ["./drizzle/**/*"],
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;
