-- Perfil local único (docs/SECURITY.md, item 19): dois POST simultâneos em
-- /api/profile ou /api/onboarding criavam dois LocalProfile. A coluna nasce com
-- a constante 'local' e o índice único faz a segunda criação falhar com P2002,
-- que a API trata relendo o perfil existente.
ALTER TABLE "LocalProfile" ADD COLUMN "singletonKey" TEXT NOT NULL DEFAULT 'local';

-- Banco que já sofreu a corrida: o perfil mais antigo, o que a API usa
-- (src/server/profile.ts), fica com a constante; os demais recebem o próprio id,
-- que é único. Nada é apagado.
UPDATE "LocalProfile" SET "singletonKey" = "id"
WHERE "id" <> (SELECT "id" FROM "LocalProfile" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);

CREATE UNIQUE INDEX "LocalProfile_singletonKey_key" ON "LocalProfile"("singletonKey");

-- Lançamento manual em dinheiro com chave de idempotência gerada pelo cliente:
-- reenviar o mesmo pedido devolve o lançamento já gravado em vez de duplicá-lo.
-- Lançamentos importados ficam com NULL, que o SQLite não compara em índice único.
ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Transaction_profileId_idempotencyKey_key" ON "Transaction"("profileId", "idempotencyKey");
