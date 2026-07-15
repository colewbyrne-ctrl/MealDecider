// Display formatters for recipe metadata.

export function formatTime(minutes: number): string {
  return minutes > 0 ? `${minutes} min` : "Unknown";
}

export function formatDifficulty(difficulty: string | null | undefined): string {
  return difficulty && difficulty !== "unknown" ? difficulty : "Unknown";
}
