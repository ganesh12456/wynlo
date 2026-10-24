import { services } from '../../../infrastructure/services';
import { respond, params } from '../../../infrastructure/http';
export function GET(request: Request) { const p = params(request); return respond(() => services.forecasts.replay(p.get('date') ?? '2026-01-15', p.get('cutoff') ?? '09:00', p.get('actuals') === 'true')); }
