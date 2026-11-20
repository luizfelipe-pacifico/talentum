import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Erros do Prisma sem tradução (docs/SECURITY.md, item aberto 18).

   Renomear uma categoria para um nome que já existe, cadastrar a mesma chave PIX
   em duas abas, renomear uma instituição ao mesmo tempo que outra janela, criar
   uma regra repetida ou parear de novo uma transferência terminavam em `500`
   com corpo vazio: a checagem prévia passava nas duas requisições e a escrita
   batia na restrição única (P2002) ou não achava mais a linha (P2025). Nada
   vazava, mas o contrato de erro `{error:{code,message}}` quebrava e a tela não
   sabia o que dizer. O mapeamento é um só, em src/server, e as rotas o usam. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o classificador reconhece violação de unicidade e registro ausente', async () => {
  const { prismaErrorKind } = await import(new URL('src/server/prisma-errors.ts', root).href);
  const known = (code) => Object.assign(new Error(code), { name: 'PrismaClientKnownRequestError', code });
  assert.equal(prismaErrorKind(known('P2002')), 'conflict');
  assert.equal(prismaErrorKind(known('P2025')), 'not_found');
  assert.equal(prismaErrorKind(known('P2003')), null, 'outros códigos seguem como falha interna');
  assert.equal(prismaErrorKind(new Error('P2002')), null, 'só o erro conhecido do Prisma é classificado');
  assert.equal(prismaErrorKind(null), null);
  assert.equal(prismaErrorKind({ code: 'P2002' }), null, 'um objeto qualquer com código não é erro do Prisma');
});

test('a borda HTTP traduz P2002 em 409 e P2025 em 404 no formato único', async () => {
  const http = await read('src/server/http.ts');
  assert.match(http, /export function prismaFailure\(/);
  assert.match(http, /prismaErrorKind\(/);
  assert.match(http, /'conflict'[\s\S]{0,200}409/);
  assert.match(http, /'not_found'[\s\S]{0,200}404/);
});

test('as rotas listadas no item 18 usam o mapeamento compartilhado', async () => {
  const routes = [
    'src/app/api/categories/route.ts',
    'src/app/api/categories/[categoryId]/route.ts',
    'src/app/api/accounts/[accountId]/pix-identifiers/route.ts',
    'src/app/api/accounts/[accountId]/pix-identifiers/[pixIdentifierId]/route.ts',
    'src/app/api/institutions/route.ts',
    'src/app/api/institutions/[institutionId]/route.ts',
    'src/app/api/merchant-rules/route.ts',
    'src/app/api/reconciliation-items/[reconciliationItemId]/decisions/route.ts',
    'src/app/api/reconciliation-decisions/[decisionId]/revert/route.ts',
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /prismaFailure\(/, path);
    assert.doesNotMatch(source, /\bthrow error\b/, `${path}: erro inesperado não pode subir sem tradução`);
  }
});
