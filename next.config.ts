import type { NextConfig } from "next";
import path from "path";

const isGhPages = process.env.GITHUB_PAGES === "true";

const basePath = isGhPages ? "/medical-note-smart-on-fhir" : "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // 避免 Next 往上層亂抓 lockfile（雲端同步/家目錄）
  outputFileTracingRoot: path.join(__dirname),
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
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://fhir.epic.com https://fhir.cerner.com https://*.firebase.google.com https://*.run.app https://launch.smarthealthit.org https://*.smarthealthit.org",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ]
  },
};

export default nextConfig;
