#!/usr/bin/env node
// Minimal psql-compatible test transport for relocatable PostgreSQL packages
// which ship the server but not psql. All SQL runs in the real server.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { default: pg } = await import(process.env.PG_MODULE ? pathToFileURL(process.env.PG_MODULE).href : 'pg');
const args = process.argv.slice(2);
const arg = key => args[args.indexOf(key)+1];
const client = new pg.Client({host:arg('-h'),port:Number(arg('-p')),user:arg('-U'),database:arg('-d')});
try {
  await client.connect();
  const result = await client.query(args.includes('-f') ? fs.readFileSync(arg('-f'),'utf8') : arg('-c'));
  for (const item of Array.isArray(result) ? result : [result]) for (const row of item.rows) {
    console.log(Object.values(row).map(v=>v===null?'':typeof v==='object'?JSON.stringify(v):String(v)).join('|'));
  }
} catch (error) { console.error(error.message); process.exitCode=1; }
finally { await client.end(); }
