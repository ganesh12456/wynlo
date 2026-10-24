import { services } from '../../../infrastructure/services';
import { params, csv } from '../../../infrastructure/http';
export function GET(request: Request) {
    const p = params(request), day = p.get('date') ?? '2026-01-15', cutoff = p.get('cutoff') ?? '09:00';
    try {
        if (p.get('view') === 'compare') {
            const result = services.comparison.compare(day, p.get('earlier') ?? '07:00', p.get('later') ?? cutoff);
            return csv(result.rows.map(row => ({ decision_date: day, earlier_cutoff: result.earlier_cutoff_local, later_cutoff: result.later_cutoff_local, ...row })), 'wynlo-publication-comparison.csv');
        }
        if (p.get('view') === 'accuracy') {
            const result = services.accuracy.review(p.get('from') ?? '2026-01-01', p.get('to') ?? '2026-01-31', cutoff);
            return csv(result.daily, 'wynlo-accuracy-review.csv');
        }
        const result = services.forecasts.replay(day, cutoff, p.get('actuals') === 'true');
        return csv(result.rows.map(row => ({ snapshot_id: result.snapshot_id, decision_date: day, delivery_date: result.delivery_date, cutoff_utc: result.cutoff_utc, ...row })), 'wynlo-decision-evidence.csv');
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : 'Export unavailable' }, { status: 422 });
    }
}
