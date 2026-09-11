-- CreateTable
CREATE TABLE "ScheduledObligation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "recurrence" TEXT NOT NULL DEFAULT 'none',
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledObligation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledObligation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ScheduledObligation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduledObligation_profileId_status_dueDate_idx" ON "ScheduledObligation"("profileId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ScheduledObligation_accountId_idx" ON "ScheduledObligation"("accountId");

-- CreateIndex
CREATE INDEX "ScheduledObligation_categoryId_idx" ON "ScheduledObligation"("categoryId");
