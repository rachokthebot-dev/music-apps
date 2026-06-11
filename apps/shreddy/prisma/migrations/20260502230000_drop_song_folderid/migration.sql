-- Drops Song.folderId. Folder membership now lives entirely in SongFolder
-- (backfilled in 20260502224955_add_song_folder_m2m). Application code no
-- longer reads or writes Song.folderId; verified via PATCH round-trip
-- against the live API before this migration was authored.

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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Song" ("album", "artist", "beatTimestamps", "bpm", "createdAt", "durationSec", "errorMessage", "genre", "id", "lastPitch", "lastPositionSec", "lastSelectedSections", "lastTempo", "mimeType", "musicalKey", "normalizedAudioPath", "notes", "originalFilePath", "originalFilename", "pinned", "processingStatus", "timeSignature", "title", "updatedAt", "year") SELECT "album", "artist", "beatTimestamps", "bpm", "createdAt", "durationSec", "errorMessage", "genre", "id", "lastPitch", "lastPositionSec", "lastSelectedSections", "lastTempo", "mimeType", "musicalKey", "normalizedAudioPath", "notes", "originalFilePath", "originalFilename", "pinned", "processingStatus", "timeSignature", "title", "updatedAt", "year" FROM "Song";
DROP TABLE "Song";
ALTER TABLE "new_Song" RENAME TO "Song";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
