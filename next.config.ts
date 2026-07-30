import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Proof uploads go through a Server Action, which caps request bodies at
      // 1MB by default — far too small for print artwork. Sits above the 50MB
      // app limit (MAX_FILE_SIZE) to leave room for multipart overhead.
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
