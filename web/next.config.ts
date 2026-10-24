import type { NextConfig } from 'next';
import {resolve} from 'node:path';
const backendOrigin = process.env.FASTAPI_ORIGIN ?? (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8000' : undefined);
const config: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), '..'),
  async rewrites() {
    return backendOrigin ? [{source: '/api/:path*', destination: `${backendOrigin.replace(/\/$/, '')}/api/:path*`}] : [];
  },
};
export default config;
