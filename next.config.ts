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
};

export default nextConfig;
