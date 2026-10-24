import type { Comparison } from '../domain/types.ts';
import { ForecastService } from './forecast-service.ts';
import { cutoffAt, mean } from '../domain/time.ts';
export class ComparisonService {
    private readonly forecasts: Pick<ForecastService, 'replay'>;
    constructor(forecasts: Pick<ForecastService, 'replay'>) { this.forecasts = forecasts; }
    compare(day: string, earlier: string, later: string): Comparison {
        if (cutoffAt(day, earlier) >= cutoffAt(day, later))
            throw new Error('The comparison time must be after the earlier decision time.');
        const a = this.forecasts.replay(day, earlier), b = this.forecasts.replay(day, later);
        const rows = a.rows.map((row, i) => {
            const next = b.rows[i], delta = row.forecast_mw !== null && next.forecast_mw !== null ? next.forecast_mw - row.forecast_mw : null;
            return { target_start: row.target_start, earlier_forecast_mw: row.forecast_mw, later_forecast_mw: next.forecast_mw, delta_mw: delta, earlier_publish_time: row.publish_time, later_publish_time: next.publish_time, earlier_status: row.status, later_status: next.status, change_status: delta === null ? 'Incomplete pair' : delta !== 0 ? 'Value changed' : row.publish_time !== next.publish_time ? 'Publication updated' : 'Unchanged' };
        });
        const changes = rows.map(r => r.delta_mw).filter((n): n is number => n !== null).map(Math.abs);
        return { decision_date: day, delivery_date: a.delivery_date, earlier_cutoff_local: earlier, later_cutoff_local: later, expected_count: a.expected_count, comparable_count: changes.length, value_changed_count: rows.filter(r => r.delta_mw !== null && r.delta_mw !== 0).length, revised_vintage_count: rows.filter(r => r.earlier_publish_time !== r.later_publish_time).length, mean_absolute_change_mw: mean(changes), max_absolute_change_mw: changes.length ? Math.max(...changes) : null, rows };
    }
}
