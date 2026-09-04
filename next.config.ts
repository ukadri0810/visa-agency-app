import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // static export — no Node server needed on Netlify
  images: {
    unoptimized: true, // required for static export; app uses plain <img> anyway
  },
};

export default nextConfig;
