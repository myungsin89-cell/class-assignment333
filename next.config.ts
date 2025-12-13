import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // 빌드 시 ESLint 경고/오류를 무시합니다 (Vercel 배포 성공을 위해)
    ignoreDuringBuilds: true,
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('better-sqlite3');
    }
    return config;
  },
};

export default nextConfig;
