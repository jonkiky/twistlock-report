import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/api/generate-report": ["./lib/template.docx"],
  },
};

export default nextConfig;
