import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Server Actions default to a 1MB request body limit, far too small for a
  // real phone photo. The hero-image upload has its own 5MB check in code;
  // this just needs to be large enough for that request to actually arrive.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
