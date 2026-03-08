import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
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
  
  // Enable source maps for better error debugging
  // In production, this helps with stack trace quality
  productionBrowserSourceMaps: true,
  
  // Turbopack configuration (Next.js 16 uses Turbopack by default)
  turbopack: {
    // Turbopack handles source maps automatically
    // No additional configuration needed for source maps
  },
  
  // Webpack configuration to handle server-only modules
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Mark Node.js modules as external for client builds to prevent bundling
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;

