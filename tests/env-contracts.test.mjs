import test from 'node:test'; import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(path)=>readFile(new URL(path,root),'utf8');
const declared=(source)=>new Set([...source.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(([,name])=>name));

/* O `.env.example` é o contrato de configuração: quem clona o repositório precisa
   saber o que existe sem ler o Compose nem o código. Estes testes existem para
   que uma variável nova não passe a ser exigida em silêncio. */

test('o exemplo declara a configuração local, a do Docker e a da borda',async()=>{
  const names=declared(await read('.env.example'));
  for(const name of ['DATABASE_URL','DOCKER_DATABASE_URL','CLOUDFLARE_API_BASE_URL','CLOUDFLARE_BFF_SHARED_SECRET'])
    assert.ok(names.has(name),`.env.example não declara ${name}`);
});

test('toda variável substituída no Compose está documentada no exemplo',async()=>{
  const names=declared(await read('.env.example'));
  const compose=await read('compose.yaml');
  for(const [,name] of compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g))
    assert.ok(names.has(name),`compose.yaml usa ${name}, ausente do .env.example`);
});

test('o exemplo só contém placeholder sintético',async()=>{
  const example=await read('.env.example');
  // Um valor real de segredo ou de infraestrutura nunca pode chegar ao Git.
  assert.match(example,/CLOUDFLARE_BFF_SHARED_SECRET="segredo-sintetico[^"]*"/);
  assert.match(example,/CLOUDFLARE_API_BASE_URL="https:\/\/worker-exemplo\.workers\.dev"/);
  for(const [,value] of example.matchAll(/^[A-Z][A-Z0-9_]*="([^"]*)"$/gm))
    assert.ok(!/^[A-Za-z0-9_-]{32,}$/.test(value),`valor longo e opaco parece segredo real: ${value.slice(0,6)}…`);
});

test('arquivos de segredo local continuam fora do Git',async()=>{
  const ignore=await read('.gitignore');
  for(const entry of ['.env','.dev.vars','*.db','temp/'])assert.ok(ignore.includes(entry),`.gitignore não cobre ${entry}`);
  assert.match(ignore,/^!\.env\.example$/m);
});

test('o banco financeiro nunca é configurado no Worker',async()=>{
  // O D1 é do Worker; o SQLite é do app local. Cruzar isso quebraria o limite
  // documentado em docs/CLOUDFLARE_SETUP.md.
  assert.doesNotMatch(await read('cloudflare/wrangler.jsonc'),/DATABASE_URL|sqlite|prisma/i);
  assert.doesNotMatch(await read('cloudflare/.dev.vars.example'),/DATABASE_URL|sqlite/i);
});
