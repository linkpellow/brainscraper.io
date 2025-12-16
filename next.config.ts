import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize production builds
  compress: true,
  poweredByHeader: false,
  
  // Optimize images (if we add any in the future)
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['papaparse', 'xlsx'],
  },
};

export default nextConfig;

