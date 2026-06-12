/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  // Compress all responses
  compress: true,
  // HTTP caching headers for stable API endpoints
  async headers() {
    return [
      {
        // Menu categories rarely change — cache for 60 seconds
        source: "/api/hotel/menu/:path*",
        headers: [{ key: "Cache-Control", value: "private, max-age=60, stale-while-revalidate=120" }],
      },
      {
        // Profile rarely changes — cache for 60 seconds
        source: "/api/hotel/profile",
        headers: [{ key: "Cache-Control", value: "private, max-age=60, stale-while-revalidate=300" }],
      },
    ];
  },
};

module.exports = nextConfig;

