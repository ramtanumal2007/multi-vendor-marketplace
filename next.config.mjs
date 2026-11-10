/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.BUILD_DIR || '.next',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'ddrwsbfrhuzunvgcezaw.supabase.co',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/admin/dashboard',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/login/admin',
        destination: '/login?redirect=/admin',
        permanent: true,
      },
      {
        source: '/admin/login',
        destination: '/login?redirect=/admin',
        permanent: true,
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: '/seller/application-tracking',
        destination: '/seller/tracking',
      },
      {
        source: '/seller/application-tracking/:path*',
        destination: '/seller/tracking/:path*',
      },
    ];
  },
};

export default nextConfig;
