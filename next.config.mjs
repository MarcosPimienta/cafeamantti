/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Read bank statements on the server (pdf.js loads its worker from node_modules).
  serverExternalPackages: ['pdfjs-dist'],
};

export default nextConfig;
