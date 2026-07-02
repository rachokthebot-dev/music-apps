-- CreateTable
CREATE TABLE "GeneratedPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceApp" TEXT NOT NULL DEFAULT 'soundpath',
    "flow" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "hardwareTarget" TEXT,
    "tones" TEXT,
    "hlx" TEXT NOT NULL,
    "snapshots" TEXT,
    "loudness" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GeneratedPreset_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GeneratedPreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
