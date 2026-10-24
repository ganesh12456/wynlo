'use client';
import { useEffect, useState } from 'react';
import { analysisClient, type AnalysisClient } from '../infrastructure/analysis-client';
export function useAnalysis<T>(url: string, client: AnalysisClient = analysisClient) {
    const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setData(null);
        client.get<T>(url, controller.signal).then(value => { if (!controller.signal.aborted)
            setData(value); }).catch(error => { if (!controller.signal.aborted)
            setError(error.message); }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [url, client, attempt]);
    return { data, error, loading, retry: () => setAttempt(n => n + 1) };
}
