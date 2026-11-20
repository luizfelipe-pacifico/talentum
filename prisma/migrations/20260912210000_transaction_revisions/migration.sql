CREATE TABLE "TransactionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionRevision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransactionRevision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TransactionRevision_profileId_createdAt_idx" ON "TransactionRevision"("profileId", "createdAt");
CREATE INDEX "TransactionRevision_transactionId_createdAt_idx" ON "TransactionRevision"("transactionId", "createdAt");
