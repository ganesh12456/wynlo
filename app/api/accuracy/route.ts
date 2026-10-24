import { services } from '../../../infrastructure/services';
import { respond, params } from '../../../infrastructure/http';
export function GET(request: Request) { const p = params(request); return respond(() => services.accuracy.review(p.get('from') ?? '2026-01-01', p.get('to') ?? '2026-01-31', p.get('cutoff') ?? '09:00')); }
