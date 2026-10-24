import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingIncludes: {
    '/api/*': ['./backend/data/snapshot.json.gz'],
  },
};
export default config;
