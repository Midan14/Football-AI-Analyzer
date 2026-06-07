import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.2.70"],
  outputFileTracingRoot: path.dirname(new URL(import.meta.url).pathname),
  outputFileTracingExcludes: {
    "*": ["./ml-service/venv/**", "ml-service/venv/**", "ml-service/mlruns/**"],
  },
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.sportmonks.com",
      },
      {
        protocol: "https",
        hostname: "api.football-data.org",
      },
      {
        protocol: "https",
        hostname: "media.api-sports.io",
      },
    ],
  },
  // Standalone output for smaller Docker images
  output: "standalone",
  // PWA manifest
  async rewrites() {
    return [
      {
        source: "/manifest.json",
        destination: "/manifest.json",
      },
    ];
  },
  // Logging: only show full URLs in dev (avoid leaking API tokens in prod logs)
  logging:
    process.env.NODE_ENV === "development"
      ? { fetches: { fullUrl: true, hmrRefresh: true } }
      : undefined,
  // Security headers (defense-in-depth)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "football-ai",
  project: process.env.SENTRY_PROJECT || "football-ai-analyzer",
  silent: !process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  transpileClientSDK: true,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
});
