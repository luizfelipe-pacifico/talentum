-- Central de notificações, revisão mensal e tipo do ponto de restauração.
--
-- As notificações são derivadas dos dados locais a cada consulta; só o estado
-- que a pessoa muda (lida, dispensada) é gravado, por chave estável
-- (tipo, assunto, período). As preferências usam `UserPreference`.
--
-- Migration aditiva: nenhuma tabela já aplicada é reconstruída nem apagada.

-- CreateTable
CREATE TABLE "NotificationState" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"key" TEXT NOT NULL,"kind" TEXT NOT NULL,"readAt" DATETIME,"dismissedAt" DATETIME,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,CONSTRAINT "NotificationState_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE);

-- CreateTable
CREATE TABLE "MonthlyReview" ("id" TEXT NOT NULL PRIMARY KEY,"profileId" TEXT NOT NULL,"month" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "MonthlyReview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE);

-- AlterTable
ALTER TABLE "DatabaseBackup" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE UNIQUE INDEX "NotificationState_profileId_key_key" ON "NotificationState"("profileId","key");
CREATE INDEX "NotificationState_profileId_updatedAt_idx" ON "NotificationState"("profileId","updatedAt");
CREATE UNIQUE INDEX "MonthlyReview_profileId_month_key" ON "MonthlyReview"("profileId","month");
