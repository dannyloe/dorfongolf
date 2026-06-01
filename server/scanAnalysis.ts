type CorrectionLog = {
  id: number;
  geminiOutput: Array<{ playerName: string; holes: Array<{ holeNumber: number; strokes: number | null }> }>;
  appliedOutput: Array<{ playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> }>;
};

type HoleDiff = { hole: number; gemini: number | null; applied: number | null; changed: boolean };

export type DetectedPattern = {
  patternType: "hole_shift" | "digit_swap";
  patternKey: string;
  description: string;
  promptRule: string;
  occurrences: number;
  exampleLogIds: number[];
  machineGenerated?: boolean;
};

function buildDiffs(
  gp: { holes: Array<{ holeNumber: number; strokes: number | null }> },
  ap: { holes: Array<{ holeNumber: number; strokes: number }> }
): HoleDiff[] {
  const geminiMap = new Map<number, number | null>();
  for (const h of gp.holes) geminiMap.set(h.holeNumber, h.strokes);
  const appliedMap = new Map<number, number>();
  for (const h of ap.holes) appliedMap.set(h.holeNumber, h.strokes);

  const diffs: HoleDiff[] = [];
  for (let hole = 1; hole <= 18; hole++) {
    const gemini = geminiMap.has(hole) ? (geminiMap.get(hole) ?? null) : null;
    const applied = appliedMap.has(hole) ? (appliedMap.get(hole) ?? null) : null;
    diffs.push({ hole, gemini, applied, changed: gemini !== applied });
  }
  return diffs;
}

function detectShift(diffs: HoleDiff[]): boolean {
  const changed = diffs.filter(d => d.changed);
  if (changed.length < 3) return false;
  const sorted = [...changed].sort((a, b) => a.hole - b.hole);
  let consecutiveShifts = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (
      next.hole === cur.hole + 1 &&
      cur.gemini !== null &&
      next.applied !== null &&
      cur.gemini === next.applied
    ) {
      consecutiveShifts++;
    }
  }
  return consecutiveShifts >= 2;
}

export function analyzeCorrectionLogs(
  logs: CorrectionLog[],
  minOccurrences = 2,
  courseName?: string
): DetectedPattern[] {
  const keyPrefix = courseName ? `course:${courseName}:` : "";
  const courseLabel = courseName ? ` at ${courseName}` : "";

  const shiftLogIds: number[] = [];
  const swapMap = new Map<
    string,
    { count: number; logIds: number[]; hole: number; geminiVal: number; appliedVal: number }
  >();

  for (const log of logs) {
    let logHasShift = false;

    for (const ap of log.appliedOutput) {
      const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
      if (!gp) continue;
      const diffs = buildDiffs(gp, ap);
      const isShift = detectShift(diffs);

      if (!logHasShift && isShift) {
        logHasShift = true;
        shiftLogIds.push(log.id);
      }

      if (!isShift) {
        for (const d of diffs) {
          if (d.changed && d.gemini !== null && d.applied !== null) {
            const key = `${keyPrefix}hole:${d.hole}:${d.gemini}->${d.applied}`;
            if (!swapMap.has(key)) {
              swapMap.set(key, {
                count: 0,
                logIds: [],
                hole: d.hole,
                geminiVal: d.gemini,
                appliedVal: d.applied,
              });
            }
            const entry = swapMap.get(key)!;
            entry.count++;
            if (!entry.logIds.includes(log.id)) entry.logIds.push(log.id);
          }
        }
      }
    }
  }

  const patterns: DetectedPattern[] = [];

  if (shiftLogIds.length >= minOccurrences) {
    patterns.push({
      patternType: "hole_shift",
      patternKey: `${keyPrefix}hole_shift`,
      description: `Column shift detected in ${shiftLogIds.length} scan${shiftLogIds.length !== 1 ? "s" : ""}${courseLabel} — Gemini misaligns hole columns (front-9 total bleeds into hole 10 score)`,
      promptRule: courseName
        ? `IMPORTANT (${courseName}): Do NOT include Front 9, Back 9, or Total subtotal rows as hole scores. Subtotal cells appear between hole 9 and hole 10 columns — skip them entirely and map only the 18 individual hole score cells.`
        : "IMPORTANT: Do NOT include Front 9, Back 9, or Total subtotal rows as hole scores. Subtotal cells appear between hole 9 and hole 10 columns — skip them entirely and map only the 18 individual hole score cells.",
      occurrences: shiftLogIds.length,
      exampleLogIds: shiftLogIds.slice(0, 5),
    });
  }

  for (const [key, entry] of swapMap) {
    if (entry.count >= minOccurrences) {
      patterns.push({
        patternType: "digit_swap",
        patternKey: key,
        description: `Hole ${entry.hole}${courseLabel}: Gemini reads ${entry.geminiVal}, user corrects to ${entry.appliedVal} (${entry.count} time${entry.count !== 1 ? "s" : ""})`,
        promptRule: courseName
          ? `At ${courseName}, for hole ${entry.hole}, be especially careful — this digit is sometimes misread as ${entry.geminiVal} when it should be ${entry.appliedVal}. Double-check this cell before reporting it.`
          : `For hole ${entry.hole}, be especially careful — this digit is sometimes misread as ${entry.geminiVal} when it should be ${entry.appliedVal}. Double-check this cell before reporting it.`,
        occurrences: entry.count,
        exampleLogIds: entry.logIds.slice(0, 5),
      });
    }
  }

  return patterns.sort((a, b) => b.occurrences - a.occurrences);
}

export function analyzeByCourseName(
  logs: Array<CorrectionLog & { courseName?: string | null }>,
  minOccurrences = 2
): DetectedPattern[] {
  const byCourseName = new Map<string, CorrectionLog[]>();

  for (const log of logs) {
    const course = log.courseName?.trim() || "";
    if (!course) continue;
    if (!byCourseName.has(course)) byCourseName.set(course, []);
    byCourseName.get(course)!.push(log);
  }

  const all: DetectedPattern[] = [];
  for (const [course, courseLogs] of byCourseName) {
    if (courseLogs.length < minOccurrences) continue;
    const detected = analyzeCorrectionLogs(courseLogs, minOccurrences, course);
    for (const p of detected) {
      all.push({ ...p, machineGenerated: true });
    }
  }

  return all.sort((a, b) => b.occurrences - a.occurrences);
}
