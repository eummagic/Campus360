/** Stable subject accent selection shared by the timetable and offering pages. */
export function getSubjectColorIndex(subjectCode: string): number {
  let hash = 0;
  for (const character of subjectCode.trim().toUpperCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % 8;
}
