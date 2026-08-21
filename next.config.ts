import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Tailscale HTTP IP + HTTPS MagicDNS Serve origin to use dev HMR/WebSocket.
  allowedDevOrigins: [
    "100.101.159.31",
    "desktop-9khvui9.tailc92502.ts.net",
    "*.tailc92502.ts.net",
  ],
  experimental: {
    // Next 16.2 defaults this on; RSC hydration then waits for HMR debug
    // chunks. When WSS through Tailscale Serve fails/flakes (Android phone),
    // the page stays inert SSR HTML. Keep HMR allowed above; do not block hydrate.
    reactDebugChannel: false,
  },
};

export default nextConfig;
