/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep verification builds separate from the running application.
  distDir: process.env.AEON_NEXT_DIST_DIR || ".next",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
