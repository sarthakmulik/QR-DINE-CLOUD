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
        // Hotel admin: Menu categories rarely change — cache for 60 seconds
        source: "/api/hotel/menu/:path*",
        headers: [{ key: "Cache-Control", value: "private, max-age=60, stale-while-revalidate=120" }],
      },
      {
        // Dine: menu (categories+items) is public, stable — aggressive cache
        // sessionOnly=true queries are excluded by the CDN via Vary
        source: "/api/dine/:hotelId/:tableNumber",
        headers: [{ key: "Cache-Control", value: "no-store" }], // personalized (session data) — no cache
      },
    ];
  },
};

module.exports = nextConfig;

