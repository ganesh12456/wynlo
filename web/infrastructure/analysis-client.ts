export interface AnalysisClient {
    get<T>(url: string, signal?: AbortSignal): Promise<T>;
}
export class HttpAnalysisClient implements AnalysisClient {
    async get<T>(url: string, signal?: AbortSignal): Promise<T> {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            const body = await response.json().catch(() => ({})) as {
                error?: string;
            };
            throw new Error(body.error ?? 'We could not load this analysis. Please try again.');
        }
        return response.json();
    }
}
export const analysisClient: AnalysisClient = new HttpAnalysisClient();
