import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.TALENTUM_STANDALONE_BUILD === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  // The end-to-end server builds into its own directory so it never clashes with `pnpm dev`.
  distDir: process.env.TALENTUM_NEXT_DIST_DIR || '.next',
};

export default nextConfig;
