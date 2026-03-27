-- AlterTable
ALTER TABLE "Section" ADD COLUMN "masteryRating" INTEGER;

-- AlterTable
ALTER TABLE "Song" ADD COLUMN "lastPitch" REAL;
ALTER TABLE "Song" ADD COLUMN "lastSelectedSections" TEXT;
ALTER TABLE "Song" ADD COLUMN "lastTempo" REAL;

-- CreateTable
CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSec" REAL,
    "tempo" REAL,
    "pitch" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PracticeSession_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionPracticeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "loopCount" INTEGER NOT NULL DEFAULT 0,
    "durationSec" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SectionPracticeLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SectionPracticeLog_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
