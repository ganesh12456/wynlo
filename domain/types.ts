export type ForecastRecord = {
    startTime: string;
    publishTime: string;
    generation: number;
};
export type ActualRecord = ForecastRecord & {
    fuelType: string;
};
export type Snapshot = {
    meta: {
        snapshot_id: string;
        snapshot_built_at: string;
        counts: Record<string, number>;
        source_urls: Record<string, string>;
        source_sha256?: Record<string, string>;
    };
    forecasts: ForecastRecord[];
    actuals: ActualRecord[];
};
export type Selection = {
    value: number | null;
    publication: string | null;
    status: string;
};
export interface ForecastRepository {
    select(target: string, cutoff: string): Selection;
}
export interface ActualRepository {
    hour(target: string): {
        value: number | null;
        status: string;
    };
}
export type Row = {
    target_start: string;
    forecast_mw: number | null;
    publish_time: string | null;
    age_minutes: number | null;
    status: string;
    actual_mw?: number | null;
    error_mw?: number | null;
    actual_status?: string;
};
export type Replay = {
    decision_date: string;
    delivery_date: string;
    cutoff_local: string;
    cutoff_utc: string;
    snapshot_id: string;
    expected_count: number;
    forecast_count: number;
    mixed_vintages: boolean;
    rows: Row[];
};
export type ComparisonRow = {
    target_start: string;
    earlier_forecast_mw: number | null;
    later_forecast_mw: number | null;
    delta_mw: number | null;
    earlier_publish_time: string | null;
    later_publish_time: string | null;
    earlier_status: string;
    later_status: string;
    change_status: string;
};
export type Comparison = {
    decision_date: string;
    delivery_date: string;
    earlier_cutoff_local: string;
    later_cutoff_local: string;
    expected_count: number;
    comparable_count: number;
    value_changed_count: number;
    revised_vintage_count: number;
    mean_absolute_change_mw: number | null;
    max_absolute_change_mw: number | null;
    rows: ComparisonRow[];
};
export type Hour = {
    hour: string;
    matched: number;
    expected: number;
    mae_mw: number | null;
    bias_mw: number | null;
};
export type Accuracy = {
    expected_count: number;
    matched_count: number;
    mae_mw: number | null;
    rmse_mw: number | null;
    bias_mw: number | null;
    hourly: Hour[];
    daily: {
        date: string;
        matched: number;
        expected: number;
        mae_mw: number | null;
        bias_mw: number | null;
    }[];
    alignment_note: string;
};
export type Metadata = Snapshot['meta'] & {
    alignment_note: string;
};
