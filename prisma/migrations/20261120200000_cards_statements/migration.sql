-- Stage 8 (cartões, faturas e benefícios) e o leitor de PDF do Stage 7.
-- Toda tabela tem id opaco e se relaciona por chave estrangeira de id; dinheiro
-- em centavos inteiros (BIGINT). Só cria coluna nullable e tabelas novas: nada
-- existente é alterado ou removido.

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN "parser" TEXT;

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "institutionId" TEXT,
    "paymentAccountId" TEXT,
    "name" TEXT NOT NULL,
    "lastFourDigits" TEXT,
    "closingDay" INTEGER,
    "dueDay" INTEGER NOT NULL,
    "limitCents" BIGINT,
    "annualFeeCents" BIGINT,
    "feeWaiverSpendCents" BIGINT,
    "feeWaiverPeriod" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditCard_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditCard_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditCard_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "periodStart" DATETIME,
    "closingDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "totalCents" BIGINT NOT NULL,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardStatement_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardStatement_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardStatementItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "cardStatementId" TEXT NOT NULL,
    "occurredOn" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "installmentNumber" INTEGER,
    "installmentCount" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardStatementItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardStatementItem_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardStatementPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "cardStatementId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardStatementPayment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardStatementPayment_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardStatementPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardBenefit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,
    "expiringBalance" BIGINT,
    "expiresOn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardBenefit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardBenefit_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreditCard_profileId_isActive_idx" ON "CreditCard"("profileId", "isActive");

-- CreateIndex
CREATE INDEX "CreditCard_institutionId_idx" ON "CreditCard"("institutionId");

-- CreateIndex
CREATE INDEX "CreditCard_paymentAccountId_idx" ON "CreditCard"("paymentAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_profileId_name_key" ON "CreditCard"("profileId", "name");

-- CreateIndex
CREATE INDEX "CardStatement_profileId_status_dueDate_idx" ON "CardStatement"("profileId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_creditCardId_dueDate_key" ON "CardStatement"("creditCardId", "dueDate");

-- CreateIndex
CREATE INDEX "CardStatementItem_profileId_occurredOn_idx" ON "CardStatementItem"("profileId", "occurredOn");

-- CreateIndex
CREATE INDEX "CardStatementItem_cardStatementId_occurredOn_idx" ON "CardStatementItem"("cardStatementId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatementItem_cardStatementId_externalId_key" ON "CardStatementItem"("cardStatementId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatementPayment_transactionId_key" ON "CardStatementPayment"("transactionId");

-- CreateIndex
CREATE INDEX "CardStatementPayment_profileId_createdAt_idx" ON "CardStatementPayment"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "CardStatementPayment_cardStatementId_idx" ON "CardStatementPayment"("cardStatementId");

-- CreateIndex
CREATE INDEX "CardBenefit_profileId_expiresOn_idx" ON "CardBenefit"("profileId", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "CardBenefit_creditCardId_kind_programName_key" ON "CardBenefit"("creditCardId", "kind", "programName");
