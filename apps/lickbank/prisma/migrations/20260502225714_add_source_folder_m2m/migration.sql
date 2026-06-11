-- CreateTable
CREATE TABLE "SourceFolder" (
    "sourceId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("sourceId", "folderId"),
    CONSTRAINT "SourceFolder_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SourceFolder_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SourceFolder_folderId_orderIndex_idx" ON "SourceFolder"("folderId", "orderIndex");
