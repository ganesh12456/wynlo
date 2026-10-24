import type { ForecastRepository, ActualRepository, Replay, Row } from '../domain/types.ts';
import { cutoffAt, targets } from '../domain/time.ts';
export class ForecastService {
    private readonly forecasts: ForecastRepository;
    private readonly actuals: ActualRepository;
    private readonly snapshotId: string;
    constructor(forecasts: ForecastRepository, actuals: ActualRepository, snapshotId: string) { this.forecasts = forecasts; this.actuals = actuals; this.snapshotId = snapshotId; }
    replay(day: string, time: string, reveal = false): Replay {
        const cutoff = cutoffAt(day, time), hours = targets(day);
        const rows: Row[] = hours.map(target => {
            const selected = this.forecasts.select(target, cutoff);
            const row: Row = { target_start: target, forecast_mw: selected.value, publish_time: selected.publication, age_minutes: selected.publication ? (Date.parse(cutoff) - Date.parse(selected.publication)) / 60000 : null, status: selected.status };
            if (reveal) {
                const actual = this.actuals.hour(target);
                row.actual_mw = actual.value;
                row.actual_status = actual.status;
                row.error_mw = actual.value !== null && selected.value !== null ? actual.value - selected.value : null;
            }
            return row;
        });
        return { decision_date: day, delivery_date: hours[0].slice(0, 10), cutoff_local: time, cutoff_utc: cutoff, snapshot_id: this.snapshotId, expected_count: hours.length, forecast_count: rows.filter(r => r.forecast_mw !== null).length, mixed_vintages: new Set(rows.map(r => r.publish_time).filter(Boolean)).size > 1, rows };
    }
}
