import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	basePath: process.env.NEXT_PUBLIC_BASEDIR ?? "",
	allowedDevOrigins: ["192.168.0.188"] // i need next to shut up about this
};
export default nextConfig;
