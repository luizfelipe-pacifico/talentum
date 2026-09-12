-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentStep" TEXT NOT NULL DEFAULT 'profile',
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnboardingAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "onboardingSessionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingAnswer_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "OnboardingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OnboardingAnswer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LocalProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OnboardingSession_profileId_status_updatedAt_idx" ON "OnboardingSession"("profileId", "status", "updatedAt");
CREATE UNIQUE INDEX "OnboardingAnswer_onboardingSessionId_questionKey_key" ON "OnboardingAnswer"("onboardingSessionId", "questionKey");
CREATE INDEX "OnboardingAnswer_profileId_idx" ON "OnboardingAnswer"("profileId");
