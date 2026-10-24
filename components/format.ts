export const number = (n: number | null | undefined, digits = 0) => n == null ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
export const dateLabel = (value: string, short = false) => new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });
export const hourLabel = (value: string) => new Date(value).toISOString().slice(11, 16);
export const publicationLabel = (value: string | null) => value ? new Date(value).toISOString().replace('T', ' · ').slice(0, 18) + ' UTC' : 'Unavailable';
