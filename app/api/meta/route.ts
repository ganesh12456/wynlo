import { metadata } from '../../../infrastructure/services';
export function GET() { return Response.json(metadata); }
