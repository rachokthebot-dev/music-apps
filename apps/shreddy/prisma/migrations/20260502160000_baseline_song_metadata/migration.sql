-- Catch-up migration: captures Song-table column additions made via `prisma db push`
-- between 20260323011403_add_musical_key and 2026-05-02. The DB already has these
-- columns, so this migration is marked as applied via `prisma migrate resolve --applied`
-- and is NOT re-executed against the existing database.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "originalFilePath" TEXT NOT NULL,
    "normalizedAudioPath" TEXT,
    "mimeType" TEXT NOT NULL,
    "durationSec" REAL,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "folderId" TEXT,
    "musicalKey" TEXT NOT NULL DEFAULT '',
    "bpm" REAL,
    "beatTimestamps" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "lastPositionSec" REAL NOT NULL DEFAULT 0,
    "lastTempo" REAL,
    "lastPitch" REAL,
    "lastSelectedSections" TEXT,
    "artist" TEXT NOT NULL DEFAULT '',
    "album" TEXT NOT NULL DEFAULT '',
    "genre" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "timeSignature" INTEGER NOT NULL DEFAULT 4,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Song" ("album", "artist", "beatTimestamps", "bpm", "createdAt", "durationSec", "errorMessage", "folderId", "genre", "id", "lastPitch", "lastPositionSec", "lastSelectedSections", "lastTempo", "mimeType", "musicalKey", "normalizedAudioPath", "notes", "originalFilePath", "originalFilename", "pinned", "processingStatus", "title", "updatedAt", "year") SELECT "album", "artist", "beatTimestamps", "bpm", "createdAt", "durationSec", "errorMessage", "folderId", "genre", "id", "lastPitch", "lastPositionSec", "lastSelectedSections", "lastTempo", "mimeType", "musicalKey", "normalizedAudioPath", "notes", "originalFilePath", "originalFilename", "pinned", "processingStatus", "title", "updatedAt", "year" FROM "Song";
DROP TABLE "Song";
ALTER TABLE "new_Song" RENAME TO "Song";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
