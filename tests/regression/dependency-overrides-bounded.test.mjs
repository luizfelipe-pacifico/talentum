import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Um override de segurança escrito como `effect: '>=3.22.5'` não tem teto: o
   pnpm resolveu `effect` 4.x, uma major incompatível, e a CLI do Prisma passou
   a falhar em `migrate deploy` (`members.map is not a function`). Override que
   corrige vulnerabilidade sobe o patch dentro da mesma major (`^x.y.z`) ou fixa
   a versão exata; nunca fica aberto para cima. */

const root = new URL('../../', import.meta.url);

test('overrides de dependências não aceitam uma major nova por acidente', async () => {
  const yaml = await readFile(new URL('pnpm-workspace.yaml', root), 'utf8');
  const block = yaml.split(/^overrides:\s*$/m)[1]?.split(/^\S/m)[0] ?? '';
  const entries = [...block.matchAll(/^\s+['"]?([^'":#\s]+)['"]?:\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)];
  assert.ok(entries.length > 0, 'nenhum override encontrado');
  for (const [, name, spec] of entries) {
    assert.doesNotMatch(spec, /^\s*>|\*|^\s*x\b|\s\|\|\s|^latest$/, `${name}: ${spec} não tem teto de major`);
  }
});
