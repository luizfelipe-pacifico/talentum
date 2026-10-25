import test from 'node:test'; import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(path)=>readFile(new URL(path,root),'utf8');

/* robots.txt e sitemap.xml da LP. O que é privado não pode ser anunciado a
   buscadores, e o domínio anunciado precisa ser o da LP publicada. */

test('o domínio canônico é o da LP publicada',async()=>{
  const site=await read('apps/web/src/site.ts');
  assert.match(site,/SITE_URL = 'https:\/\/talentum-tech\.vercel\.app'/);
});

test('robots bloqueia downloads e BFF e aponta o sitemap',async()=>{
  const robots=await read('apps/web/src/app/robots.ts');
  assert.match(robots,/disallow: \['\/api\/', '\/downloads'\]/);
  assert.match(robots,/sitemap: `\$\{SITE_URL\}\/sitemap\.xml`/);
});

test('sitemap lista só páginas públicas',async()=>{
  const sitemap=await read('apps/web/src/app/sitemap.ts');
  assert.match(sitemap,/url: `\$\{SITE_URL\}\/`/);
  for(const leak of ["/downloads'","`${SITE_URL}/downloads","`${SITE_URL}/api"])assert.ok(!sitemap.includes(leak),leak);
});

test('a LP é indexável e entrega os metadados no <head> para qualquer robô',async()=>{
  const layout=await read('apps/web/src/app/layout.tsx');
  assert.match(layout,/robots:\s*\{\s*index: true,\s*follow: true/);
  assert.match(layout,/alternates: \{ canonical: '\/' \}/);
  assert.match(layout,/metadataBase: new URL\(SITE_URL\)/);
  // Layout dinâmico (nonce da CSP): sem isto o Next transmite os metadados no corpo.
  assert.match(await read('apps/web/next.config.ts'),/htmlLimitedBots: \/\.\*\//);
});

test('os ícones da LP são SVG do Bootstrap Icons, sem a fonte de ícones',async()=>{
  assert.doesNotMatch(await read('apps/web/src/app/layout.tsx'),/bootstrap-icons\.css/);
  const mapa=await read('apps/web/src/components/lp/icons.tsx');
  const usados=new Set();
  for(const arquivo of ['landing-page.tsx','carousel.tsx','motion.tsx','legal.tsx']){
    const fonte=await read(`apps/web/src/components/lp/${arquivo}`);
    assert.doesNotMatch(fonte,/<i className=/,`${arquivo} ainda usa a fonte de ícones`);
    for(const [,nome] of fonte.matchAll(/['"`\s](bi-[a-z0-9-]+)/g))usados.add(nome);
  }
  // Ícone novo exige rodar scripts/gerar-icones-lp.mjs.
  for(const nome of usados)assert.ok(mapa.includes(`'${nome}':`),`ícone ausente do mapa: ${nome}`);
});

test('sitemap e robots não importam o sistema desktop',async()=>{
  for(const path of ['apps/web/src/app/robots.ts','apps/web/src/app/sitemap.ts','apps/web/src/site.ts'])
    assert.doesNotMatch(await read(path),/electron|@prisma|src\/server\/db|sqlite/i,path);
});
