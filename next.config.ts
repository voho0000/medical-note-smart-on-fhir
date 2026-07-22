import type { NextConfig } from "next";
import path from "path";

const isGhPages = process.env.GITHUB_PAGES === "true";
const isOnPremDeployment =
  process.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE === "onprem" ||
  process.env.NEXT_PUBLIC_OFFLINE_MODE === "1";

// Optional second static-export target: the official mirror at
// mediprisma.tw/app. Set DEPLOY_BASE_PATH=/app to build that artifact.
// Any non-empty value turns on the same static export + basePath wiring
// that GitHub Pages uses, just under a different subpath.
const deployBasePath = process.env.DEPLOY_BASE_PATH || "";
const isIntranetStaticExport = process.env.INTRANET_STATIC_EXPORT === "true";
const isStaticExport = isGhPages || deployBasePath !== "" || isIntranetStaticExport;

const basePath = deployBasePath
  ? deployBasePath
  : isGhPages
    ? "/medical-note-smart-on-fhir"
    : "";

// Detect when running inside a Claude Code worktree
// (e.g. .claude/worktrees/<branch>/). Worktrees don't have their own
// node_modules, so Turbopack needs to be pointed at the main project root.
const isWorktree = __dirname.includes('.claude/worktrees/');
const projectRoot = isWorktree ? path.join(__dirname, '../../..') : __dirname;

// The on-prem artifact swaps Firebase-backed boundary modules before the
// dependency graph is built. Runtime `if (offline)` checks are insufficient:
// they still ship Firebase/Auth/Firestore code in browser chunks.
const onPremAliases: Record<string, string> = {
  '@/src/application/providers/auth.provider':
    '@/src/application/providers/onprem/auth.provider.tsx',
  '@/features/auth/components/EmailVerificationBanner':
    '@/src/infrastructure/onprem/auth/EmailVerificationBanner.tsx',
  '@/src/infrastructure/firebase/auth-errors':
    '@/src/infrastructure/onprem/auth/auth-errors.ts',
  '@/src/infrastructure/ai/utils/proxy-auth':
    '@/src/infrastructure/onprem/ai/proxy-auth.ts',
  '@/src/infrastructure/ai/utils/app-check':
    '@/src/infrastructure/onprem/ai/app-check.ts',
  '@/src/infrastructure/ai/factories/ai-provider.factory':
    '@/src/infrastructure/onprem/ai/ai-provider.factory.ts',
  '@/src/infrastructure/ai/services/ai.service':
    '@/src/infrastructure/onprem/ai/ai.service.ts',
  '@/src/infrastructure/ai/services/openai.service':
    '@/src/infrastructure/onprem/ai/cloud-services.ts',
  '@/src/infrastructure/ai/services/transcription.service':
    '@/src/infrastructure/onprem/ai/cloud-services.ts',
  '@/src/shared/config/cloud-ai-endpoints.config':
    '@/src/infrastructure/onprem/ai/cloud-ai-endpoints.config.ts',
  '@/src/shared/config/cloud-smart.config':
    '@/src/infrastructure/onprem/smart/cloud-smart.config.ts',
  '@/src/shared/config/firebase.config':
    '@/src/infrastructure/onprem/firebase.config.ts',
  '@/src/infrastructure/firebase/template-sync':
    '@/src/infrastructure/onprem/sync/template-sync.ts',
  '@/src/infrastructure/firebase/clinical-insights-sync':
    '@/src/infrastructure/onprem/sync/clinical-insights-sync.ts',
  '@/src/application/composition.chat':
    '@/src/infrastructure/onprem/chat/composition.chat.ts',
  '@/features/prompt-gallery/services/prompt-gallery.service':
    '@/features/prompt-gallery/services/prompt-gallery.onprem.service.ts',
};

const onPremWebpackAliases = Object.fromEntries(
  Object.entries(onPremAliases).map(([source, target]) => [
    source,
    path.join(__dirname, target.replace(/^@\//, '')),
  ]),
);

const configureOnPremWebpack: NonNullable<NextConfig['webpack']> = (config) => {
  config.resolve.alias = {
    ...config.resolve.alias,
    ...onPremWebpackAliases,
  };
  return config;
};

const nextConfig: NextConfig = {
  // Static export is only required for the GitHub Pages deploy. In dev mode
  // (and on Vercel) we want the full Next.js server so dynamic API routes
  // like /api/feedback work. Without this gate, `output: "export"` forces
  // every route to be statically renderable, which breaks API routes.
  ...(isStaticExport ? { output: "export" as const } : {}),
  images: { unoptimized: true },
  // 避免 Next 往上層亂抓 lockfile（雲端同步/家目錄）
  // worktree mode: point at main project where node_modules lives
  outputFileTracingRoot: projectRoot,
  ...(isWorktree || isOnPremDeployment
    ? {
        turbopack: {
          ...(isWorktree ? { root: projectRoot } : {}),
          ...(isOnPremDeployment ? { resolveAlias: onPremAliases } : {}),
        },
      }
    : {}),
  // Keep the webpack fallback available for explicit on-prem webpack builds,
  // but do not register it for cloud profiles. Next.js 16 treats a webpack
  // hook without a Turbopack config as an ambiguous production build.
  ...(isOnPremDeployment ? { webpack: configureOnPremWebpack } : {}),
  // Static-export targets (GH Pages, mediprisma /app) need basePath / assetPrefix
  ...(isStaticExport
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
    // App version is no longer baked in here — VersionLink fetches it from
    // /version.json at runtime (regenerated by scripts/write-version.mjs on
    // every `npm version` bump). Build-time inlining cached the version in
    // the client bundle and forced a dev-server restart after each bump.
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
