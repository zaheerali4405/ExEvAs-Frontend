// Mirrors DEFAULT_EXAM_RULES in the backend's events.service.ts — what a
// (category, scope) pair falls back to when it has no row of its own.
// Conservative on purpose: an exam needs its resources rather than silently
// skipping them.
export const DEFAULT_EXAM_RULES = {
  allowsMultiplePapers: false,
  allowsMultipleVenues: false,
  allowsDateRange: false,
  allowsDateSplit: false,
  needsTimeSlot: true,
  needsVenue: true,
  needsStaff: true,
  needsEquipment: true,
  allowsRetake: true,
};

// Rules for one (category, scope) pair out of the flat matrix.
export function rulesForPair(rules, examCategoryId, examScopeId) {
  const row = rules.find(
    (r) => r.examCategoryId === examCategoryId && r.examScopeId === examScopeId
  );
  return row ? { ...DEFAULT_EXAM_RULES, ...row } : { ...DEFAULT_EXAM_RULES };
}

// Whether ANY scope grants a flag for this category. Used only where the
// scope isn't known yet — the category dropdown is filled before an exam
// type is picked, and offering a category there that some scope does allow
// is the permissive, non-blocking choice; the real per-pair rule is enforced
// once the exam type (and so the scope) is chosen, and again server-side.
export function anyScopeAllows(rules, examCategoryId, flag) {
  const rows = rules.filter((r) => r.examCategoryId === examCategoryId);
  if (rows.length === 0) return DEFAULT_EXAM_RULES[flag];
  return rows.some((r) => r[flag]);
}
