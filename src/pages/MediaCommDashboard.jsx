import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ACR_DETAIL_POINTS, APP_INFO } from "../constants/formConfig";
import { FORM_SCHOOL_CODES, FORM_TYPES } from "../constants/formRouting";
import { getSchoolKey } from "../constants/universityHierarchy";
import { loadAppraisalDocuments, loadSavedAppraisal, saveAppraisal, saveAppraisalDraftSection } from "../services/appraisalPersistence";
import { api } from "../services/api";
import { fetchReviewQueueForRole, submitWorkflowReview } from "../services/reviewWorkflow";
import { openFullFormReport } from "../utils/fullFormReport";
import {
  INNOVATIVE_METHODS,
  SCORE_LIMITS,
  clearDraft,
  clampScore,
  courseFileRowScore,
  draftKeyFor,
  effectiveMaxScore,
  feedbackAverage,
  feedbackRowScore,
  feedbackSectionScore,
  innovativeSelectionsFromDetails,
  innovativeTeachingScore,
  isValidDDMMYYYY,
  loadDraft,
  maskDateDDMMYYYY,
  normalizeAutoScores,
  projectGuidanceRowMax,
  researchGuidanceRowMax,
  researchGuidanceScore,
  saveDraft,
  scoreSectionRows,
  scoreRemaining,
  societyRowScore,
  societySelectionForRow,
  sumSectionScore,
  toggleInnovativeMethod,
  validateCompleteRows,
} from "../utils/appraisalFormUtils";
import { getReviewChain, pendingStatusFor, profileFromsessionStorage, reviewedStatusFor, roleLabel } from "../utils/hierarchy";

const ACCENT = "#b45309";
const ACCENT2 = "#0f766e";
const VERIFY_TEXT = "I have verified all the details and confirm that the information provided is correct. I am responsible for the accuracy of this data.";
const PART_A_MAX = 200;
const PART_B_MAX = 355;
const GRAND_MAX = 555;
const SECTION_OPTIONS = [
  { value: "partA", label: "Part-A Section" },
  { value: "partB", label: "Part-B Section" },
  { value: "summary", label: "Summary Section" },
];
const n = (value) => parseFloat(value) || 0;
const pct = (value, max) => Math.min(100, Math.round((n(value) / max) * 100)) || 0;
const titleCase = (value) => String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
const userInitials = (name) =>
  String(name || "User")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const SOCIETY_LABELS = [
  "Induction Program",
  "Unnat Bharat Abhiyan",
  "Yoga Classes",
  "Blood Donation",
  "Techno Social activities",
  "NSS",
  "Social visits",
];

const ACR_LABELS = [
  "Self-motivation and Proactiveness",
  "Punctuality",
  "Target based work",
  "Effectiveness",
  "Obedience",
];

const emptyMediaForm = () => ({
  info: {
    name: sessionStorage.getItem("name") || "",
    qual: sessionStorage.getItem("qualification") || "",
    desig: sessionStorage.getItem("designation") || "",
    ay: sessionStorage.getItem("academicYear") || "2025-2026",
    school: sessionStorage.getItem("school") || "SoMCS - School of Media & Communication Studies",
  },
  lectures: [{ sem: "", code: "", planned: "", conducted: "", score: "" }],
  courseFile: [{ course: "", title: "", details: "", score: "" }],
  innovDetails: "",
  innovScore: "",
  projects: [
    { label: "Project guided (3/batch)", score: "" },
    { label: "Industrial collaboration / Sponsorship", score: "" },
    { label: "Award received", score: "" },
    { label: "Project outcome: events/publications", score: "" },
  ],
  quals: [
    { label: "Higher Qualification achieved", score: "" },
    { label: "Add-on Qualification / Certification", score: "" },
  ],
  feedback: [{ code: "", fb1: "", fb2: "", score: "" }],
  deptActs: [{ activity: "", nature: "", score: "" }],
  uniActs: [{ activity: "", nature: "", score: "" }],
  society: SOCIETY_LABELS.map((label) => ({ label, details: "", participated: "", score: "" })),
  acr: ACR_LABELS.map((label) => ({ label, score: "" })),
  journals: [{ title: "", journal: "", issn: "", index: "", score: "" }],
  popularWritings: [{ media: "", film: "", score: "" }],
  books: [{ title: "", book: "", isbn: "", publisher: "", coAuthors: "", first: "", score: "" }],
  ict: [{ title: "", desc: "", type: "", quad: "", score: "" }],
  research: [{ degree: "", name: "", thesis: "", score: "" }],
  internalProjects: [{ title: "", agency: "", date: "", amount: "", role: "", status: "", score: "" }],
  externalProjects: [{ title: "", agency: "", date: "", amount: "", role: "", status: "", score: "" }],
  awards: [{ title: "", date: "", agency: "", level: "", score: "" }],
  confs: [{ title: "", type: "", org: "", level: "", score: "" }],
  proposals: [{ title: "", duration: "", agency: "", amount: "", score: "" }],
  products: [{ details: "", used: "", score: "" }],
  fdps: [{ program: "", duration: "", org: "", score: "" }],
  training: [{ company: "", duration: "", nature: "", score: "" }],
  sectionApplicability: { projects: "applicable", research: "applicable" },
});

const cloneRows = (rows) => JSON.parse(JSON.stringify(rows || []));

const PART_A_SECTIONS = [
  { key: "lectures", title: "A(i). Lectures / Tutorials / Practicals", max: 50, doc: "lec", fields: [["sem", "Semester"], ["code", "Course Code / Name"], ["planned", "Planned"], ["conducted", "Conducted"]] },
  { key: "courseFile", title: "A(ii). Course File", max: 20, doc: "cf", rowMax: SCORE_LIMITS.courseFileRow, fields: [["course", "Course / Paper"], ["title", "Title"], ["details", "Details"]] },
  { key: "projects", title: "A(iv). Project Guidance", max: 10, doc: "proj", rowMax: projectGuidanceRowMax, fields: [["label", "Project Category", true]] },
  { key: "quals", title: "A(v). Qualification Enhancement", max: 10, doc: "qual", rowMax: SCORE_LIMITS.qualificationRow, fields: [["label", "Category", true]] },
  { key: "feedback", title: "Student Feedback", max: 10, doc: "fb", fields: [["code", "Course Code / Name"], ["fb1", "First Feedback"], ["fb2", "Second Feedback"]] },
  { key: "deptActs", title: "Departmental / School Activities", max: 20, doc: "dept", fields: [["activity", "Activity"], ["nature", "Nature"]] },
  { key: "uniActs", title: "University Level Activities", max: 30, doc: "uni", fields: [["activity", "Activity"], ["nature", "Nature"]] },
  { key: "society", title: "Contribution to Society", max: 10, doc: "soc", rowMax: SCORE_LIMITS.societyRow, autoScore: true, fields: [["label", "Activity", true], ["details", "Details"], ["participated", "Participation"]] },
  { key: "acr", title: "Annual Confidential Report - School Level", max: 25, doc: "acr", fields: [["label", "Parameter", true]], selfReadOnlyScore: true },
];

const PART_B_SECTIONS = [
  { key: "journals", title: "B1(i). Published Papers in Journals", max: 80, doc: "jour", fields: [["title", "Title with Page Nos."], ["journal", "Journal Details"], ["issn", "ISSN No."], ["index", "Indexing"]] },
  { key: "popularWritings", title: "B1(ii). Popular Writings, Film & Documentary", max: 40, doc: "pop", fields: [["media", "Newspaper / Magazine / Website"], ["film", "Film / Documentary"]] },
  { key: "books", title: "B2. Articles / Chapters in Books", max: 60, doc: "book", fields: [["title", "Title"], ["book", "Book & Publisher"], ["isbn", "ISBN"], ["publisher", "Type"], ["coAuthors", "Co-authors"], ["first", "First Author?"]] },
  { key: "ict", title: "B3. ICT Mediated Teaching-Learning Pedagogy / New Curricula", max: 30, doc: "ict", fields: [["title", "Title"], ["desc", "Short Description"], ["type", "Type / Link"], ["quad", "Quadrants"]] },
  { key: "research", title: "B4(a). Research Guidance - PhD / PG", max: 30, doc: "res", rowMax: researchGuidanceRowMax, autoScore: true, fields: [["degree", "Degree"], ["name", "Student Name"], ["thesis", "Thesis / Status"]] },
  { key: "internalProjects", title: "B4(b). Internal Research Projects", max: 15, doc: "int", fields: [["title", "Title"], ["agency", "Funding Agency"], ["date", "Sanction Date"], ["amount", "Amount"], ["role", "Role"], ["status", "Status"]] },
  { key: "externalProjects", title: "B4(c). External Research Projects", max: 30, doc: "ext", fields: [["title", "Title"], ["agency", "Funding Agency"], ["date", "Sanction Date"], ["amount", "Amount"], ["role", "Role"], ["status", "Status"]] },
  { key: "awards", title: "B4(d). Research Awards", max: 10, doc: "awd", fields: [["title", "Title"], ["date", "Date"], ["agency", "Agency"], ["level", "Level"]] },
  { key: "confs", title: "B5. Conferences / Seminars / Workshops", max: 30, doc: "conf", fields: [["title", "Title"], ["type", "Type"], ["org", "Organization"], ["level", "Level"]] },
  { key: "proposals", title: "B6(a). Research Proposals", max: 10, doc: "prop", fields: [["title", "Title"], ["duration", "Duration"], ["agency", "Agency"], ["amount", "Amount"]] },
  { key: "products", title: "B6(b). Products Developed / Used", max: 20, doc: "prod", fields: [["details", "Product Details"], ["used", "Used / Adopted"]] },
  { key: "fdps", title: "B7. FDP / Self Development", max: 10, doc: "fdp", rowMax: SCORE_LIMITS.fdpRow, fields: [["program", "Program"], ["duration", "Duration"], ["org", "Organization"]] },
  { key: "training", title: "B8. Industrial Training", max: 10, doc: "train", rowMax: SCORE_LIMITS.fdpRow, fields: [["company", "Company"], ["duration", "Duration"], ["nature", "Nature"]] },
];

const ALL_ARRAY_KEYS = [...PART_A_SECTIONS, ...PART_B_SECTIONS].map((section) => section.key);

const scoreKeyForInnov = (role) => ({
  hod: "innovHod",
  director: "innovDirector",
  dean: "innovDean",
  vc: "innovVc",
}[role] || "innovScore");

const calculateMediaTotals = (form, scoreKey = "score") => {
  const applicability = form.sectionApplicability || {};
  const maxScores = getMediaEffectiveMaxScores(form);
  const rowSum = (key, max) => applicability[key] === "notApplicable" ? 0 : scoreSectionRows(key, form[key] || [], max, scoreKey);
  const partA = clampScore(
    rowSum("lectures", 50) + rowSum("courseFile", 20) + (scoreKey === "score" ? innovativeTeachingScore(form.innovDetails, form.innovScore, 10) : clampScore(form[scoreKeyForInnov(scoreKey)], 10)) +
    rowSum("projects", 10) + rowSum("quals", 10) + (scoreKey === "score" ? feedbackSectionScore(form.feedback, 10) : rowSum("feedback", 10)) +
    rowSum("deptActs", 20) + rowSum("uniActs", 30) + rowSum("society", 10) + rowSum("acr", 25),
    maxScores.partA,
  );
  const partB = clampScore(
    PART_B_SECTIONS.reduce((total, section) => total + rowSum(section.key, section.max), 0),
    maxScores.partB,
  );
  return { partA, partB, total: clampScore(partA + partB, maxScores.grand), maxScores };
};

const getMediaEffectiveMaxScores = (form = {}) => {
  const applicability = form.sectionApplicability || {};
  const partA = effectiveMaxScore(PART_A_MAX, applicability, [
    PART_A_SECTIONS.find((section) => section.key === "projects"),
  ].filter(Boolean));
  const partB = effectiveMaxScore(PART_B_MAX, applicability, [
    PART_B_SECTIONS.find((section) => section.key === "research"),
  ].filter(Boolean));
  return { partA, partB, grand: partA + partB };
};

const mergeForm = (base, incoming = {}) => ({
  ...base,
  ...incoming,
  info: { ...base.info, ...(incoming.info || {}) },
  sectionApplicability: { ...base.sectionApplicability, ...(incoming.sectionApplicability || {}) },
});

const normalizeScoresForSubmit = (form) => normalizeAutoScores(form);

const validateMediaBeforeSubmit = (form, sectionView = "all") => {
  const applicability = form.sectionApplicability || {};
  const sectionsToValidate = sectionView === "partA" ? PART_A_SECTIONS : sectionView === "partB" ? PART_B_SECTIONS : [...PART_A_SECTIONS, ...PART_B_SECTIONS];
  const rowSections = sectionsToValidate.map((section) => ({
    label: section.title,
    rows: form[section.key] || [],
    fields: [
      ...section.fields.filter(([, , readOnly]) => !readOnly).map(([key]) => key),
      ...(section.selfReadOnlyScore || section.autoScore || section.key === "feedback" || section.key === "courseFile" ? [] : ["score"]),
    ],
    rowMax: section.rowMax,
    maxScore: section.max,
    skip: applicability[section.key] === "notApplicable",
  }));
  const errors = validateCompleteRows(rowSections);

  if (sectionView !== "partA") ["internalProjects", "externalProjects"].forEach((key) => {
    (form[key] || []).forEach((row, index) => {
      if (row.date && !isValidDDMMYYYY(row.date)) {
        errors.push(`${key === "internalProjects" ? "B4(b)" : "B4(c)"}, row ${index + 1}: date must be DD/MM/YYYY.`);
      }
    });
  });

  if (sectionView !== "partB") {
    if (form.innovDetails && !form.innovScore) errors.push("A(iii). Innovative Teaching Methods: score is required.");
    if (form.innovScore && !form.innovDetails) errors.push("A(iii). Innovative Teaching Methods: details are required.");
  }

  return errors;
};

function ScoreBar({ score, max, color }) {
  return <div style={{ height: 5, borderRadius: 6, background: "#e2e8f0", overflow: "hidden" }}><div style={{ width: `${pct(score, max)}%`, height: "100%", background: color }} /></div>;
}

function Avatar({ initials, color = ACCENT, size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg,${color},${color}99)`, color: "#fff", fontWeight: 800, fontSize: size * 0.32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, letterSpacing: 0.5 }}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }) {
  const reviewed = /Reviewed|Approved/.test(status || "");
  const color = reviewed ? "#047857" : "#92400e";
  const bg = reviewed ? "#d1fae5" : "#fef3c7";
  return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 20, padding: "4px 10px", background: bg, color, fontSize: 11, fontWeight: 800 }}>{status || "Pending Review"}</span>;
}

function TI({ value, onChange, readOnly = false, center = false, type = "text", textOnly = false, max }) {
  const numeric = type === "number";
  const [textErr, setTextErr] = useState(false);
  const handleChange = (event) => {
    if (readOnly) return;
    let v = event.target.value;
    if (numeric) {
      v = v.replace(/[^0-9.]/g, "").replace(/^\./, "0.").replace(/(\.\d*)\./g, "$1");
      if (v !== "" && max !== undefined) v = String(clampScore(v, max));
    }
    if (textOnly && textErr) setTextErr(false);
    onChange?.(v);
  };
  const handleBlur = (event) => {
    if (readOnly || !onChange) return;
    const trimmed = event.target.value.trim();
    if (trimmed !== event.target.value) onChange(trimmed);
    if (textOnly && trimmed.length > 0 && /^[\d\s.,+\-/\\()[\]{}]+$/.test(trimmed)) setTextErr(true);
  };
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={numeric ? "text" : type}
        value={value ?? ""}
        readOnly={readOnly}
        onChange={handleChange}
        onBlur={handleBlur}
        inputMode={numeric ? "decimal" : undefined}
        style={{ width: "100%", height: 30, boxSizing: "border-box", border: textErr ? "1.5px solid #ef4444" : "1px solid #cbd5e1", borderRadius: 4, padding: "5px 7px", fontSize: 11, fontFamily: "Georgia, serif", background: readOnly ? "#f8fafc" : "#fff", textAlign: center ? "center" : "left" }}
      />
      {textErr && <span style={{ position: "absolute", left: 0, top: "100%", fontSize: 9, color: "#ef4444", whiteSpace: "nowrap", lineHeight: 1.2 }}>Text expected</span>}
    </div>
  );
}

const NUMERIC_KEYS = new Set(["planned", "conducted", "fb1", "fb2", "amount"]);
const TEXT_ONLY_KEYS = new Set(["title", "code", "course", "name", "degree", "thesis", "agency", "role", "status", "type", "level", "activity", "nature", "journal", "book", "publisher", "org", "program", "company", "desc", "coAuthors", "media", "film", "used"]);

function RO({ value, center = false }) {
  return <span style={{ display: "block", minHeight: 18, color: value ? "#1e293b" : "#94a3b8", fontSize: 11, textAlign: center ? "center" : "left" }}>{value || "-"}</span>;
}

function DocCell({ id, docs, setDocs, readOnly }) {
  const ref = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const files = docs?.[id] || [];

  const handleFiles = async (fileList) => {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      setUploadError("File exceeds 10 MB limit.");
      if (ref.current) ref.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selected[0]);
      fd.append("folder", `faculty-appraisal/${id}`);
      const uploaded = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setDocs((prev) => ({ ...prev, [id]: [uploaded] }));
    } catch (err) {
      alert(`Upload failed.\n\n${err.message}`);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const removeFile = (index) => {
    setDocs((prev) => {
      const next = [...(prev[id] || [])];
      next.splice(index, 1);
      return { ...prev, [id]: next };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {files.map((file, index) => (
        <div key={`${file.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: 5, background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 4, padding: "2px 6px" }}>
          <a href={file.url} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: ACCENT, textDecoration: "none", fontSize: 10 }}>{file.name}</a>
          {!readOnly && <button type="button" onClick={() => removeFile(index)} style={{ border: 0, background: "transparent", color: "#dc2626", cursor: "pointer" }}>x</button>}
        </div>
      ))}
      {!readOnly && (
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading} style={{ border: "1px dashed #cbd5e1", background: "#f8fafc", color: "#475569", borderRadius: 4, padding: "5px", cursor: "pointer", fontSize: 10 }}>
          {uploading ? "Uploading..." : "Attach"}
          <input ref={ref} type="file" style={{ display: "none" }} onChange={(event) => handleFiles(event.target.files)} />
        </button>
      )}
      {readOnly && !files.length && <span style={{ color: "#94a3b8", fontSize: 10 }}>No docs</span>}
    </div>
  );
}

function SectionShell({ title, max, earned = 0, children, accent = ACCENT }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 800, color: accent, fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textAlign: "right" }}>
          <div>Earned Score: {clampScore(earned, max).toFixed(1)} / {max}</div>
          <div>Remaining Credits: {scoreRemaining(earned, max).toFixed(1)}</div>
        </div>
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  );
}

function SectionTable({ section, form, setForm, docs, setDocs, mode, locked, reviewerRole, reviewData, setReviewData, previousRoles }) {
  const rows = form[section.key] || [];
  const reviewRows = reviewData?.[section.key] || [];
  const editableSelf = mode === "self" && !locked;
  const reviewLocked = mode === "review" && locked;
  const currentRole = reviewerRole;
  const applicability = form.sectionApplicability || {};
  const notApplicable = applicability[section.key] === "notApplicable";
  const canToggleApplicability = editableSelf && ["projects", "research"].includes(section.key);
  const earned = notApplicable ? 0 : scoreSectionRows(section.key, rows, section.max);

  const rowSelfScore = (row) => {
    if (section.key === "feedback") return feedbackRowScore(row, section.max);
    if (section.key === "courseFile") return courseFileRowScore(row);
    if (section.key === "research") return researchGuidanceScore(row);
    if (section.key === "society") return societyRowScore(row);
    return clampScore(row.score, section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max);
  };

  const updateRow = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section.key]: (prev[section.key] || []).map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const rowMax = section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max;
        const nextValue = key === "date" ? maskDateDDMMYYYY(value) : key === "score" ? clampScore(value, rowMax) : value;
        const nextRow = { ...row, [key]: nextValue };
        if (section.key === "courseFile" && ["course", "title", "details"].includes(key)) return { ...nextRow, score: courseFileRowScore(nextRow) ? String(courseFileRowScore(nextRow)) : "" };
        if (section.key === "society" && key === "participated") return { ...nextRow, score: nextValue ? String(societyRowScore({ participated: nextValue })) : "" };
        if (section.key === "research" && ["degree", "name", "thesis"].includes(key)) return { ...nextRow, score: researchGuidanceScore(nextRow) ? String(researchGuidanceScore(nextRow)) : "" };
        return nextRow;
      }),
    }));
  };

  const setApplicability = (value) => {
    setForm((prev) => {
      const blankRows = (prev[section.key] || []).map((row) => ({
        ...row,
        ...Object.fromEntries(section.fields.filter(([, , readOnly]) => !readOnly).map(([key]) => [key, ""])),
        score: "",
      }));
      return {
        ...prev,
        sectionApplicability: { ...(prev.sectionApplicability || {}), [section.key]: value },
        [section.key]: value === "notApplicable" ? blankRows : prev[section.key],
      };
    });
  };

  const updateReview = (index, value) => {
    setReviewData((prev) => {
      const source = prev[section.key] || cloneRows(rows);
      const nextRows = source.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const rowMax = section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max;
        return { ...row, [currentRole]: value === "" ? "" : String(clampScore(value, rowMax)) };
      });
      return { ...prev, [section.key]: nextRows };
    });
  };

  const addRow = () => {
    const blank = Object.fromEntries(section.fields.map(([key]) => [key, ""]));
    setForm((prev) => ({ ...prev, [section.key]: [...(prev[section.key] || []), { ...blank, score: "" }] }));
  };

  const deleteRow = () => {
    setForm((prev) => ({ ...prev, [section.key]: (prev[section.key] || []).length > 1 ? prev[section.key].slice(0, -1) : prev[section.key] }));
  };

  return (
    <SectionShell title={section.title} max={notApplicable ? 0 : section.max} earned={earned} accent={section.key === "acr" ? "#ef4444" : section.key === "society" ? "#10b981" : section.doc?.startsWith("j") || section.doc?.startsWith("p") || section.doc?.startsWith("b") || section.doc?.startsWith("i") || section.doc?.startsWith("e") ? ACCENT2 : ACCENT}>
      {canToggleApplicability && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 12, fontWeight: 800, color: "#334155" }}>
          {["applicable", "notApplicable"].map((value) => (
            <label key={value} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={(applicability[section.key] || "applicable") === value} onChange={() => setApplicability(value)} />
              {value === "applicable" ? "Applicable" : "Not Applicable"}
            </label>
          ))}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={thStyle}>SN</th>
              {section.fields.map(([, label]) => <th key={label} style={thStyle}>{label}</th>)}
              {section.key === "feedback" && <th style={thStyle}>Average</th>}
              <th style={thStyle}>Documents</th>
              <th style={thStyle}>Faculty Score</th>
              {mode === "review" && previousRoles.map((role) => <th key={role} style={thStyle}>{roleLabel(role)} Score</th>)}
              {mode === "review" && <th style={thStyle}>{roleLabel(currentRole)} Score</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${section.key}-${index}`}>
                <td style={tdCenter}>{index + 1}</td>
                {section.fields.map(([key, , readOnlyField]) => (
                  <td key={key} style={tdStyle}>
                    {mode !== "self" ? <RO value={row[key]} /> : key === "first" || key === "participated" ? (
                      <select
                        value={key === "participated" ? societySelectionForRow(row) : row[key] || ""}
                        disabled={!editableSelf || readOnlyField || notApplicable}
                        onChange={(event) => updateRow(index, key, event.target.value)}
                        style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "Georgia, serif", fontSize: 11 }}
                      >
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : section.key === "research" && key === "degree" ? (
                      <select
                        value={row[key] || ""}
                        disabled={!editableSelf || readOnlyField || notApplicable}
                        onChange={(event) => updateRow(index, key, event.target.value)}
                        style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "Georgia, serif", fontSize: 11 }}
                      >
                        <option value="">Select</option>
                        <option value="PhD">PhD</option>
                        <option value="PG">PG</option>
                      </select>
                    ) : (
                      <>
                        <TI value={row[key]} type={NUMERIC_KEYS.has(key) ? "number" : "text"} max={key === "fb1" || key === "fb2" ? SCORE_LIMITS.feedbackAverage : undefined} textOnly={TEXT_ONLY_KEYS.has(key)} readOnly={!editableSelf || readOnlyField || notApplicable} onChange={(value) => updateRow(index, key, value)} />
                        {section.key === "acr" && key === "label" && ACR_DETAIL_POINTS[row[key]] && (
                          <ul style={{ margin: "5px 0 0 16px", padding: 0, color: "#64748b", fontSize: 10, lineHeight: 1.5 }}>
                            {ACR_DETAIL_POINTS[row[key]].map((point) => <li key={point}>{point}</li>)}
                          </ul>
                        )}
                        {key === "date" && row[key] && !isValidDDMMYYYY(row[key]) && (
                          <div style={{ color: "#dc2626", fontSize: 10, marginTop: 3 }}>Use DD/MM/YYYY</div>
                        )}
                      </>
                    )}
                  </td>
                ))}
                {section.key === "feedback" && <td style={tdCenter}>{feedbackAverage(row).toFixed(2)}</td>}
                <td style={tdStyle}><DocCell id={`${section.doc}-${index}`} docs={docs} setDocs={setDocs} readOnly={!editableSelf || notApplicable} /></td>
                <td style={tdCenter}>
                  {mode === "self"
                    ? section.key === "feedback"
                      ? <RO value={feedbackRowScore(row, section.max).toFixed(1)} center />
                      : section.autoScore || section.key === "courseFile"
                        ? <RO value={rowSelfScore(row) ? rowSelfScore(row).toFixed(1) : ""} center />
                        : <TI value={row.score} type="number" center max={section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max} readOnly={!editableSelf || section.selfReadOnlyScore || notApplicable} onChange={(value) => updateRow(index, "score", value)} />
                    : <RO value={section.key === "research" ? researchGuidanceScore(row).toFixed(1) : rowSelfScore(row) ? rowSelfScore(row).toFixed(1) : ""} center />}
                </td>
                {mode === "review" && previousRoles.map((role) => <td key={role} style={tdCenter}><RO value={row[role]} center /></td>)}
                {mode === "review" && (
                  <td style={tdCenter}>
                    <TI type="number" center max={section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max} readOnly={reviewLocked} value={reviewRows[index]?.[currentRole] ?? row[currentRole] ?? ""} onChange={(value) => updateReview(index, value)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editableSelf && !section.selfReadOnlyScore && !notApplicable && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={addRow} style={smallButton("#10b981")}>+ Add Row</button>
          <button type="button" onClick={deleteRow} style={smallButton("#ef4444")}>Delete Last</button>
        </div>
      )}
    </SectionShell>
  );
}

function InnovativeSection({ form, setForm, docs, setDocs, mode, locked, reviewerRole, reviewData, setReviewData, previousRoles }) {
  const currentScore = scoreKeyForInnov(reviewerRole);
  const editableSelf = mode === "self" && !locked;
  const reviewLocked = mode === "review" && locked;
  const updateReview = (value) => setReviewData((prev) => ({ ...prev, innovativeTeaching: { ...(prev.innovativeTeaching || {}), [reviewerRole]: value === "" ? "" : String(clampScore(value, 10)) } }));
  const selectedMethods = innovativeSelectionsFromDetails(form.innovDetails);
  const toggleMethod = (method) => {
    const nextDetails = toggleInnovativeMethod(form.innovDetails, method);
    setForm((prev) => ({
      ...prev,
      innovDetails: nextDetails,
      innovScore: String(innovativeTeachingScore(nextDetails, "", 10)),
    }));
  };
  const facultyScore = innovativeTeachingScore(form.innovDetails, form.innovScore, 10);

  return (
    <SectionShell title="A(iii). Innovative Teaching Methods" max={10} earned={facultyScore}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={thStyle}>Methods Used</th>
            <th style={thStyle}>Details</th>
            <th style={thStyle}>Documents</th>
            <th style={thStyle}>Faculty Score</th>
            {mode === "review" && previousRoles.map((role) => <th key={role} style={thStyle}>{roleLabel(role)} Score</th>)}
            {mode === "review" && <th style={thStyle}>{roleLabel(reviewerRole)} Score</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}>
              {mode === "self" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {INNOVATIVE_METHODS.map((method) => {
                    const selected = selectedMethods.includes(method);
                    return (
                      <button key={method} type="button" disabled={!editableSelf} onClick={() => toggleMethod(method)} style={{ border: selected ? "1px solid #b45309" : "1px solid #cbd5e1", background: selected ? "#fffbeb" : "#fff", color: selected ? "#92400e" : "#334155", borderRadius: 5, padding: "5px 7px", fontSize: 10, fontWeight: 800, cursor: editableSelf ? "pointer" : "not-allowed" }}>
                        {method}
                      </button>
                    );
                  })}
                </div>
              ) : <RO value={form.innovDetails} />}
            </td>
            <td style={tdStyle}>{mode === "self" ? <TI value={form.innovDetails} textOnly readOnly={!editableSelf} onChange={(value) => setForm((prev) => ({ ...prev, innovDetails: value }))} /> : <RO value={form.innovDetails} />}</td>
            <td style={tdStyle}><DocCell id="innov-0" docs={docs} setDocs={setDocs} readOnly={!editableSelf} /></td>
            <td style={tdCenter}>{mode === "self" ? <RO value={facultyScore.toFixed(1)} center /> : <RO value={form.innovScore} center />}</td>
            {mode === "review" && previousRoles.map((role) => <td key={role} style={tdCenter}><RO value={form[scoreKeyForInnov(role)]} center /></td>)}
            {mode === "review" && <td style={tdCenter}><TI type="number" center max={10} readOnly={reviewLocked} value={reviewData.innovativeTeaching?.[reviewerRole] ?? form[currentScore] ?? ""} onChange={updateReview} /></td>}
          </tr>
        </tbody>
      </table>
    </SectionShell>
  );
}

function MediaForm({ form, setForm, docs, setDocs, mode = "self", locked = false, reviewerRole = "", reviewData = {}, setReviewData = () => {}, previousRoles = [], sectionView = "partA" }) {
  return (
    <>
      {(sectionView === "partA" || sectionView === "all") && (
        <>
          <div style={{ fontWeight: 900, color: "#1e293b", background: "#fef3c7", padding: "9px 14px", borderRadius: 7, marginBottom: 12 }}>Part A - Teaching Process & Academic Activities</div>
          {PART_A_SECTIONS.slice(0, 2).map((section) => <SectionTable key={section.key} section={section} form={form} setForm={setForm} docs={docs} setDocs={setDocs} mode={mode} locked={locked} reviewerRole={reviewerRole} reviewData={reviewData} setReviewData={setReviewData} previousRoles={previousRoles} />)}
          <InnovativeSection form={form} setForm={setForm} docs={docs} setDocs={setDocs} mode={mode} locked={locked} reviewerRole={reviewerRole} reviewData={reviewData} setReviewData={setReviewData} previousRoles={previousRoles} />
          {PART_A_SECTIONS.slice(2).map((section) => <SectionTable key={section.key} section={section} form={form} setForm={setForm} docs={docs} setDocs={setDocs} mode={mode} locked={locked} reviewerRole={reviewerRole} reviewData={reviewData} setReviewData={setReviewData} previousRoles={previousRoles} />)}
        </>
      )}
      {(sectionView === "partB" || sectionView === "all") && (
        <>
          <div style={{ fontWeight: 900, color: "#134e4a", background: "#ccfbf1", padding: "9px 14px", borderRadius: 7, margin: sectionView === "all" ? "18px 0 12px" : "0 0 12px" }}>Part B - Research and Academic Contributions</div>
          {PART_B_SECTIONS.map((section) => <SectionTable key={section.key} section={section} form={form} setForm={setForm} docs={docs} setDocs={setDocs} mode={mode} locked={locked} reviewerRole={reviewerRole} reviewData={reviewData} setReviewData={setReviewData} previousRoles={previousRoles} />)}
        </>
      )}
    </>
  );
}

function AccuracyCheckbox({ checked, onChange, disabled = false }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "#334155", lineHeight: 1.5, padding: "12px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} style={{ marginTop: 3 }} />
      <span>{VERIFY_TEXT}</span>
    </label>
  );
}

function SummaryBox({ totals, roleScoreLabel = "Score", maxScores = { partA: PART_A_MAX, partB: PART_B_MAX, grand: GRAND_MAX } }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, display: "grid", gap: 12 }}>
      {[
        ["Part A", totals.partA, maxScores.partA, ACCENT],
        ["Part B", totals.partB, maxScores.partB, ACCENT2],
        ["Grand Total", totals.total, maxScores.grand, "#059669"],
      ].map(([label, value, max, color]) => (
        <div key={label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <strong>{label}</strong><span style={{ color, fontWeight: 900 }}>{n(value).toFixed(1)} / {max}</span>
          </div>
          <ScoreBar score={value} max={max} color={color} />
        </div>
      ))}
      <div style={{ fontSize: 11, color: "#64748b" }}>{roleScoreLabel}</div>
    </div>
  );
}

function SectionSelector({ value, onChange, label = "Appraisal Section", isOptionDisabled = () => false }) {
  return (
    <label style={{ display: "inline-grid", gap: 6, fontSize: 11, color: "#475569", fontWeight: 800, minWidth: 230 }}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ height: 36, border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", padding: "0 10px", fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700 }}
      >
        {SECTION_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={isOptionDisabled(option.value)}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SectionSaveFooter({ label, saved, saving, locked, onSave }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ color: saved ? "#047857" : "#64748b", fontSize: 12, fontWeight: 800 }}>
        {locked ? "Submitted and locked" : saved ? `${label} saved. Next section unlocked.` : `Save ${label} to unlock the next section.`}
      </span>
      <button type="button" onClick={onSave} disabled={locked || saving} style={smallButton(locked ? "#94a3b8" : "#2563eb")}>
        {saving ? "Saving..." : `Save ${label}`}
      </button>
    </div>
  );
}

function WorkflowTracker({ declaration, reviews, profile }) {
  const chain = getReviewChain(profile);
  if (!declaration) {
    return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, color: "#64748b", fontSize: 12 }}>Submit the appraisal to see the approval route.</div>;
  }
  const reviewed = new Map((reviews || []).map((review) => [review.reviewer_role, review]));
  const next = chain.find((role) => !reviewed.has(role));
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Approval Status Tracker</strong>
        <StatusBadge status={next ? pendingStatusFor(next) : "VC Reviewed"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${chain.length + 1}, minmax(130px, 1fr))`, gap: 8, overflowX: "auto" }}>
        {[{ label: "Submitted", state: "Done", time: declaration.submitted_at }, ...chain.map((role) => {
          const review = reviewed.get(role);
          return { label: roleLabel(role), state: review ? "Reviewed" : next === role ? "Pending" : "Waiting", time: review?.reviewed_at, comment: review?.remarks };
        })].map((step) => (
          <div key={step.label} style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: 9, background: step.state === "Reviewed" || step.state === "Done" ? "#ecfdf5" : step.state === "Pending" ? "#fffbeb" : "#f8fafc" }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{step.state}</div>
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>{step.label}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{step.time ? new Date(step.time).toLocaleString() : "No timestamp yet"}</div>
            {step.comment && <div style={{ fontSize: 10, color: "#334155", marginTop: 5 }}>{step.comment}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildMediaSectionScores(person, reviewData, reviewerRole) {
  const payload = {};
  ALL_ARRAY_KEYS.forEach((key) => {
    const rows = Array.isArray(person[key]) ? person[key] : [];
    const reviewRows = Array.isArray(reviewData[key]) ? reviewData[key] : [];
    payload[key] = rows.map((row, index) => ({
      ...row,
      [reviewerRole]: reviewRows[index]?.[reviewerRole] ?? row[reviewerRole] ?? "",
    }));
  });
  payload.innovativeTeaching = {
    [reviewerRole]: reviewData.innovativeTeaching?.[reviewerRole] ?? person[scoreKeyForInnov(reviewerRole)] ?? "",
  };
  return payload;
}

export function MediaCommAuthorityReviewPanel({ person, reviewerRole, onBack, onSubmit, readOnly = false, showReport = false }) {
  const [sectionView, setSectionView] = useState("partA");
  const [reviewData, setReviewData] = useState({});
  const [remarks, setRemarks] = useState(person?.[`${reviewerRole}Remarks`] || "");
  const [confirmed, setConfirmed] = useState(false);
  const form = mergeForm(emptyMediaForm(), person || {});
  const [docs, setDocs] = useState(form.docs || {});
  const subjectProfile = { school: person?.school, department: person?.department, appraisal_role: person?.appraisalRole };
  const chain = getReviewChain(subjectProfile);
  const currentIndex = chain.indexOf(reviewerRole);
  const previousRoles = currentIndex > 0 ? chain.slice(0, currentIndex) : [];
  const visiblePreviousRoles = reviewerRole === "vc" ? previousRoles : [];

  const reviewerForm = useMemo(() => {
    const merged = { ...form };
    ALL_ARRAY_KEYS.forEach((key) => {
      merged[key] = (form[key] || []).map((row, index) => ({
        ...row,
        [reviewerRole]: reviewData[key]?.[index]?.[reviewerRole] ?? row[reviewerRole] ?? "",
      }));
    });
    merged[scoreKeyForInnov(reviewerRole)] = reviewData.innovativeTeaching?.[reviewerRole] ?? form[scoreKeyForInnov(reviewerRole)] ?? "";
    return merged;
  }, [form, reviewData, reviewerRole]);
  const totals = calculateMediaTotals(reviewerForm, reviewerRole);
  const reviewCompleted = readOnly || /Reviewed/.test(person?.status || "") || n(person?.[`${reviewerRole}Total`]) > 0;

  const generateReviewReport = () => {
    if (!reviewCompleted) return;
    openFullFormReport({
      title: "SoMCS VC Appraisal Report",
      subtitle: "School of Media & Communication Studies",
      form: reviewerForm,
      docs,
      partASections: PART_A_SECTIONS,
      partBSections: PART_B_SECTIONS,
      totals: {
        partA: n(person?.[`${reviewerRole}PartA`] ?? totals.partA),
        partB: n(person?.[`${reviewerRole}PartB`] ?? totals.partB),
        total: n(person?.[`${reviewerRole}Total`] ?? totals.total),
      },
      maxScores: getMediaEffectiveMaxScores(reviewerForm),
      scoreRoles: ["score", ...visiblePreviousRoles, reviewerRole],
      roleLabel,
      status: person?.status,
      remarksLabel: `${roleLabel(reviewerRole)} Remarks`,
      remarks: person?.[`${reviewerRole}Remarks`] || remarks,
      generatedBy: sessionStorage.getItem("name") || roleLabel(reviewerRole),
    });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: "#0f172a", color: "#f8fafc", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={smallButton("#1e293b")}>Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900 }}>{person?.name || person?.email}</div>
          <div style={{ color: "#94a3b8", fontSize: 12 }}>{person?.designation || titleCase(person?.appraisalRole)} - SoMCS</div>
        </div>
        <StatusBadge status={person?.status} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SectionSelector value={sectionView} onChange={setSectionView} label="Review Section" />
      </div>
      {(sectionView === "partA" || sectionView === "partB") && (
        <MediaForm
          form={form}
          setForm={() => {}}
          docs={docs}
          setDocs={setDocs}
          mode="review"
          locked={readOnly}
          reviewerRole={reviewerRole}
          reviewData={reviewData}
          setReviewData={setReviewData}
          previousRoles={visiblePreviousRoles}
          sectionView={sectionView}
        />
      )}
      {sectionView === "summary" && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, display: "grid", gap: 14 }}>
          <SummaryBox totals={totals} maxScores={totals.maxScores} roleScoreLabel={`${roleLabel(reviewerRole)} score for the SoMCS media appraisal form.`} />
          <label style={{ display: "grid", gap: 6, fontWeight: 800, color: "#134e4a", fontSize: 13 }}>
            {roleLabel(reviewerRole)} Remarks
            <textarea value={remarks} readOnly={readOnly} onChange={(event) => setRemarks(event.target.value)} rows={5} style={{ border: "1px solid #99f6e4", borderRadius: 7, padding: 10, fontFamily: "Georgia, serif", resize: "vertical" }} />
          </label>
          {!readOnly && <AccuracyCheckbox checked={confirmed} onChange={setConfirmed} />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onBack} style={smallButton("#64748b")}>Close</button>
            {showReport && (
              <button onClick={generateReviewReport} disabled={!reviewCompleted} style={smallButton(reviewCompleted ? "#4c1d95" : "#94a3b8")}>
                Generate Report
              </button>
            )}
            {!readOnly && (
              <button
                onClick={() => onSubmit(person.id, { partA: totals.partA, partB: totals.partB, total: totals.total }, remarks, buildMediaSectionScores(form, reviewData, reviewerRole), confirmed)}
                disabled={!confirmed}
                style={smallButton(confirmed ? "#059669" : "#94a3b8")}
              >
                Submit {roleLabel(reviewerRole)} Review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MediaCommDashboard({ fixedRole }) {
  const navigate = useNavigate();
  const role = fixedRole || sessionStorage.getItem("role") || "faculty";
  const profile = profileFromsessionStorage();
  const [activeTab, setActiveTab] = useState(role === "faculty" ? "my" : "approvals");
  const [selfSectionView, setSelfSectionView] = useState("partA");
  const [form, setForm] = useState(emptyMediaForm);
  const [docs, setDocs] = useState({});
  const [queue, setQueue] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sectionSaveStatus, setSectionSaveStatus] = useState({ partA: true, partB: true });
  const [declaration, setDeclaration] = useState(null);
  const [reviews, setReviews] = useState([]);
  const userEmail = sessionStorage.getItem("username") || "";
  const academicYear = form.info?.ay || "2025-2026";
  const locked = Boolean(declaration);
  const totals = calculateMediaTotals(form, "score");
  const canSelfSubmit = role !== "vc";
  const draftKey = draftKeyFor({ family: "media-comm", email: userEmail, academicYear });

  const setters = useMemo(() => Object.fromEntries([
    ["setInfo", (value) => setForm((prev) => ({ ...prev, info: { ...prev.info, ...value } }))],
    ...ALL_ARRAY_KEYS.map((key) => [`set${titleCase(key)}`, (value) => setForm((prev) => ({ ...prev, [key]: value }))]),
    ["setInnovDetails", (value) => setForm((prev) => ({ ...prev, innovDetails: value }))],
    ["setInnovScore", (value) => setForm((prev) => ({ ...prev, innovScore: value }))],
    ["setInnovHod", (value) => setForm((prev) => ({ ...prev, innovHod: value }))],
    ["setInnovDirector", (value) => setForm((prev) => ({ ...prev, innovDirector: value }))],
    ["setInnovDean", (value) => setForm((prev) => ({ ...prev, innovDean: value }))],
    ["setInnovVc", (value) => setForm((prev) => ({ ...prev, innovVc: value }))],
    ["setSectionSaveStatus", (value) => setSectionSaveStatus((prev) => ({ ...prev, ...(value || {}) }))],
  ]), []);

  useEffect(() => {
    if (!userEmail || !academicYear || !canSelfSubmit) return;
    const loadAll = async () => {
      await Promise.all([
        loadSavedAppraisal({ facultyEmail: userEmail, academicYear, setters }),
        loadAppraisalDocuments({ facultyEmail: userEmail, academicYear, setDocs }),
      ]);
      const draft = loadDraft(draftKey);
      if (draft?.form) {
        setForm((current) => mergeForm(current, draft.form));
        if (draft.form.sectionSaveStatus) setSectionSaveStatus((current) => ({ ...current, ...draft.form.sectionSaveStatus }));
      }
      if (draft?.docs) setDocs(draft.docs);
    };
    loadAll().catch((err) => console.error("Could not load SoMCS appraisal:", err));
  }, [userEmail, academicYear, setters, canSelfSubmit, draftKey]);

  useEffect(() => {
    if (!userEmail || !academicYear || !canSelfSubmit || locked) return undefined;
    const timer = window.setTimeout(() => {
      saveDraft(draftKey, { form: { ...form, sectionSaveStatus }, docs });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [userEmail, academicYear, canSelfSubmit, locked, draftKey, form, sectionSaveStatus, docs]);

  useEffect(() => {
    if (!userEmail || !academicYear || !canSelfSubmit) return;
    const loadStatus = async () => {
      const data = await api.get("/appraisal/status", { params: { academic_year: academicYear } });
      setDeclaration(data?.declaration || null);
      setReviews(data?.reviews || []);
    };
    loadStatus().catch((err) => console.error("Could not load workflow status:", err));
  }, [userEmail, academicYear, canSelfSubmit]);

  const loadQueue = async () => {
    if (role === "faculty") return;
    setLoadingQueue(true);
    try {
      const items = await fetchReviewQueueForRole({
        reviewerRole: role,
        reviewerProfile: { ...profile, appraisal_role: role },
        schoolValues: FORM_SCHOOL_CODES[FORM_TYPES.MEDIA_COMM],
      });
      setQueue(items.filter((item) => FORM_SCHOOL_CODES[FORM_TYPES.MEDIA_COMM].includes(getSchoolKey(item.school))));
    } catch (err) {
      console.error("Could not load SoMCS review queue:", err);
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [role, profile.school, profile.department]);

  const isSelfSectionOpen = (_section) => true;

  const handleSelfSectionChange = (section) => {
    if (selfSectionView === "partA" && section !== "partA") {
      const validationErrors = validateMediaBeforeSubmit(form, "partA");
      if (validationErrors.length) {
        alert(validationErrors.join("\n"));
        return;
      }
    }
    if (selfSectionView === "partB" && section === "summary") {
      const validationErrors = validateMediaBeforeSubmit(form, "partB");
      if (validationErrors.length) {
        alert(validationErrors.join("\n"));
        return;
      }
    }
    setSelfSectionView(section);
  };

  const handleSubmitAppraisal = async () => {
    if (!confirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting.");
      return;
    }
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }
    const normalizedForm = normalizeScoresForSubmit(form);
    const validationErrors = validateMediaBeforeSubmit(normalizedForm);
    if (validationErrors.length) {
      alert(validationErrors.join("\n"));
      return;
    }
    setSubmitting(true);
    try {
      await saveAppraisal({
        facultyEmail: userEmail,
        academicYear,
        totals: { partATotal: totals.partA, partBTotal: totals.partB, grandTotal: totals.total },
        form: normalizedForm,
        docs,
        submitterProfile: { ...profile, appraisal_role: role },
      });
      clearDraft(draftKey);
      setDeclaration({ status: pendingStatusFor(getReviewChain({ ...profile, appraisal_role: role })[0]), submitted_at: new Date().toISOString() });
      alert("SoMCS appraisal submitted successfully.");
    } catch (err) {
      alert(`Unable to submit appraisal.\n\n${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReview = async (id, scores, remarks, sectionScores, reviewConfirmed = false) => {
    if (!reviewConfirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting the review.");
      return;
    }
    const item = queue.find((entry) => entry.id === id);
    if (!item) return;
    try {
      await submitWorkflowReview({
        subjectEmail: item.email,
        academicYear: item.academicYear || item.academic_year || item.info?.ay || APP_INFO.DEFAULT_AY || "2025-2026",
        reviewerRole: role,
        partAScore: scores.partA,
        partBScore: scores.partB,
        totalScore: scores.total,
        remarks,
        sectionScores,
        subjectProfile: item,
      });
      setReviewing(null);
      await loadQueue();
      alert(`${roleLabel(role)} review submitted successfully.`);
    } catch (err) {
      alert(`Unable to submit review.\n\n${err.message}`);
    }
  };

  const generateSelfReport = () => {
    openFullFormReport({
      title: "SoMCS Appraisal Report",
      subtitle: "School of Media & Communication Studies",
      form,
      docs,
      partASections: PART_A_SECTIONS,
      partBSections: PART_B_SECTIONS,
      totals,
      maxScores: totals.maxScores,
      scoreRoles: ["score"],
      roleLabel,
      status: declaration?.status || "Draft / Pre-submit Review",
      generatedBy: sessionStorage.getItem("name") || roleLabel(role),
    });
  };

  const pendingCount = queue.filter((item) => item.status === "Pending Review").length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "Georgia, serif" }}>
      <aside style={{ width: 230, height: "100vh", minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start", boxSizing: "border-box", overflow: "hidden", background: "#0f172a", color: "#f8fafc", padding: "18px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ borderBottom: "1px solid #1e293b", paddingBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>{APP_INFO.PORTAL_NAME}</div>
          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 3 }}>Media & Communication</div>
        </div>
        {canSelfSubmit && (
          <>
            <button onClick={() => { setActiveTab("my"); setReviewing(null); }} style={navButton(activeTab === "my")}>My Appraisal</button>
            {activeTab === "my" && (
              <label style={{ display: "grid", gap: 6, padding: "0 10px 4px 16px", fontSize: 10, color: "#94a3b8", fontWeight: 800 }}>
                Appraisal Section
                <select
                  value={selfSectionView}
                  onChange={(event) => handleSelfSectionChange(event.target.value)}
                  style={{ height: 34, border: "1px solid #334155", borderRadius: 7, background: "#1e293b", color: "#f8fafc", padding: "0 9px", fontFamily: "Georgia, serif", fontSize: 11, fontWeight: 700 }}
                >
                  {SECTION_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={!isSelfSectionOpen(option.value)}>{option.label}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        {role !== "faculty" && <button onClick={() => { setActiveTab("approvals"); setReviewing(null); }} style={navButton(activeTab === "approvals")}>Approvals ({pendingCount})</button>}
        <div style={{ marginTop: "auto", borderTop: "1px solid #1e293b", paddingTop: 12, display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate("/edit-profile")}
            title="Edit profile"
            style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", fontFamily: "Georgia, serif", textAlign: "left" }}
          >
            <Avatar initials={userInitials(sessionStorage.getItem("name"))} color={ACCENT} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {(sessionStorage.getItem("name") || "User").split(" ").slice(0, 2).join(" ")}
              </div>
              <div style={{ color: "#475569", fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {roleLabel(role)} {sessionStorage.getItem("department")?.split(" ")[0] || ""}
              </div>
            </div>
          </button>
          <button
            onClick={() => navigate("/login", { replace: true })}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "none", border: "1px solid #374151", borderRadius: 8, padding: "9px 11px", cursor: "pointer", fontFamily: "Georgia, serif" }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "#1e293b"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "none"; }}
          >
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12 }}>Logout</span>
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: "20px 24px", overflowX: "auto" }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: 21 }}>School of Media & Communication Studies</h2>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{roleLabel(role)} workflow dashboard</div>
        </div>

        {activeTab === "my" && canSelfSubmit && (
          <div style={{ display: "grid", gap: 16 }}>
            <WorkflowTracker declaration={declaration} reviews={reviews} profile={{ ...profile, appraisal_role: role }} />
            {(selfSectionView === "partA" || selfSectionView === "partB") && (
              <>
                <MediaForm
                  form={form}
                  setForm={setForm}
                  docs={docs}
                  setDocs={setDocs}
                  mode="self"
                  locked={locked}
                  sectionView={selfSectionView}
                />
              </>
            )}
            {selfSectionView === "summary" && (
              <div style={{ display: "grid", gap: 16 }}>
                <SummaryBox totals={totals} maxScores={totals.maxScores} roleScoreLabel="Faculty/self appraisal score from the Media & Communication form." />
                <div style={{ display: "grid", gap: 12, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                  {locked ? <StatusBadge status={declaration?.status || "Submitted"} /> : <AccuracyCheckbox checked={confirmed} onChange={setConfirmed} />}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button onClick={generateSelfReport} style={smallButton("#4c1d95")}>
                      Generate Report
                    </button>
                    <button onClick={handleSubmitAppraisal} disabled={submitting || locked || !confirmed} style={smallButton(locked || !confirmed ? "#94a3b8" : "#059669")}>
                      {locked ? "Appraisal Locked" : submitting ? "Submitting..." : "Submit Appraisal"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "approvals" && !reviewing && role !== "faculty" && (
          <div style={{ display: "grid", gap: 14 }}>
            {loadingQueue && <div style={{ color: "#64748b" }}>Loading SoMCS queue...</div>}
            {!loadingQueue && queue.length === 0 && <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 30, color: "#64748b" }}>No SoMCS submissions are assigned to you.</div>}
            {queue.map((item) => (
              <div key={item.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: `3px solid ${ACCENT}`, borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{item.name}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{titleCase(item.appraisalRole)} - {item.school}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                {(() => {
                  const itemTotals = calculateMediaTotals(mergeForm(emptyMediaForm(), item), "score");
                  return <SummaryBox totals={itemTotals} maxScores={itemTotals.maxScores} roleScoreLabel={`Submitted on ${item.submittedOn || "record"}`} />;
                })()}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => setReviewing(item)} style={smallButton(item.status === "Reviewed" ? "#1e293b" : ACCENT2)}>
                    {item.status === "Reviewed" ? "View Review" : "Review Form"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "approvals" && reviewing && (
          <MediaCommAuthorityReviewPanel
            person={reviewing}
            reviewerRole={role}
            onBack={() => setReviewing(null)}
            onSubmit={handleSubmitReview}
            readOnly={/Reviewed/.test(reviewing.status || "")}
          />
        )}
      </main>
    </div>
  );
}

const thStyle = { border: "1px solid #cbd5e1", padding: "7px 8px", background: "#0f172a", color: "#e2e8f0", fontWeight: 800, textAlign: "center", fontSize: 10, whiteSpace: "nowrap" };
const tdStyle = { border: "1px solid #e2e8f0", padding: "5px 7px", verticalAlign: "middle", minWidth: 120 };
const tdCenter = { ...tdStyle, textAlign: "center", minWidth: 70 };
const smallButton = (background) => ({ padding: "8px 14px", background, color: "#fff", border: "none", borderRadius: 7, cursor: background === "#94a3b8" ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 12, fontFamily: "Georgia, serif" });
const navButton = (active) => ({ width: "100%", border: "none", borderLeft: `3px solid ${active ? ACCENT : "transparent"}`, background: active ? `${ACCENT}33` : "transparent", color: active ? "#fbbf24" : "#cbd5e1", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontWeight: 800, fontFamily: "Georgia, serif" });

