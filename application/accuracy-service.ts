import type { Accuracy, Row } from '../domain/types.ts';
import { ForecastService } from './forecast-service.ts';
import { validateDecision, mean, ALIGNMENT_NOTE } from '../domain/time.ts';
const metrics = (rows: Row[]) => {
    const errors = rows.map(r => r.error_mw).filter((n): n is number => n !== null && n !== undefined);
    return { matched: errors.length, expected: rows.length, mae_mw: mean(errors.map(Math.abs)), bias_mw: mean(errors), rmse_mw: errors.length ? Math.sqrt(mean(errors.map(n => n * n))!) : null };
};
export class AccuracyService {
    private readonly forecasts: Pick<ForecastService, 'replay'>;
    constructor(forecasts: Pick<ForecastService, 'replay'>) { this.forecasts = forecasts; }
    review(from: string, to: string, cutoff: string): Accuracy {
        validateDecision(from);
        validateDecision(to);
        if (from > to)
            throw new Error('The end date must be on or after the start date.');
        const all: Row[] = [], daily = [];
        for (let day = Date.parse(from); day <= Date.parse(to); day += 86400000) {
            const date = new Date(day).toISOString().slice(0, 10), replay = this.forecasts.replay(date, cutoff, true);
            all.push(...replay.rows);
            daily.push({ date: replay.delivery_date, ...metrics(replay.rows) });
        }
        const total = metrics(all);
        return { expected_count: all.length, matched_count: total.matched, mae_mw: total.mae_mw, rmse_mw: total.rmse_mw, bias_mw: total.bias_mw, daily, hourly: Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, '0')}:00`, ...metrics(all.filter(r => new Date(r.target_start).getUTCHours() === i)) })), alignment_note: ALIGNMENT_NOTE };
    }
}
