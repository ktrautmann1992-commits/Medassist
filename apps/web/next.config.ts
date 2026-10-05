import path from "node:path";
import type { NextConfig } from "next";

const sicherheitsHeader = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // REQ-412: Mikrofon nur für die eigene Herkunft (Sprachaufnahme, REQ-407); Kamera über die Dateiauswahl.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Demo: nicht von Suchmaschinen indexieren.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // Monorepo: Wurzel für Tracing/Turbopack, damit /styles/style.css und packages/* gefunden werden.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  turbopack: { root: path.join(import.meta.dirname, "../..") },
  transpilePackages: ["@medassist/core", "@medassist/ui"],
  serverExternalPackages: ["@node-rs/argon2"],
  experimental: {
    // für forbidden() in requireRole (REQ-018)
    authInterrupts: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: sicherheitsHeader }];
  },
};

export default nextConfig;
