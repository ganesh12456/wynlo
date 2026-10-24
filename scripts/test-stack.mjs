import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const python=process.env.PYTHON ?? (existsSync('.venv/bin/python')?'.venv/bin/python':existsSync('.venv/Scripts/python.exe')?'.venv/Scripts/python.exe':'python');
const backend=spawn(python,['-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port','8100'],{stdio:['ignore','pipe','pipe']});
const frontend=spawn('node',['web/node_modules/next/dist/bin/next','dev','web','--hostname','127.0.0.1','--port','3100'],{env:{...process.env,FASTAPI_ORIGIN:'http://127.0.0.1:8100',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let logs='';
for(const proc of [backend,frontend])for(const stream of [proc.stdout,proc.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-6000)});
async function ready(url){for(let i=0;i<75;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});if(r.ok)return r}catch{}await new Promise(r=>setTimeout(r,300))}throw new Error(`Server did not become ready: ${url}`)}
try{
 await ready('http://127.0.0.1:8100/api/health');
 const page=await ready('http://127.0.0.1:3100/');
 assert.match(await page.text(),/Wynlo/);
 const base='http://127.0.0.1:3100';
 const health=await fetch(`${base}/api/health`);
 assert.equal(health.headers.get('x-wynlo-backend'),'python-fastapi');
 assert.equal((await health.json()).backend,'python-fastapi');
 const replay=await (await fetch(`${base}/api/forecast?date=2026-01-15&cutoff=09:00`)).json();
 assert.equal(replay.rows[0].forecast_mw,7398);assert.equal(replay.rows.length,24);
 assert.ok(replay.rows.every(row=>!('actual_mw' in row)));
 const earlier=await (await fetch(`${base}/api/forecast?date=2026-01-15&cutoff=07:00`)).json();
 assert.equal(earlier.rows[0].forecast_mw,7848);
 const comparison=await (await fetch(`${base}/api/comparison`)).json();assert.equal(comparison.value_changed_count,24);
 const review=await (await fetch(`${base}/api/accuracy?from=2026-01-15&to=2026-01-15`)).json();assert.equal(review.matched_count,24);
 const evidence=await fetch(`${base}/api/export?date=2026-01-15`);assert.equal((await evidence.text()).trim().split('\n').length,25);
 const invalid=await fetch(`${base}/api/forecast?date=2026-01-32`);assert.equal(invalid.status,422);assert.ok((await invalid.json()).error);
 const docs=await fetch(`${base}/api/docs`);assert.equal(docs.status,200);
 console.log('Stack integration passed: Next.js → FastAPI → Elexon analysis → UI contracts, exports and validation.');
}catch(error){console.error(logs);throw error}
finally{backend.kill('SIGTERM');frontend.kill('SIGTERM');}
