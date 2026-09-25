import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext inspects multipart POSTs before route dispatch. Allow the upload
  // envelope here; /api/plans enforces 5 MB per file and 10 MB combined.
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
};

export default nextConfig;
