import { useEffect, useMemo, useState } from 'react'

type View = 'replay' | 'accuracy' | 'method'
type Row = {
  target_start: string; target_local: string; forecast_mw: number | null;
  publish_time: string | null; age_minutes: number | null; status: string;
  actual_mw?: number | null; error_mw?: number | null; actual_status?: string;
}
type Replay = {
  decision_date: string; delivery_date: string; cutoff_local: string; cutoff_utc: string;
  snapshot_id: string; expected_count: number; forecast_count: number;
  mixed_vintages: boolean; warnings: string[]; rows: Row[];
}
type Day = { decision_date: string; delivery_date: string; expected: number; matched: number; mae_mw: number | null; bias_mw: number | null }
type Accuracy = {
  decision_from: string; decision_to: string; cutoff_local: string; snapshot_id: string;
  alignment_note: string; expected_count: number; forecast_count: number;
  actual_count: number; matched_count: number; forecast_coverage: number;
  matched_coverage: number; mae_mw: number | null; rmse_mw: number | null;
  bias_mw: number | null; daily: Day[]; rows: (Row & { decision_date: string })[];
}
type Meta = {
  snapshot_id: string; snapshot_built_at: string; timezone: string; unit: string;
  source_urls: Record<string, string>; counts: Record<string, number>; alignment_note: string;
}

const fmt = (value: number | null | undefined, digits = 0) => value == null ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(value)
const percent = (num: number, den: number) => den ? `${Math.round(num * 100 / den)}%` : '—'
const localTime = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const displayDate = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
const asUtc = (value: string) => new Date(value).toISOString().replace('.000Z', ' UTC')

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) {
    const issue = await response.json().catch(() => ({}))
    throw new Error(issue.detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

function Mark() {
  return <div className="brand"><div className="brand-icon" aria-hidden="true"><span /><span /><span /></div><div><strong>WIND WINDOW</strong><small>UK generation intelligence</small></div></div>
}

function ForecastChart({ rows, showActual }: { rows: Row[]; showActual: boolean }) {
  const width = 860, height = 320, left = 66, right = 20, top = 26, bottom = 54
  const values = rows.flatMap(r => [r.forecast_mw, showActual ? r.actual_mw ?? null : null]).filter((v): v is number => v !== null && v !== undefined)
  const max = Math.max(1000, Math.ceil(Math.max(...values, 1000) / 2000) * 2000)
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, rows.length - 1)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const segments = (key: 'forecast_mw' | 'actual_mw') => {
    const paths: string[] = []; let current = ''
    rows.forEach((row, index) => {
      const value = row[key]
      if (value == null) { if (current) paths.push(current); current = '' }
      else current += `${current ? ' L' : 'M'} ${x(index)} ${y(value)}`
    })
    if (current) paths.push(current)
    return paths
  }
  return <div className="chart-wrap">
    <div className="chart-title"><div><h3>Delivery day profile</h3><p>Hourly values · MW · London time</p></div><div className="legend"><span className="legend-forecast">Elexon forecast</span>{showActual && <span className="legend-actual">Later actual</span>}</div></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly wind forecast chart. Exact values and missing intervals are in the table below.">
      {[0, .25, .5, .75, 1].map(tick => <g key={tick}><line className="grid-line" x1={left} x2={width-right} y1={y(max*tick)} y2={y(max*tick)}/><text className="axis-label" x={left-12} y={y(max*tick)+4} textAnchor="end">{fmt(max*tick)}</text></g>)}
      {rows.map((row, index) => index % 4 === 0 ? <text className="axis-label" key={row.target_start} x={x(index)} y={height-20} textAnchor="middle">{localTime(row.target_start)}</text> : null)}
      {segments('forecast_mw').map((path, index) => <path key={`f${index}`} d={path} className="forecast-line"/>)}
      {showActual && segments('actual_mw').map((path, index) => <path key={`a${index}`} d={path} className="actual-line"/>)}
      {rows.map((row, index) => row.forecast_mw != null ? <circle key={row.target_start} className="forecast-dot" cx={x(index)} cy={y(row.forecast_mw)} r="3.5"><title>{localTime(row.target_start)}: forecast {fmt(row.forecast_mw)} MW. Published {row.publish_time ? asUtc(row.publish_time) : 'unknown'}.</title></circle> : null)}
    </svg>
  </div>
}

function Metric({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}<small>{unit}</small></strong>{note && <em>{note}</em>}</div>
}

function App() {
  const [view, setView] = useState<View>('replay')
  const [decision, setDecision] = useState('2026-01-15')
  const [cutoff, setCutoff] = useState('09:00')
  const [from, setFrom] = useState('2026-01-01')
  const [to, setTo] = useState('2026-01-31')
  const [showActual, setShowActual] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [replay, setReplay] = useState<Replay | null>(null)
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { getJson<Meta>('/api/meta').then(setMeta).catch(e => setError(e.message)) }, [])
  useEffect(() => {
    if (view === 'method') return
    const controller = new AbortController()
    setLoading(true); setError('')
    const path = view === 'replay'
      ? `/api/forecast?decision_date=${decision}&cutoff_local=${cutoff}&include_actuals=${showActual}`
      : `/api/accuracy?decision_from=${from}&decision_to=${to}&cutoff_local=${cutoff}`
    getJson<Replay | Accuracy>(path, controller.signal)
      .then(value => { if (view === 'replay') setReplay(value as Replay); else setAccuracy(value as Accuracy) })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [view, decision, cutoff, showActual, from, to])

  const age = useMemo(() => replay?.rows.find(row => row.age_minutes != null)?.age_minutes ?? null, [replay])
  const download = `/api/export?decision_from=${from}&decision_to=${to}&cutoff_local=${cutoff}`

  return <div className="shell">
    <aside className="sidebar"><Mark/><div className="side-label">WORKSPACE</div><nav aria-label="Main navigation">
      <button className={view === 'replay' ? 'active' : ''} onClick={() => setView('replay')}><span>◫</span> Decision replay</button>
      <button className={view === 'accuracy' ? 'active' : ''} onClick={() => setView('accuracy')}><span>▥</span> Accuracy review</button>
      <button className={view === 'method' ? 'active' : ''} onClick={() => setView('method')}><span>◉</span> Data & methodology</button>
    </nav><div className="side-bottom"><div className="status-pulse"/> January 2026 snapshot<br/><small>Historical pilot · read only</small></div></aside>
    <main className="content">
      <header className="topbar"><span>Decision support / National wind</span><div><span className="top-pill">ELEXON DATA</span><span className="top-date">Jan 2026 pilot</span></div></header>
      {view === 'replay' && <>
        <section className="hero"><div className="eyebrow">DECISION REPLAY <span> / </span> 01</div><h1>See the forecast they<br/><i>actually had.</i></h1><p>Rewind to a January purchase decision. Every point shown was published by the selected cutoff.</p></section>
        <section className="toolbar" aria-label="Decision controls"><div className="field"><label htmlFor="decision">Purchase decision date</label><input id="decision" type="date" min="2026-01-01" max="2026-01-31" value={decision} onChange={e => setDecision(e.target.value)}/></div><div className="field"><label htmlFor="cutoff">Local decision cutoff · London</label><input id="cutoff" type="time" value={cutoff} onChange={e => setCutoff(e.target.value)}/></div><div className="toolbar-note"><strong>Next-day delivery</strong><span>{replay ? displayDate(replay.delivery_date) : '—'}</span></div></section>
        {error && <div className="alert error" role="alert">{error}</div>}
        {loading && <div className="loading" role="status">Loading the historical decision…</div>}
        {replay && !loading && <>
          <div className="metric-grid"><Metric label="Forecast availability" value={percent(replay.forecast_count, replay.expected_count)} note={`${replay.forecast_count} of ${replay.expected_count} target hours`}/><Metric label="Publication age" value={age == null ? '—' : `${Math.floor(age/60)}h ${age%60}m`} note="First displayed target"/><Metric label="Decision cutoff" value={cutoff} note={asUtc(replay.cutoff_utc)}/></div>
          <section className="panel"><div className="panel-toolbar"><div><span className="eyebrow">01 / FORECAST VIEW</span><h2>{displayDate(replay.delivery_date)}</h2></div><label className="toggle"><input type="checkbox" checked={showActual} onChange={e => setShowActual(e.target.checked)}/><span>Reveal later actuals</span></label></div>
            <ForecastChart rows={replay.rows} showActual={showActual}/>
            <div className="chart-foot"><span>Forecast visible at <b>{cutoff} Europe/London</b></span><span>{showActual ? 'Actuals were learned after delivery.' : 'Actuals are hidden in decision mode.'}</span></div>
          </section>
          {replay.warnings.map(message => <div className="alert" key={message} role="status">{message}</div>)}
          <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">02 / SOURCE TRACE</span><h2>Every hour, accounted for.</h2></div><span className="small-label">All times London unless marked UTC</span></div><div className="table-scroll"><table><thead><tr><th>Target hour</th><th>Forecast MW</th><th>Published UTC</th><th>Age at cutoff</th>{showActual && <><th>Actual MW</th><th>Error MW</th></>}<th>Status</th></tr></thead><tbody>{replay.rows.map(row => <tr key={row.target_start}><td>{localTime(row.target_start)}</td><td className="num">{fmt(row.forecast_mw)}</td><td>{row.publish_time ? asUtc(row.publish_time) : '—'}</td><td>{row.age_minutes == null ? '—' : `${Math.floor(row.age_minutes / 60)}h ${row.age_minutes % 60}m`}</td>{showActual && <><td className="num">{fmt(row.actual_mw)}</td><td className="num">{fmt(row.error_mw)}</td></>}<td><span className={row.status === 'ok' ? 'row-ok' : 'row-missing'}>{row.status}</span></td></tr>)}</tbody></table></div></section>
        </>}
      </>}
      {view === 'accuracy' && <>
        <section className="hero compact"><div className="eyebrow">ACCURACY REVIEW <span> / </span> 02</div><h1>Know the size<br/>of the <i>miss.</i></h1><p>Retrospective comparison of published forecast values and recorded generation. Interpret with the source alignment caveat.</p></section>
        <section className="toolbar"><div className="field"><label htmlFor="from">Decision from</label><input id="from" type="date" min="2026-01-01" max="2026-01-31" value={from} onChange={e => setFrom(e.target.value)}/></div><div className="field"><label htmlFor="to">Decision to</label><input id="to" type="date" min="2026-01-01" max="2026-01-31" value={to} onChange={e => setTo(e.target.value)}/></div><div className="field"><label htmlFor="accuracy-cutoff">Local cutoff · London</label><input id="accuracy-cutoff" type="time" value={cutoff} onChange={e => setCutoff(e.target.value)}/></div></section>
        {error && <div className="alert error" role="alert">{error}</div>}{loading && <div className="loading" role="status">Calculating matched intervals…</div>}
        {accuracy && !loading && <><div className="metric-grid accuracy-metrics"><Metric label="Mean absolute error" value={fmt(accuracy.mae_mw)} unit=" MW" note="Average size of an interval miss"/><Metric label="Root mean squared error" value={fmt(accuracy.rmse_mw)} unit=" MW" note="Weights large misses more"/><Metric label="Signed bias" value={fmt(accuracy.bias_mw)} unit=" MW" note="Actual minus forecast"/><Metric label="Matched coverage" value={percent(accuracy.matched_count, accuracy.expected_count)} note={`${accuracy.matched_count} of ${accuracy.expected_count} expected hours`}/></div>
          <div className="alert caveat"><strong>Interpretation limit</strong><span>{accuracy.alignment_note}</span></div>
          <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">DAILY BREAKDOWN</span><h2>Where the error sits.</h2></div><a className="export" href={download}>Download paired CSV ↗</a></div><div className="table-scroll"><table><thead><tr><th>Delivery date</th><th>Matched / expected</th><th>Coverage</th><th>MAE MW</th><th>Bias MW</th></tr></thead><tbody>{accuracy.daily.map(day => <tr key={day.decision_date}><td>{displayDate(day.delivery_date)}</td><td>{day.matched} / {day.expected}</td><td>{percent(day.matched, day.expected)}</td><td className="num">{fmt(day.mae_mw)}</td><td className="num">{fmt(day.bias_mw)}</td></tr>)}</tbody></table></div></section>
          <p className="footnote">Forecast coverage {percent(accuracy.forecast_count, accuracy.expected_count)} · actual completeness {percent(accuracy.actual_count, accuracy.expected_count)} · expected {accuracy.expected_count} hourly targets. These are historical errors, not a calibrated future risk band.</p>
        </>}
      </>}
      {view === 'method' && <><section className="hero compact"><div className="eyebrow">DATA & METHODOLOGY <span> / </span> 03</div><h1>Every number has<br/>a <i>timestamp.</i></h1><p>This pilot keeps decision-time forecasts separate from what became known after delivery.</p></section><section className="method-grid"><article className="panel method-card"><span className="eyebrow">01 / SOURCES</span><h2>Public Elexon data</h2><p>WINDFOR supplies forecast vintages. FUELHH supplies half-hourly recorded generation filtered to WIND. The application covers January 2026 purchase decisions and the following delivery days.</p><ul><li><a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">WINDFOR API documentation ↗</a></li><li><a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream" target="_blank" rel="noreferrer">FUELHH API documentation ↗</a></li></ul></article><article className="panel method-card"><span className="eyebrow">02 / SELECTION</span><h2>No future forecasts</h2><p>For each target hour, the backend takes the greatest WINDFOR publication timestamp no later than the chosen cutoff. If nothing qualifies, the hour remains missing. Different hours can come from different publication vintages.</p></article><article className="panel method-card"><span className="eyebrow">03 / COMPARISON</span><h2>A declared assumption</h2><p>{meta?.alignment_note || 'Two complete FUELHH half-hours form one hourly actual mean. Interval semantics and series population are documented limitations.'}</p><p>Interval error = actual MW − forecast MW. A positive error indicates underforecast wind.</p></article><article className="panel method-card"><span className="eyebrow">04 / PROVENANCE</span><h2>Frozen snapshot</h2><dl><dt>Snapshot ID</dt><dd>{meta?.snapshot_id || 'Loading…'}</dd><dt>Snapshot built</dt><dd>{meta?.snapshot_built_at ? asUtc(meta.snapshot_built_at) : 'Loading…'}</dd><dt>Rows</dt><dd>{meta ? `${fmt(meta.counts.forecast_rows)} forecast vintages · ${fmt(meta.counts.actual_half_hours)} actual half-hours` : 'Loading…'}</dd></dl><p>Raw response hashes and regeneration commands are documented in the repository. A refetch creates a new version.</p></article></section><div className="method-disclaimer">This portal cannot determine the utility’s purchase quantity or trade value without demand, positions, bids and prices. It is a historical decision-support pilot.</div></>}
      <footer><span>WIND WINDOW · HISTORICAL PILOT</span><span>Snapshot {meta?.snapshot_id || '—'} · Source: Elexon BMRS</span></footer>
    </main>
  </div>
}

export default App
