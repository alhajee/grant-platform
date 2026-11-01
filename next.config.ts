import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained Node server for Docker/Dokploy deployments.
  output: "standalone",
  // Vinext inspects multipart POSTs before route dispatch. Allow the upload
  // envelope here; /api/plans enforces 5 MB per file and 10 MB combined.
  experimental: { serverActions: { bodySizeLimit: '11mb' } },
  // Pages are revalidated on every visit so a deploy is picked up at once: a cached page would ask for the old build's
  // script chunks, which are gone (1 November 2026). Hashed files under /_next/static stay immutable.
  async headers() {
    // Vinext has no lookahead in sources; static files skip config headers and API routes set their own Cache-Control.
    const noCache = [{ key: "Cache-Control", value: "no-cache" }];
    return [{ source: "/", headers: noCache }, { source: "/:path*", headers: noCache }];
  },
};

export default nextConfig;
