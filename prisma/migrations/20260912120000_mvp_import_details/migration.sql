-- Feature 4 do docs/ROUTING_MVP.md: detalhes da importação de extrato.
--
-- As colunas novas entram por ALTER TABLE, e não por reconstrução de tabela:
-- as migrations já aplicadas nunca são reescritas (docs/ROUTING_MVP.md, regra 7)
-- e nenhum dado existente pode ser movido por uma migration aditiva.

-- AlterTable: ImportBatch passa a registrar o período coberto pelo arquivo.
-- Sem isso o sistema não distingue "mês sem movimento" de "mês sem extrato"
-- (docs/DASHBOARD.md, lacuna L-2).
ALTER TABLE "ImportBatch" ADD COLUMN "accountId" TEXT REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD COLUMN "periodStart" DATETIME;
ALTER TABLE "ImportBatch" ADD COLUMN "periodEnd" DATETIME;
ALTER TABLE "ImportBatch" ADD COLUMN "rowCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "importedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "duplicateCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: chave estável do lançamento no banco de origem.
ALTER TABLE "Transaction" ADD COLUMN "externalId" TEXT;

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importBatchId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportFile_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importBatchId" TEXT NOT NULL,
    "transactionId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportIssue_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImportIssue_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CsvMappingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "institutionId" TEXT,
    "name" TEXT NOT NULL,
    "separator" TEXT NOT NULL,
    "hasHeader" BOOLEAN NOT NULL DEFAULT true,
    "decimalSeparator" TEXT NOT NULL DEFAULT 'auto',
    "roles" TEXT NOT NULL,
    "headerSignature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CsvMappingProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CsvMappingProfile_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImportBatch_accountId_idx" ON "ImportBatch"("accountId");

-- CreateIndex
CREATE INDEX "ImportBatch_profileId_periodStart_periodEnd_idx" ON "ImportBatch"("profileId", "periodStart", "periodEnd");

-- CreateIndex: a deduplicação por lançamento. NULL é distinto de NULL no
-- SQLite, então lançamentos sem identificador de origem continuam permitidos.
CREATE UNIQUE INDEX "Transaction_accountId_externalId_key" ON "Transaction"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "ImportFile_importBatchId_idx" ON "ImportFile"("importBatchId");

-- CreateIndex
CREATE INDEX "ImportFile_contentHash_idx" ON "ImportFile"("contentHash");

-- CreateIndex
CREATE INDEX "ImportIssue_importBatchId_idx" ON "ImportIssue"("importBatchId");

-- CreateIndex
CREATE INDEX "ImportIssue_transactionId_idx" ON "ImportIssue"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CsvMappingProfile_profileId_name_key" ON "CsvMappingProfile"("profileId", "name");

-- CreateIndex
CREATE INDEX "CsvMappingProfile_profileId_idx" ON "CsvMappingProfile"("profileId");

-- CreateIndex
CREATE INDEX "CsvMappingProfile_profileId_headerSignature_idx" ON "CsvMappingProfile"("profileId", "headerSignature");
