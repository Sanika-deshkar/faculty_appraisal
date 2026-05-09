export const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const clampScore = (value, maxScore) => {
  const max = toNumber(maxScore);
  const score = Math.max(0, toNumber(value));
  return max > 0 ? Math.min(score, max) : score;
};

export const scoreRemaining = (earned, maxScore) =>
  Math.max(0, toNumber(maxScore) - clampScore(earned, maxScore));

export const SCORE_LIMITS = {
  courseFileRow: 2,
  innovativeRow: 2,
  qualificationRow: 5,
  feedbackAverage: 100,
  societyRow: 5,
  fdpRow: 5,
  projectGuidanceDefaultRow: 5,
  researchPhd: 20,
  researchPg: 10,
  researchInternalProjects: 15,
  researchExternalProjects: 30,
};

export const INNOVATIVE_METHODS = [
  "Blended Learning",
  "Virtual Lab",
  "LMS",
  "Project Based Learning",
  "Flip Classroom",
  "Any Other",
];

const normalizedText = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const splitListText = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const rowMaxValue = (rowMax, row, index) =>
  typeof rowMax === "function" ? rowMax(row, index) : rowMax;

export const innovativeSelectionsFromDetails = (details = "") => {
  const selected = splitListText(details);
  return INNOVATIVE_METHODS.filter((method) =>
    selected.some((item) => normalizedText(item) === normalizedText(method)),
  );
};

export const innovativeTeachingScore = (details = "", storedScore = "", maxScore = 10) => {
  const selectedCount = innovativeSelectionsFromDetails(details).length;
  const calculated = selectedCount * SCORE_LIMITS.innovativeRow;
  return clampScore(selectedCount ? calculated : storedScore, maxScore);
};

export const toggleInnovativeMethod = (details = "", method) => {
  const selected = splitListText(details);
  const methodKey = normalizedText(method);
  const exists = selected.some((item) => normalizedText(item) === methodKey);
  return exists
    ? selected.filter((item) => normalizedText(item) !== methodKey).join(", ")
    : [...selected, method].join(", ");
};

export const courseFileRowScore = (row = {}) =>
  clampScore(row.score, SCORE_LIMITS.courseFileRow);

export const courseFileAverageScore = (rows = [], maxScore = 20) => {
  const filled = rows.filter((row) => String(row?.score ?? "").trim() !== "");
  if (!filled.length) return 0;
  const avg = filled.reduce((total, row) => total + clampScore(row.score, SCORE_LIMITS.courseFileRow), 0) / filled.length;
  return clampScore(avg, maxScore);
};

export const projectGuidanceRowMax = (row = {}) => {
  const label = normalizedText(row.label);
  if (label.includes("3/batch")) return 3;
  if (label.includes("max 5") || label.includes("award") || label.includes("sponsorship") || label.includes("outcome")) return 5;
  return SCORE_LIMITS.projectGuidanceDefaultRow;
};

export const researchGuidanceRowMax = (row = {}) => {
  const degree = normalizedText(row.degree);
  if (degree.includes("pg") || degree.includes("post graduate") || degree.includes("postgraduate") || degree.includes("m.tech") || degree.includes("mtech") || degree.includes("master")) {
    return SCORE_LIMITS.researchPg;
  }
  if (degree.includes("phd") || degree.includes("ph.d") || degree.includes("doctor")) {
    return SCORE_LIMITS.researchPhd;
  }
  return 0;
};

export const researchGuidanceScore = (row = {}) => {
  const rowMax = researchGuidanceRowMax(row);
  if (!rowMax) return 0;
  return rowHasAnyValue(row, ["name", "thesis"])
    ? rowMax
    : clampScore(row.score, rowMax);
};

export const societySelectionForRow = (row = {}) => {
  const selected = row.participated ?? row.completed ?? row.yesNo ?? row.yes_no ?? "";
  if (selected) return selected;
  return toNumber(row.score) > 0 ? "Yes" : "";
};

export const societyRowScore = (row = {}) =>
  normalizedText(societySelectionForRow(row)) === "yes" ? SCORE_LIMITS.societyRow : 0;

export const effectiveMaxScore = (baseMax, applicability = {}, sections = []) =>
  Math.max(
    0,
    toNumber(baseMax) -
      sections.reduce(
        (total, section) =>
          applicability?.[section.key] === "notApplicable"
            ? total + toNumber(section.max)
            : total,
        0,
      ),
  );

export const sumSectionScore = (rows = [], maxScore, scoreKey = "score", rowMax) =>
  clampScore(
    rows.reduce((total, row, index) => {
      const rawScore = toNumber(row?.[scoreKey]);
      const maxForRow = rowMaxValue(rowMax, row, index);
      return total + (maxForRow ? clampScore(rawScore, maxForRow) : rawScore);
    }, 0),
    maxScore,
  );

export const sumCalculatedSectionScore = (rows = [], maxScore, rowScore) =>
  clampScore(
    rows.reduce((total, row, index) => total + clampScore(rowScore(row, index), maxScore), 0),
    maxScore,
  );

export const averageSectionScore = (rows = [], maxScore, scoreKey = "score") => {
  const filled = rows.filter((row) => String(row?.[scoreKey] ?? "").trim() !== "");
  if (!filled.length) return 0;
  return clampScore(
    filled.reduce((total, row) => total + toNumber(row?.[scoreKey]), 0) / filled.length,
    maxScore,
  );
};

export const feedbackAverage = (row = {}) => {
  const values = [row.fb1, row.fb2]
    .map((value) => clampScore(value, SCORE_LIMITS.feedbackAverage))
    .filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
};

export const feedbackRowScore = (row = {}, maxScore = 10) =>
  clampScore(feedbackAverage(row) / 10, maxScore);

export const feedbackSectionScore = (rows = [], maxScore = 10) => {
  const filled = rows.filter((row) =>
    ["code", "fb1", "fb2"].some((key) => String(row?.[key] ?? "").trim() !== ""),
  );
  if (!filled.length) return 0;
  return clampScore(
    filled.reduce((total, row) => total + feedbackRowScore(row, maxScore), 0) / filled.length,
    maxScore,
  );
};

export const rowMaxForSection = (sectionKey, row = {}, sectionMax = 0) => {
  if (sectionKey === "courseFile") return SCORE_LIMITS.courseFileRow;
  if (sectionKey === "projects") return projectGuidanceRowMax(row);
  if (sectionKey === "quals") return SCORE_LIMITS.qualificationRow;
  if (sectionKey === "feedback") return 10;
  if (sectionKey === "society") return SCORE_LIMITS.societyRow;
  if (sectionKey === "research") return researchGuidanceRowMax(row);
  if (sectionKey === "projects2" || sectionKey === "internalProjects") return SCORE_LIMITS.researchInternalProjects;
  if (sectionKey === "externalProjects") return SCORE_LIMITS.researchExternalProjects;
  if (sectionKey === "fdps" || sectionKey === "training") return SCORE_LIMITS.fdpRow;
  return sectionMax;
};

export const scoreSectionRows = (sectionKey, rows = [], maxScore, scoreKey = "score") => {
  if (sectionKey === "feedback" && scoreKey === "score") return feedbackSectionScore(rows, maxScore);
  if (sectionKey === "courseFile" && scoreKey === "score") return sumCalculatedSectionScore(rows, maxScore, courseFileRowScore);
  if (sectionKey === "research" && scoreKey === "score") return sumCalculatedSectionScore(rows, maxScore, researchGuidanceScore);
  if (sectionKey === "society" && scoreKey === "score") return sumCalculatedSectionScore(rows, maxScore, societyRowScore);
  return sumSectionScore(rows, maxScore, scoreKey, (row) => rowMaxForSection(sectionKey, row, maxScore));
};

export const normalizeAutoScores = (form = {}) => ({
  ...form,
  innovScore: String(innovativeTeachingScore(form.innovDetails, form.innovScore, 10)),
  courseFile: (form.courseFile || []).map((row) => ({
    ...row,
    score: courseFileRowScore(row) ? String(courseFileRowScore(row)) : "",
  })),
  feedback: (form.feedback || []).map((row) => ({
    ...row,
    score: feedbackRowScore(row, 10).toFixed(1),
  })),
  society: (form.society || []).map((row) => {
    const selection = societySelectionForRow(row);
    return {
      ...row,
      participated: selection,
      score: selection ? String(societyRowScore({ participated: selection })) : "",
    };
  }),
  research: (form.research || []).map((row) => ({
    ...row,
    score: researchGuidanceScore(row) ? String(researchGuidanceScore(row)) : "",
  })),
  projects: (form.projects || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, projectGuidanceRowMax(row)) || ""),
  })),
  projects2: (form.projects2 || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, SCORE_LIMITS.researchInternalProjects) || ""),
  })),
  internalProjects: (form.internalProjects || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, SCORE_LIMITS.researchInternalProjects) || ""),
  })),
  externalProjects: (form.externalProjects || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, SCORE_LIMITS.researchExternalProjects) || ""),
  })),
  quals: (form.quals || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, SCORE_LIMITS.qualificationRow) || ""),
  })),
  fdps: (form.fdps || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, SCORE_LIMITS.fdpRow) || ""),
  })),
  training: (form.training || []).map((row) => ({
    ...row,
    score: String(clampScore(row.score, SCORE_LIMITS.fdpRow) || ""),
  })),
});

export const isFilled = (value) => String(value ?? "").trim() !== "";

export const rowHasAnyValue = (row = {}, keys = []) =>
  keys.some((key) => isFilled(row?.[key]));

export const rowMissingFields = (row = {}, keys = []) =>
  keys.filter((key) => !isFilled(row?.[key]));

export const validateCompleteRows = (sections = []) => {
  const errors = [];

  sections.forEach(({ label, rows = [], fields = [], skip = false, rowMax, maxScore, scoreField = "score" }) => {
    if (skip) return;
    const labelText = normalizedText(label);
    const inferredRowMax = rowMax ?? (labelText.includes("fdp") || labelText.includes("industrial training") ? SCORE_LIMITS.fdpRow : undefined);

    rows.forEach((row, index) => {
      if (!rowHasAnyValue(row, fields)) return;

      const missing = rowMissingFields(row, fields);
      if (missing.length) {
        errors.push(`${label}, row ${index + 1}: fill all fields or clear the row.`);
      }

      const maxForRow = rowMaxValue(inferredRowMax, row, index);
      if (maxForRow && isFilled(row?.[scoreField]) && toNumber(row?.[scoreField]) > maxForRow) {
        errors.push(`${label}, row ${index + 1}: score cannot exceed ${maxForRow}.`);
      }
    });

    if (maxScore && rows.length) {
      const total = rows.reduce((sum, row, index) => {
        const maxForRow = rowMaxValue(inferredRowMax, row, index);
        const score = maxForRow ? clampScore(row?.[scoreField], maxForRow) : toNumber(row?.[scoreField]);
        return sum + score;
      }, 0);
      if (total > toNumber(maxScore)) {
        errors.push(`${label}: total score cannot exceed ${maxScore}.`);
      }
    }
  });

  return errors;
};

export const maskDateDDMMYYYY = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const isValidDDMMYYYY = (value) => {
  const text = String(value ?? "").trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

export const normalizeSingleFileDocs = (docs = {}) =>
  Object.fromEntries(
    Object.entries(docs || {}).map(([key, files]) => [
      key,
      Array.isArray(files) ? files.slice(0, 1) : [],
    ]),
  );

export const scoreSummaryText = (earned, maxScore) => ({
  earned: clampScore(earned, maxScore),
  max: toNumber(maxScore),
  remaining: scoreRemaining(earned, maxScore),
});

export const draftKeyFor = ({ family = "teaching", email = "", academicYear = "" }) =>
  `appraisal-draft:${family}:${String(email).toLowerCase()}:${academicYear}`;

export const loadDraft = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveDraft = (key, payload) => {
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({
    ...payload,
    savedAt: new Date().toISOString(),
  }));
};

export const clearDraft = (key) => {
  if (key) localStorage.removeItem(key);
};
