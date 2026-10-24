import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import type {Snapshot} from '../domain/types.ts';
/** The original compressed Elexon snapshot; Next traces this file into API deployments. */
export function loadSnapshot(): Snapshot {
  return JSON.parse(gunzipSync(readFileSync(join(process.cwd(), 'backend/data/snapshot.json.gz'))).toString('utf8')) as Snapshot;
}
