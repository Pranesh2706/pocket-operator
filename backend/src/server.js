import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, seedIfEmpty, DEFAULT_DB_PATH } from './db.js';
import { llmFromEnv } from './agent/llm.js';
import { createApp } from './app.js';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const db = openDb(process.env.DB_PATH || DEFAULT_DB_PATH);
seedIfEmpty(db); // first start only; later restarts keep orders, proposals, traces and dev edits

const llm = llmFromEnv();
const app = createApp({ db, llm, devRoutes: process.env.DEV_ROUTES !== '0' });

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0'; // 0.0.0.0 so a phone on the same Wi-Fi can reach it
app.listen(port, host, () => {
  console.log(`Pocket Operator backend on http://${host}:${port}`);
  console.log(llm ? `LLM: ${llm.model} via ${new URL(process.env.LLM_BASE_URL).host}` : 'LLM: NOT CONFIGURED (set LLM_* in backend/.env)');
});
