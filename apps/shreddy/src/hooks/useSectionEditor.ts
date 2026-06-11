import { useState, useCallback } from "react";

interface Section {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
  autoDetected: boolean;
  masteryRating: number | null;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useSectionEditor() {
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [sectionStart, setSectionStart] = useState("");
  const [sectionEnd, setSectionEnd] = useState("");

  const openNewSection = useCallback((currentTime: number, duration: number) => {
    setEditingSection(null);
    setSectionName("");
    setSectionStart(formatTime(currentTime));
    setSectionEnd(formatTime(Math.min(currentTime + 30, duration)));
    setSectionDialogOpen(true);
  }, []);

  const openEditSection = useCallback((section: Section) => {
    setEditingSection(section);
    setSectionName(section.name);
    setSectionStart(formatTime(section.startSec));
    setSectionEnd(formatTime(section.endSec));
    setSectionDialogOpen(true);
  }, []);

  const setStartToCurrent = useCallback((currentTime: number) => {
    setSectionStart(formatTime(currentTime));
  }, []);

  const setEndToCurrent = useCallback((currentTime: number) => {
    setSectionEnd(formatTime(currentTime));
  }, []);

  function parseTime(str: string): number {
    const parts = str.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }

  const getParsedTimes = useCallback(() => {
    // If the displayed string still matches the original (floored) format, the
    // user didn't touch that field — preserve the original sub-second precision
    // so editing the name doesn't silently round boundaries down and create
    // gaps next to neighbors that were dragged with sub-second precision.
    const startSec =
      editingSection && sectionStart === formatTime(editingSection.startSec)
        ? editingSection.startSec
        : parseTime(sectionStart);
    const endSec =
      editingSection && sectionEnd === formatTime(editingSection.endSec)
        ? editingSection.endSec
        : parseTime(sectionEnd);
    return { startSec, endSec };
  }, [sectionStart, sectionEnd, editingSection]);

  const closeDialog = useCallback(() => {
    setSectionDialogOpen(false);
  }, []);

  return {
    sectionDialogOpen,
    setSectionDialogOpen,
    editingSection,
    sectionName,
    setSectionName,
    sectionStart,
    setSectionStart,
    sectionEnd,
    setSectionEnd,
    openNewSection,
    openEditSection,
    setStartToCurrent,
    setEndToCurrent,
    getParsedTimes,
    closeDialog,
  };
}
