// Graded-reader levels. Shared by the site and the server (vocab prompts).
export const LEVELS = [
  { id: "starter", label: "Starter", cefr: "A1",    color: "#2F9E6B" },
  { id: "level1",  label: "Level 1", cefr: "A1–A2", color: "#6FA82E" },
  { id: "level2",  label: "Level 2", cefr: "A2–B1", color: "#C99A06" },
  { id: "level3",  label: "Level 3", cefr: "B1",    color: "#D9731C" },
  { id: "level4",  label: "Level 4", cefr: "B1–B2", color: "#D64545" },
  { id: "level5",  label: "Level 5", cefr: "B2",    color: "#8B5CC7" },
  { id: "level6",  label: "Level 6", cefr: "C1",    color: "#2F6FD6" },
];

export const getLevel = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];
