-- Migrates Lick from single-folder (Lick.folderId) to M2M (LickFolder).
-- Also drops Lick.orderIndex; per-folder ordering now lives on LickFolder.orderIndex.
-- Order of operations: create LickFolder, backfill from Lick.folderId, then rebuild
-- Lick without folderId/orderIndex.

-- CreateTable
CREATE TABLE "LickFolder" (
    "lickId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("lickId", "folderId"),
    CONSTRAINT "LickFolder_lickId_fkey" FOREIGN KEY ("lickId") REFERENCES "Lick" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LickFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: copy Lick.folderId into LickFolder, carrying Lick.orderIndex through as
-- the per-folder order. addedAt defaults to current time since we have no original
-- timestamp for the assignment.
INSERT INTO "LickFolder" ("lickId", "folderId", "orderIndex", "addedAt")
SELECT "id", "folderId", "orderIndex", CURRENT_TIMESTAMP
FROM "Lick"
WHERE "folderId" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL NOT NULL,
    "durationSec" REAL NOT NULL,
    "videoClipPath" TEXT,
    "audioClipPath" TEXT,
    "lastPositionSec" REAL NOT NULL DEFAULT 0,
    "lastTempo" REAL NOT NULL DEFAULT 1.0,
    "lastPitch" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lick_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lick" ("audioClipPath", "createdAt", "durationSec", "endSec", "id", "lastPitch", "lastPositionSec", "lastTempo", "name", "notes", "sourceId", "startSec", "updatedAt", "videoClipPath") SELECT "audioClipPath", "createdAt", "durationSec", "endSec", "id", "lastPitch", "lastPositionSec", "lastTempo", "name", "notes", "sourceId", "startSec", "updatedAt", "videoClipPath" FROM "Lick";
DROP TABLE "Lick";
ALTER TABLE "new_Lick" RENAME TO "Lick";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LickFolder_folderId_orderIndex_idx" ON "LickFolder"("folderId", "orderIndex");
