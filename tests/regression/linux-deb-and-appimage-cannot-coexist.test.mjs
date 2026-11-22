import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorker } from './helpers/worker.mjs';

/* Defeito (revisão dos instaladores, 21/11/2026): o AppImage não abre no Ubuntu
   24.04 e mais novos, que barram o sandbox do Chromium para apps sem perfil do
   AppArmor; lá o pacote certo é o .deb, cujo pós-instalação instala esse perfil.
   Mas `release_artifacts` tinha UNIQUE (release_id, platform, architecture):
   uma versão não podia publicar .deb e AppImage para Linux x64, e a página de
   downloads não tinha como dizer qual arquivo serve para qual distribuição.

   Correção: migration 0005 com `package_format` gerado da extensão do arquivo
   e incluído na chave única; a API devolve o formato e a página separa os
   pacotes do Linux por distribuição. */

const root = new URL('../../', import.meta.url);
const base = 'https://github.com/exemplo/talentum/releases/download/v0.1.0';

async function withRelease() {
  const worker = await createWorker();
  const t = new Date().toISOString();
  worker.env.DB.raw.exec(`INSERT INTO releases(id,version,channel,status,published_at,created_at,updated_at) VALUES('rel1','0.1.0','STABLE','PUBLISHED','${t}','${t}','${t}')`);
  const add = (id, platform, architecture, file) =>
    worker.env.DB.raw.exec(
      `INSERT INTO release_artifacts(id,release_id,platform,architecture,download_url,sha256,created_at) VALUES('${id}','rel1','${platform}','${architecture}','${base}/${file}','abc','${t}')`,
    );
  return { ...worker, add };
}

test('uma versão publica .deb e AppImage para Linux x64, cada um com o seu formato', async () => {
  const { add, call, session } = await withRelease();
  add('deb1', 'LINUX', 'x64', 'Talentum-0.1.0-Linux-amd64.deb');
  add('app1', 'LINUX', 'x64', 'Talentum-0.1.0-Linux-x86_64.AppImage');
  add('win1', 'WINDOWS', 'x64', 'Talentum-0.1.0-Windows-x64.exe');
  add('dmg1', 'MACOS', 'arm64', 'Talentum-0.1.0-macOS-arm64.dmg');
  const a = await session();
  const listed = await (await call('GET', '/api/releases', { headers: a.auth })).json();
  const formats = Object.fromEntries(listed.releases.map((item) => [item.artifactId, item.packageFormat]));
  assert.deepEqual(formats, { deb1: 'DEB', app1: 'APPIMAGE', win1: 'NSIS', dmg1: 'DMG' });
});

test('o mesmo formato não se repete e arquivo de tipo desconhecido não é listado', async () => {
  const { add, call, session } = await withRelease();
  add('deb1', 'LINUX', 'x64', 'Talentum-0.1.0-Linux-amd64.deb');
  assert.throws(() => add('deb2', 'LINUX', 'x64', 'outro.deb'), /UNIQUE/);
  add('sh1', 'LINUX', 'x64', 'instalar.sh');
  const a = await session();
  const listed = await (await call('GET', '/api/releases', { headers: a.auth })).json();
  assert.deepEqual(listed.releases.map((item) => item.artifactId), ['deb1']);
});

test('a página de downloads separa os pacotes do Linux por distribuição', async () => {
  const page = await readFile(new URL('apps/web/src/app/downloads/page.tsx', root), 'utf8');
  assert.match(page, /packageFormat/);
  assert.match(page, /Ubuntu/);
  assert.match(page, /AppImage/);
});
