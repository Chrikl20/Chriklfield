import type { NextConfig } from 'next';
const config: NextConfig = {
  // Vercel's adapter packages its own functions; standalone is for the Docker image.
  output: process.env.VERCEL === '1' ? undefined : 'standalone',
  allowedDevOrigins: ['terminal.local'],
  poweredByHeader: false,
  serverExternalPackages: ['sharp', '@electric-sql/pglite'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.supabase.co; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
export default config;
