/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
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
};

export default nextConfig;
