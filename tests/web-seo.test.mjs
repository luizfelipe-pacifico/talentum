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

test('sitemap e robots não importam o sistema desktop',async()=>{
  for(const path of ['apps/web/src/app/robots.ts','apps/web/src/app/sitemap.ts','apps/web/src/site.ts'])
    assert.doesNotMatch(await read(path),/electron|@prisma|src\/server\/db|sqlite/i,path);
});
