import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The temporary document form sends PDF/DOCX files through a Server Action.
  // Keep this slightly above the 25 MB application limit for multipart overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
