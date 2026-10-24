import type { ForecastRepository, ActualRepository, Snapshot, Selection } from '../domain/types.ts';
import { HOUR } from '../domain/time.ts';
/** Immutable indexed adapter; a different source can implement these small ports. */
export class SnapshotRepository implements ForecastRepository, ActualRepository {
    private readonly forecasts = new Map<number, Map<number, Set<number>>>();
    private readonly actuals = new Map<number, Set<number>>();
    constructor(snapshot: Snapshot) {
        for (const row of snapshot.forecasts) {
            const target = Date.parse(row.startTime), pub = Date.parse(row.publishTime);
            const versions = this.forecasts.get(target) ?? new Map<number, Set<number>>();
            const values = versions.get(pub) ?? new Set<number>();
            values.add(row.generation);
            versions.set(pub, values);
            this.forecasts.set(target, versions);
        }
        for (const row of snapshot.actuals)
            if (row.fuelType === 'WIND') {
                const key = Date.parse(row.startTime), values = this.actuals.get(key) ?? new Set<number>();
                values.add(row.generation);
                this.actuals.set(key, values);
            }
    }
    select(target: string, cutoff: string): Selection {
        const versions = this.forecasts.get(Date.parse(target));
        let latest = -Infinity, selected: Set<number> | undefined;
        for (const [pub, values] of versions ?? [])
            if (pub <= Date.parse(cutoff) && pub > latest) {
                latest = pub;
                selected = values;
            }
        if (!selected)
            return { value: null, publication: null, status: 'No eligible publication' };
        if (selected.size !== 1)
            return { value: null, publication: null, status: 'Conflicting latest publication' };
        return { value: [...selected][0], publication: new Date(latest).toISOString(), status: 'Available' };
    }
    hour(target: string) {
        const key = Date.parse(target), a = this.actuals.get(key), b = this.actuals.get(key + HOUR / 2);
        if ((a && a.size !== 1) || (b && b.size !== 1))
            return { value: null, status: 'Conflicting actual revision' };
        if (!a || !b)
            return { value: null, status: 'Incomplete actual hour' };
        return { value: ([...a][0] + [...b][0]) / 2, status: 'Complete' };
    }
}
