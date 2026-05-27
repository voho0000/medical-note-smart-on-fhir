import type { NextConfig } from "next";
import path from "path";
import pkg from "./package.json";

const isGhPages = process.env.GITHUB_PAGES === "true";

const basePath = isGhPages ? "/medical-note-smart-on-fhir" : "";

// Detect when running inside a Claude Code worktree
// (e.g. .claude/worktrees/<branch>/). Worktrees don't have their own
// node_modules, so Turbopack needs to be pointed at the main project root.
const isWorktree = __dirname.includes('.claude/worktrees/');
const projectRoot = isWorktree ? path.join(__dirname, '../../..') : __dirname;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // 避免 Next 往上層亂抓 lockfile（雲端同步/家目錄）
  // worktree mode: point at main project where node_modules lives
  outputFileTracingRoot: projectRoot,
  ...(isWorktree
    ? {
        turbopack: {
          root: projectRoot,
        },
      }
    : {}),
  // 只有 GH Pages 才設定 basePath / assetPrefix
  ...(isGhPages
    ? {
        basePath: basePath,
        assetPrefix: `${basePath}/`,
        trailingSlash: false, // 建議 false
      }
    : {
        trailingSlash: false,
      }),
  // 暴露 basePath 給客戶端
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    // Pull version from package.json at build time so the header's "v0.1.0 ↗"
    // link always matches the deployed code. `npm version <bump>` is the
    // single point of truth: it edits package.json AND creates the git tag,
    // so the link `…/releases/tag/v{version}` resolves cleanly on GitHub.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Security headers (CSP disabled for local development).
  //
  // X-Frame-Options dropped on purpose: its only "allow-list" value is
  // ALLOW-FROM which Chrome ignores, so the SAMEORIGIN default blocks the
  // EHR-FHIR Bridge extension from embedding this app inside HIS pages
  // (NHI 健保存摺, vghtpe). We rely on CSP frame-ancestors instead —
  // modern browsers honour CSP over the legacy header. Restrict to a
  // whitelist of trusted HIS hosts (plus 'self' so the app's own
  // /smart/launch flow keeps working).
  //
  // Note: this only affects `next dev` / `next start`. GH Pages serves
  // static files via GitHub's CDN where headers() has no effect.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' " +
              "https://myhealthbank.nhi.gov.tw " +
              "https://*.vghtpe.gov.tw " +
              "http://localhost:5001"  // mock-his
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }
        ]
      }
    ]
  },
};

export default nextConfig;
