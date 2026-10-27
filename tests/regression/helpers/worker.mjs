import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';

/* D1 em memória sobre node:sqlite, com as migrations reais do Worker.

   Implementa só a superfície que `cloudflare/src/index.ts` usa: prepare, bind,
   run, first, all e batch. Assim os testes de regressão exercitam o Worker de
   verdade, em vez de procurar trechos no código-fonte. */

const root = new URL('../../../', import.meta.url);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }
}

export async function createD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('cloudflare/migrations/', root);
  for (const name of (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()) {
    db.exec(await readFile(new URL(name, dir), 'utf8'));
  }
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export const SECRETS = {
  APP_ENV: 'test',
  ALLOWED_ORIGIN: 'http://localhost:3100',
  PUBLIC_WEB_URL: 'http://localhost:3100',
  SESSION_SIGNING_SECRET: 'segredo-sintetico-de-sessao',
  TOKEN_HASH_PEPPER: 'pimenta-sintetica',
  BFF_SHARED_SECRET: 'segredo-sintetico-do-bff',
  GOOGLE_CLIENT_ID: 'cliente-sintetico.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'segredo-oauth-sintetico',
};

export async function createWorker() {
  const { default: worker } = await import(new URL('cloudflare/src/index.ts', root).href);
  const env = { ...SECRETS, DB: await createD1() };

  /* Chamada como o BFF faz: pede um código de ação e envia a requisição real. */
  async function call(method, path, { body, headers = {} } = {}) {
    const base = { 'Content-Type': 'application/json', 'X-Talentum-BFF': SECRETS.BFF_SHARED_SECRET, ...headers };
    const boot = await worker.fetch(
      new Request('https://worker.test/api/action-codes', { method: 'POST', headers: base, body: JSON.stringify({ method, path }) }),
      env,
    );
    if (!boot.ok) return boot;
    const { actionCode } = await boot.json();
    return worker.fetch(
      new Request(`https://worker.test${path}`, {
        method,
        headers: { ...base, 'X-Action-Code': actionCode },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  }

  return { worker, env, call };
}
