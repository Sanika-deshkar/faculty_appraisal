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

export const sumSectionScore = (rows = [], maxScore, scoreKey = "score") =>
  clampScore(rows.reduce((total, row) => total + toNumber(row?.[scoreKey]), 0), maxScore);

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
    .map(toNumber)
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

export const isFilled = (value) => String(value ?? "").trim() !== "";

export const rowHasAnyValue = (row = {}, keys = []) =>
  keys.some((key) => isFilled(row?.[key]));

export const rowMissingFields = (row = {}, keys = []) =>
  keys.filter((key) => !isFilled(row?.[key]));

export const validateCompleteRows = (sections = []) => {
  const errors = [];

  sections.forEach(({ label, rows = [], fields = [], skip = false }) => {
    if (skip) return;

    rows.forEach((row, index) => {
      if (!rowHasAnyValue(row, fields)) return;

      const missing = rowMissingFields(row, fields);
      if (missing.length) {
        errors.push(`${label}, row ${index + 1}: fill all fields or clear the row.`);
      }
    });
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
