import { RotateCcw, AlertCircle } from 'lucide-react';
export function AnalysisState({ loading, error, retry }: {
    loading: boolean;
    error: string;
    retry: () => void;
}) {
    if (error)
        return <div className="error-state" role="alert"><AlertCircle size={22}/><div><b>Let’s check your selection.</b><p>{error}</p><button className="text-button" onClick={retry}><RotateCcw size={14}/>Try again</button></div></div>;
    if (loading)
        return <div className="loading-state" role="status"><span className="spinner"/><div><b>Reconstructing the decision…</b><p>Selecting only publications available at your chosen time.</p></div></div>;
    return null;
}
export function Metric({ label, value, unit, note }: {
    label: string;
    value: string;
    unit?: string;
    note?: string;
}) { return <div className="metric"><span>{label}</span><div><strong>{value}</strong>{unit && <small>{unit}</small>}</div>{note && <p>{note}</p>}</div>; }
