-- CreateTable
CREATE TABLE "SongFolder" (
    "songId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("songId", "folderId"),
    CONSTRAINT "SongFolder_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SongFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SongFolder_folderId_orderIndex_idx" ON "SongFolder"("folderId", "orderIndex");

-- Backfill: copy existing Song.folderId values into the new join table.
-- Song.folderId remains in place for now; a follow-up migration will drop it
-- once application code reads/writes folder membership exclusively via SongFolder.
INSERT INTO "SongFolder" ("songId", "folderId", "orderIndex", "addedAt")
SELECT "id", "folderId", 0, CURRENT_TIMESTAMP
FROM "Song"
WHERE "folderId" IS NOT NULL;
