const backendBase =
  process.env.BACKEND_API_BASE || process.env.NEXT_PUBLIC_API_BASE;

if (!backendBase) {
  throw new Error(
    "BACKEND_API_BASE (or NEXT_PUBLIC_API_BASE) must be defined for proxy rewrites."
  );
}

const nextConfig = {
  trailingSlash: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendBase.replace(/\/+$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
