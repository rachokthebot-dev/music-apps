-- CreateTable
CREATE TABLE "Setlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'paste',
    "sourceUrl" TEXT,
    "referenceLufs" REAL NOT NULL DEFAULT -14.0,
    "rhythmOffsetDb" REAL NOT NULL DEFAULT 1.5,
    "chorusOffsetDb" REAL NOT NULL DEFAULT 1.5,
    "soloOffsetDb" REAL NOT NULL DEFAULT 3.0,
    "anchorRole" TEXT NOT NULL DEFAULT 'clean',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SetlistSong" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setlistId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL DEFAULT '',
    "lickbankVideoUrl" TEXT,
    "lickbankSourceId" TEXT,
    "shreddyVideoUrl" TEXT,
    "shreddySongId" TEXT,
    "presetChoice" TEXT NOT NULL DEFAULT 'none',
    "presetName" TEXT,
    "presetUrl" TEXT,
    "presetPath" TEXT,
    "presetTrimDb" REAL,
    "importStatus" TEXT NOT NULL DEFAULT 'pending',
    "importError" TEXT,
    CONSTRAINT "SetlistSong_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresetSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'rhythm',
    "estimatedDb" REAL,
    "roleSource" TEXT NOT NULL DEFAULT 'rank',
    CONSTRAINT "PresetSnapshot_songId_fkey" FOREIGN KEY ("songId") REFERENCES "SetlistSong" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SetlistSong_setlistId_orderIndex_idx" ON "SetlistSong"("setlistId", "orderIndex");

-- CreateIndex
CREATE INDEX "PresetSnapshot_songId_index_idx" ON "PresetSnapshot"("songId", "index");
