-- Stages 9, 12, 13 e 14: orçamento, metas, dívidas e patrimônio.
-- Aditiva: nenhuma tabela existente é reconstruída.

ALTER TABLE "Category" ADD COLUMN "isEssential" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Budget" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"month" TEXT NOT NULL,"limitCents" BIGINT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,CONSTRAINT "Budget_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "Budget_profileId_categoryId_month_key" ON "Budget"("profileId","categoryId","month");
CREATE INDEX "Budget_profileId_month_idx" ON "Budget"("profileId","month");
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");

CREATE TABLE "Goal" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"name" TEXT NOT NULL,"targetCents" BIGINT NOT NULL,"deadline" DATETIME,"status" TEXT NOT NULL DEFAULT 'active',"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,CONSTRAINT "Goal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "Goal_profileId_status_idx" ON "Goal"("profileId","status");

CREATE TABLE "GoalContribution" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"goalId" TEXT NOT NULL,"kind" TEXT NOT NULL DEFAULT 'deposit',"amountCents" BIGINT NOT NULL,"contributedOn" DATETIME NOT NULL,"idempotencyKey" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "GoalContribution_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "GoalContribution_profileId_idempotencyKey_key" ON "GoalContribution"("profileId","idempotencyKey");
CREATE INDEX "GoalContribution_goalId_contributedOn_idx" ON "GoalContribution"("goalId","contributedOn");
CREATE INDEX "GoalContribution_profileId_idx" ON "GoalContribution"("profileId");

CREATE TABLE "Debt" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"name" TEXT NOT NULL,"principalCents" BIGINT NOT NULL,"monthlyRateBps" INTEGER NOT NULL,"minimumPaymentCents" BIGINT NOT NULL,"overdueCents" BIGINT NOT NULL DEFAULT 0,"dueDay" INTEGER,"status" TEXT NOT NULL DEFAULT 'open',"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,CONSTRAINT "Debt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "Debt_profileId_status_idx" ON "Debt"("profileId","status");

CREATE TABLE "Asset" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"name" TEXT NOT NULL,"pillar" TEXT NOT NULL,"isActive" BOOLEAN NOT NULL DEFAULT true,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,CONSTRAINT "Asset_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "Asset_profileId_isActive_idx" ON "Asset"("profileId","isActive");

CREATE TABLE "AssetSnapshot" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"assetId" TEXT NOT NULL,"valueCents" BIGINT NOT NULL,"capturedAt" DATETIME NOT NULL,"idempotencyKey" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AssetSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "AssetSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "AssetSnapshot_profileId_idempotencyKey_key" ON "AssetSnapshot"("profileId","idempotencyKey");
CREATE INDEX "AssetSnapshot_assetId_capturedAt_idx" ON "AssetSnapshot"("assetId","capturedAt");
CREATE INDEX "AssetSnapshot_profileId_idx" ON "AssetSnapshot"("profileId");
