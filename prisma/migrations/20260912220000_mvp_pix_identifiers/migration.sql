-- Feature 2 do docs/ROUTING_MVP.md: identificadores PIX próprios.
--
-- Existem para reconhecer transferência entre contas da própria pessoa, que não
-- é receita nem despesa (docs/ONBOARDING.md). O valor nunca é gravado em texto
-- puro: `valueIndex` é um HMAC com segredo do dispositivo — e não um hash
-- simples, porque CPF, telefone e e-mail têm espaço de valores previsível — e
-- `valueCiphertext` guarda o valor sob AES-256-GCM.
--
-- Migration aditiva: nenhuma tabela já aplicada é reconstruída.

-- CreateTable
CREATE TABLE "PixIdentifier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "valueIndex" TEXT NOT NULL,
    "valueCiphertext" TEXT NOT NULL,
    "maskedValue" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'declared',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PixIdentifier_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PixIdentifier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: a mesma chave não pertence a duas contas da mesma pessoa.
CREATE UNIQUE INDEX "PixIdentifier_profileId_valueIndex_key" ON "PixIdentifier"("profileId", "valueIndex");

-- CreateIndex
CREATE INDEX "PixIdentifier_accountId_idx" ON "PixIdentifier"("accountId");

-- CreateIndex
CREATE INDEX "PixIdentifier_profileId_isActive_idx" ON "PixIdentifier"("profileId", "isActive");
