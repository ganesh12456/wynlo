export function respond(action: () => unknown) {
    try {
        return Response.json(action(), { headers: { 'Cache-Control': 'private, max-age=60' } });
    }
    catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'The analysis could not be completed.' }, { status: 422 });
    }
}
export const params = (request: Request) => new URL(request.url).searchParams;
export function csv(rows: Record<string, unknown>[], filename: string) {
    if (!rows.length)
        return new Response('No rows', { status: 404 });
    const columns = Object.keys(rows[0]), escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return new Response([columns.join(','), ...rows.map(row => columns.map(key => escape(row[key])).join(','))].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
}
