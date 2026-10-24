import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const python=process.env.PYTHON ?? (existsSync('.venv/bin/python')?'.venv/bin/python':existsSync('.venv/Scripts/python.exe')?'.venv/Scripts/python.exe':'python');
const backend=spawn(python,['-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port','8000','--reload'],{stdio:'inherit'});
const frontend=spawn('node',['web/node_modules/next/dist/bin/next','dev','web','--hostname','127.0.0.1'],{stdio:'inherit'});
let closing=false;
const stop=(code=0)=>{if(closing)return;closing=true;backend.kill('SIGTERM');frontend.kill('SIGTERM');process.exitCode=code};
for(const child of [backend,frontend]){child.on('error',()=>stop(1));child.on('exit',code=>stop(code??0))}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
