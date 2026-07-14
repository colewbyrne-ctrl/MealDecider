// Display formatters for recipe metadata.

export function formatTime(minutes) {
  return minutes > 0 ? `${minutes} min` : "Unknown";
}

export function formatDifficulty(difficulty) {
  return difficulty && difficulty !== "unknown" ? difficulty : "Unknown";
}
