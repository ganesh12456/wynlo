import { services } from '../../../infrastructure/services';
import { respond, params } from '../../../infrastructure/http';
export function GET(request: Request) { const p = params(request); return respond(() => services.comparison.compare(p.get('date') ?? '2026-01-15', p.get('earlier') ?? '07:00', p.get('later') ?? '09:00')); }
