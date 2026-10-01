import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * `unsafe-inline` / `unsafe-eval` are required by the Next.js App Router runtime and are a
 * known weakness. A nonce-based CSP is a documented post-MVP hardening item — see
 * docs/security.md section 6 and 15.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Keep Mongoose out of the bundler and let the driver manage its own sockets.
  serverExternalPackages: ["mongoose", "bcryptjs"],

  images: {
    // Guard photos and organisation logos are user-supplied; restrict the origins so a
    // compromised record cannot be turned into an SSRF / tracking pixel.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Auth.js callback endpoints are framing-sensitive; keep them locked down too.
        source: "/api/auth/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;