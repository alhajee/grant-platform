import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node server for Docker/Dokploy deployments.
  output: "standalone",
  // Vinext inspects multipart POSTs before route dispatch. Allow the upload
  // envelope here; /api/plans enforces 5 MB per file and 10 MB combined.
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
};

export default nextConfig;
