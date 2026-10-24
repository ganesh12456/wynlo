export const HOUR = 3600000;
export const ALIGNMENT_NOTE = 'WINDFOR and FUELHH WIND may cover different generation populations. Their equivalence is unverified. Differences are provisional and must not be interpreted as validated forecast skill or a purchase recommendation.';
export function validateDecision(day: string) {
    if (!/^2026-01-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)
        throw new Error('Choose a valid decision date from 1–31 January 2026.');
    return day;
}
export function cutoffAt(day: string, time: string) {
    validateDecision(day);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        throw new Error('Enter a decision time in HH:MM format.');
    // All decisions are in January: Europe/London is UTC+00:00 throughout this pilot.
    return `${day}T${time}:00.000Z`;
}
export function targets(day: string) {
    validateDecision(day);
    const start = Date.parse(`${day}T00:00:00Z`) + 24 * HOUR;
    return Array.from({ length: 24 }, (_, i) => new Date(start + i * HOUR).toISOString());
}
export const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
