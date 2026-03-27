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
    "notes" TEXT NOT NULL DEFAULT '',
    "lastPositionSec" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Song_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Song" ("createdAt", "durationSec", "errorMessage", "folderId", "id", "mimeType", "normalizedAudioPath", "originalFilePath", "originalFilename", "pinned", "processingStatus", "title", "updatedAt") SELECT "createdAt", "durationSec", "errorMessage", "folderId", "id", "mimeType", "normalizedAudioPath", "originalFilePath", "originalFilename", "pinned", "processingStatus", "title", "updatedAt" FROM "Song";
DROP TABLE "Song";
ALTER TABLE "new_Song" RENAME TO "Song";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
