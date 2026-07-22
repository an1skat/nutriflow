import type { NextConfig } from 'next';

const apiOrigin = (process.env.API_ORIGIN ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
