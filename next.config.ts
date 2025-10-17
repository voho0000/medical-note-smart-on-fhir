import type { NextConfig } from "next";
import path from "path";

const isGhPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // 避免 Next 往上層亂抓 lockfile（雲端同步/家目錄）
  outputFileTracingRoot: path.join(__dirname),
  // 只有 GH Pages 才設定 basePath / assetPrefix
  ...(isGhPages
    ? {
        basePath: "/medical-note-smart-on-fhir",
        assetPrefix: "/medical-note-smart-on-fhir/",
      }
    : {}),
    
};

export default nextConfig;
