import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadSnapshot} from '../infrastructure/load-snapshot.ts';
import { SnapshotRepository } from '../infrastructure/snapshot-repository.ts';
import { ForecastService } from '../application/forecast-service.ts';
import { ComparisonService } from '../application/comparison-service.ts';
import { AccuracyService } from '../application/accuracy-service.ts';
import type { Snapshot } from '../domain/types.ts';
const snap = loadSnapshot();
const reference = JSON.parse(fs.readFileSync(new URL('./reference.json', import.meta.url), 'utf8'));
const repo = new SnapshotRepository(snap), forecasts = new ForecastService(repo, repo, snap.meta.snapshot_id);
const t = '2026-01-16T00:00:00Z';
const fixture = (records: Snapshot['forecasts'], actuals: Snapshot['actuals'] = []) => new SnapshotRepository({ meta: snap.meta, forecasts: records, actuals });
test('replay matches the existing Python implementation on the original Elexon data', () => {
    const result = forecasts.replay('2026-01-15', '09:00');
    assert.equal(result.forecast_count, reference.replay.forecast_count);
    assert.equal(result.mixed_vintages, reference.replay.mixed_vintages);
    result.rows.forEach((row, i) => { assert.equal(row.forecast_mw, reference.replay.rows[i].forecast_mw); assert.equal(Date.parse(row.publish_time!), Date.parse(reference.replay.rows[i].publish_time)); assert.equal(row.age_minutes, reference.replay.rows[i].age_minutes); });
});
test('monthly metrics match the existing Python implementation', () => {
    const a = new AccuracyService(forecasts).review('2026-01-01', '2026-01-31', '09:00');
    assert.equal(a.matched_count, 744);
    assert.equal(a.expected_count, 744);
    for (const key of ['mae_mw', 'rmse_mw', 'bias_mw'] as const)
        assert.ok(Math.abs(a[key]! - reference.accuracy[key]) < 1e-8);
    a.hourly.forEach((r, i) => assert.ok(Math.abs(r.mae_mw! - reference.accuracy.hourly[i].mae_mw) < 1e-8));
});
test('cutoff comparison matches the existing Python implementation', () => {
    const c = new ComparisonService(forecasts).compare('2026-01-15', '07:00', '09:00');
    assert.equal(c.value_changed_count, reference.comparison.value_changed_count);
    assert.equal(c.revised_vintage_count, reference.comparison.revised_vintage_count);
    c.rows.forEach((row, i) => assert.equal(row.delta_mw, reference.comparison.rows[i].delta_mw));
    assert.ok(Math.abs(c.mean_absolute_change_mw! - reference.comparison.mean_absolute_change_mw) < 1e-8);
});
test('exact cutoff is included, future publications excluded, no eligible value stays missing', () => {
    const r = fixture([{ startTime: t, publishTime: '2026-01-15T09:00:00Z', generation: 10 }, { startTime: t, publishTime: '2026-01-15T09:01:00Z', generation: 999 }]);
    assert.equal(r.select(t, '2026-01-15T09:00:00Z').value, 10);
    assert.equal(r.select(t, '2026-01-15T08:59:00Z').value, null);
});
test('a conflicting latest publication stays unavailable instead of falling back', () => {
    const r = fixture([{ startTime: t, publishTime: '2026-01-15T08:00:00Z', generation: 1 }, { startTime: t, publishTime: '2026-01-15T09:00:00Z', generation: 10 }, { startTime: t, publishTime: '2026-01-15T09:00:00Z', generation: 20 }]);
    assert.equal(r.select(t, '2026-01-15T09:00:00Z').value, null);
    assert.match(r.select(t, '2026-01-15T09:00:00Z').status, /Conflicting/);
});
test('actuals require two complete, consistent half-hours including a valid zero', () => {
    const base = { publishTime: '2026-01-16T01:00:00Z', fuelType: 'WIND' };
    const r = fixture([], [{ ...base, startTime: t, generation: 0 }, { ...base, startTime: '2026-01-16T00:30:00Z', generation: 20 }]);
    assert.equal(r.hour(t).value, 10);
    assert.equal(fixture([], [{ ...base, startTime: t, generation: 10 }]).hour(t).value, null);
    assert.equal(fixture([], [{ ...base, startTime: t, generation: 10 }, { ...base, startTime: t, generation: 11 }, { ...base, startTime: '2026-01-16T00:30:00Z', generation: 20 }]).hour(t).value, null);
});
test('decision replay and publication comparison never reveal later actuals', () => {
    assert.ok(forecasts.replay('2026-01-15', '09:00').rows.every(row => !('actual_mw' in row)));
    assert.ok(new ComparisonService(forecasts).compare('2026-01-15', '07:00', '09:00').rows.every(row => !('actual_mw' in row)));
    assert.ok(forecasts.replay('2026-01-15', '09:00', true).rows.every(row => 'actual_mw' in row));
});
test('validation rejects impossible dates, reversed windows and invalid cutoffs', () => {
    for (const day of ['2026-01-32', '2026-01-00', '2026-02-01', '', '2026-1-1'])
        assert.throws(() => forecasts.replay(day, '09:00'));
    for (const time of ['25:00', '09:99', '9:00', ''])
        assert.throws(() => forecasts.replay('2026-01-15', time));
    assert.throws(() => new ComparisonService(forecasts).compare('2026-01-15', '09:00', '07:00'));
    assert.throws(() => new AccuracyService(forecasts).review('2026-01-31', '2026-01-01', '09:00'));
    assert.equal(forecasts.replay('2026-01-31', '09:00').delivery_date, '2026-02-01');
});
test('application services accept a small substituted repository', () => {
    const f = { select: () => ({ value: 100, publication: '2026-01-15T08:00:00Z', status: 'Available' }) };
    const a = { hour: () => ({ value: 80, status: 'Complete' }) };
    const service = new ForecastService(f, a, 'test');
    assert.equal(service.replay('2026-01-15', '09:00', true).rows[0].error_mw, -20);
    const stats = new AccuracyService(service).review('2026-01-15', '2026-01-15', '09:00');
    assert.equal(stats.mae_mw, 20);
    assert.equal(stats.bias_mw, -20);
    assert.equal(stats.rmse_mw, 20);
});
