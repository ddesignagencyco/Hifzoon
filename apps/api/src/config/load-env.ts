import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

/**
 * Loads `apps/api/.env` for local runs and scripts.
 *
 * `nest start` does not pass Node's `--env-file` flag, so without this the file exists but
 * is never read and every required variable looks missing. Existing environment values win
 * (Node's env-file parser never overwrites them), so Docker and hosted deployments that
 * inject variables keep full control.
 */
export function loadDotEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '../../.env'),
  ];

  for (const file of candidates) {
    if (existsSync(file)) {
      loadEnvFile(file);
      return;
    }
  }
}

loadDotEnv();
