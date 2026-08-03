-- CreateTable
CREATE TABLE "SourceSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "autoDetected" BOOLEAN NOT NULL DEFAULT false,
    "detectedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceSection_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SourceSection_sourceId_orderIndex_idx" ON "SourceSection"("sourceId", "orderIndex");
