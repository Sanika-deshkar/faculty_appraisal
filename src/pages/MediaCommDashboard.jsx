import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ACR_DETAIL_POINTS, APP_INFO, createAcrRows } from "../constants/formConfig";
import { FORM_SCHOOL_CODES, FORM_TYPES } from "../constants/formRouting";
import { getSchoolKey } from "../constants/universityHierarchy";
import { fetchSavedAppraisal, loadAppraisalDocuments, loadSavedAppraisal, saveAppraisalDraftSection, submitAppraisal } from "../services/appraisalPersistence";
import { api } from "../services/api";
import { fetchReviewQueueForRole, submitWorkflowReview } from "../services/reviewWorkflow";
import { generateMediaCommReport } from "../utils/fullFormReport";
import {
  INNOVATIVE_METHODS,
  SCORE_LIMITS,
  averageSectionScore,
  clampScore,
  courseFileRowScore,
  effectiveMaxScore,
  feedbackAverage,
  feedbackRowScore,
  feedbackSectionScore,
  innovativeSelectionsFromDetails,
  innovativeTeachingScore,
  isAllowedAttachmentFile,
  isValidDDMMYYYY,
  maskDateDDMMYYYY,
  normalizeAutoScores,
  projectGuidanceRowMax,
  researchGuidanceRowMax,
  researchGuidanceScore,
  rowHasAnyValue,
  scoreSectionRows,
  societyRowLocked,
  societyRowScore,
  sumSectionScore,
  toggleInnovativeMethod,
  validateCompleteRows,
} from "../utils/appraisalFormUtils";
import { getReviewChain, pendingStatusFor, profileFromsessionStorage, reviewedStatusFor, roleLabel, visiblePreviousReviewRoles, workflowValidationError } from "../utils/hierarchy";
import AppraisalHeaderImage from "../components/AppraisalHeaderImage";

const ACCENT = "#b45309";
const ACCENT2 = "#0f766e";
const VERIFY_TEXT = "I have verified all the details and confirm that the information provided is correct. I am responsible for the accuracy of this data.";
const PART_A_MAX = 200;
const PART_B_MAX = 375;
const GRAND_MAX = 555;
const SECTION_OPTIONS = [
  { value: "partA", label: "Part-A Section" },
  { value: "partB", label: "Part-B Section" },
  { value: "summary", label: "Summary Section" },
];
const n = (value) => parseFloat(value) || 0;
const pct = (value, max) => Math.min(100, Math.round((n(value) / max) * 100)) || 0;
const titleCase = (value) => String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
const isReviewerReviewComplete = (item = {}, reviewerRole = "") => {
  const status = String(item?.status || item?.workflowStatus || item?.workflow_status || "");
  const reviewerLabel = roleLabel(reviewerRole);
  return (
    n(item?.[`${reviewerRole}Total`]) > 0 ||
    String(item?.[`${reviewerRole}Remarks`] ?? "").trim() !== "" ||
    status === reviewedStatusFor(reviewerRole) ||
    new RegExp(`${reviewerLabel}\\s*(Reviewed|Approved|Rejected)`, "i").test(status)
  );
};
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
  innovRows: [{ method: "", details: "", score: "" }],
  projects: [
    { label: "", score: "" },
  ],
  quals: [
    { label: "", score: "" },
  ],
  feedback: [{ code: "", fb1: "", fb2: "", score: "" }],
  deptActs: [{ activity: "", nature: "", score: "" }],
  uniActs: [{ activity: "", nature: "", score: "" }],
  society: [{ label: "", details: "", score: "" }],
  acr: createAcrRows(),
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
  { key: "courseFile", title: "A(ii). Course File", max: 20, doc: "cf", rowMax: SCORE_LIMITS.courseFileRow, fields: [["course", "Course / Paper"], ["title", "Program & Semester"], ["details", "Availability as per IQAC format"]] },
  { key: "projects", title: "A(iv). Project Guidance", max: 10, doc: "proj", rowMax: projectGuidanceRowMax, fields: [["label", "Project Category"]] },
  { key: "quals", title: "A(v). Qualification Enhancement", max: 10, doc: "qual", rowMax: SCORE_LIMITS.qualificationRow, fields: [["label", "Category"]] },
  { key: "feedback", title: "Student Feedback", max: 10, doc: "fb", fields: [["code", "Course Code / Name"], ["fb1", "First Feedback (%)"], ["fb2", "Second Feedback (%)"]] },
  { key: "deptActs", title: "Departmental / School Activities", max: 20, doc: "dept", fields: [["activity", "Activity"], ["nature", "Nature"]] },
  { key: "uniActs", title: "University Level Activities", max: 30, doc: "uni", fields: [["activity", "Activity"], ["nature", "Nature"]] },
  { key: "society", title: "(ix) Contribution to Society - Max 10 marks (Max 5 per row)", max: 10, doc: "soc", rowMax: SCORE_LIMITS.societyRow, fields: [["label", "Activity"], ["details", "Details"]] },
  { key: "acr", title: "(xi) Annual Confidential Report (ACR) - Max 25 marks", max: 25, doc: "acr", rowMax: SCORE_LIMITS.acrRow, fields: [["label", "Attribute", true]], selfReadOnlyScore: true },
];

const PART_B_SECTIONS = [
  { key: "journals", title: "B1(i). Published Papers in Journals", max: 80, doc: "jour", fields: [["title", "Title with Page Nos."], ["journal", "Journal Details"], ["issn", "ISSN No."], ["index", "Journal Indexing"]] },
  { key: "popularWritings", title: "B1(ii). Popular Writings, Film & Documentary", max: 40, doc: "pop", fields: [["media", "Newspaper / Magazine / Website"], ["film", "Film / Documentary"]] },
  { key: "books", title: "B2. Articles / Chapters in Books", max: 60, doc: "book", fields: [["title", "Title"], ["book", "Book & Publisher"], ["isbn", "ISBN"], ["publisher", "Type"], ["coAuthors", "Co-authors"], ["first", "First Author?"]] },
  { key: "ict", title: "B3. ICT Mediated Teaching-Learning Pedagogy / New Curricula", max: 30, doc: "ict", fields: [["title", "Title"], ["desc", "Short Description"], ["type", "Type / Link"], ["quad", "Quadrants"]] },
  { key: "research", title: "B4(a). Research Guidance - PhD / PG", max: 30, doc: "res", rowMax: researchGuidanceRowMax, fields: [["degree", "Degree"], ["name", "Student Name"], ["thesis", "Thesis / Status"]] },
  { key: "internalProjects", title: "B4(b). Internal Research Projects", max: 15, doc: "int", fields: [["title", "Title"], ["agency", "Funding Agency"], ["date", "Sanction Date"], ["amount", "Amount"], ["role", "Role"], ["status", "Status"]] },
  { key: "externalProjects", title: "B4(c). External Research Projects", max: 30, doc: "ext", fields: [["title", "Title"], ["agency", "Funding Agency"], ["date", "Sanction Date"], ["amount", "Amount"], ["role", "Role"], ["status", "Status"]] },
  { key: "awards", title: "B5. Research Awards", max: 10, doc: "awd", fields: [["title", "Title"], ["date", "Date"], ["agency", "Agency"], ["level", "Level"]] },
  { key: "confs", title: "B6. Conferences / Seminars / Workshops", max: 30, doc: "conf", fields: [["title", "Title"], ["type", "Type"], ["org", "Organization"], ["level", "Level"]] },
  { key: "proposals", title: "B7(a). Research Proposals", max: 10, doc: "prop", fields: [["title", "Title"], ["duration", "Duration"], ["agency", "Agency"], ["amount", "Amount"]] },
  { key: "products", title: "B7(b). Products Developed / Used", max: 20, doc: "prod", fields: [["details", "Product Details"], ["used", "Used / Adopted"]] },
  { key: "fdps", title: "B8(a). FDP / Self Development", max: 20, doc: "fdp", rowMax: SCORE_LIMITS.fdpRow, fields: [["program", "Program"], ["duration", "Duration"], ["org", "Organization"]] },
  { key: "training", title: "B8(b). Industrial Training", max: 20, doc: "train", rowMax: SCORE_LIMITS.fdpRow, fields: [["company", "Company"], ["duration", "Duration"], ["nature", "Nature"]] },
];

const ALL_ARRAY_KEYS = [...PART_A_SECTIONS, ...PART_B_SECTIONS].map((section) => section.key);
const REVIEW_SCORE_FIELDS = ["hod", "director", "dean", "vc"];

const preserveSavedReviewScores = (form = {}, source = {}) => {
  const merged = { ...form };
  ALL_ARRAY_KEYS.forEach((key) => {
    if (!Array.isArray(form[key])) return;
    const sourceRows = Array.isArray(source[key]) ? source[key] : [];
    merged[key] = form[key].map((row, index) => {
      const sourceRow = sourceRows[index] || {};
      const next = { ...row };
      REVIEW_SCORE_FIELDS.forEach((field) => {
        if (String(next[field] ?? "").trim() === "" && String(sourceRow[field] ?? "").trim() !== "") {
          next[field] = sourceRow[field];
        }
      });
      return next;
    });
  });
  ["innovHod", "innovDirector", "innovDean", "innovVc"].forEach((field) => {
    if (String(merged[field] ?? "").trim() === "" && String(source[field] ?? "").trim() !== "") {
      merged[field] = source[field];
    }
  });
  return merged;
};

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
  const lecturesScore = applicability["lectures"] === "notApplicable" ? 0 : averageSectionScore(form.lectures || [], 50, scoreKey);
  const courseFileScore = applicability["courseFile"] === "notApplicable" ? 0 : averageSectionScore(form.courseFile || [], 20, scoreKey);
  const partA = clampScore(
    lecturesScore + courseFileScore + (scoreKey === "score" && Array.isArray(form.innovRows) ? clampScore(form.innovRows.reduce((total, row) => total + clampScore(row.score, SCORE_LIMITS.innovativeRow), 0), 10) : scoreKey === "score" ? innovativeTeachingScore(form.innovDetails, form.innovScore, 10) : clampScore(form[scoreKeyForInnov(scoreKey)], 10)) +
    rowSum("projects", 10) + rowSum("quals", 10) + (scoreKey === "score" ? feedbackSectionScore(form.feedback, 10) : rowSum("feedback", 10)) +
    rowSum("deptActs", 20) + rowSum("uniActs", 30) + rowSum("society", 10) + rowSum("acr", 25),
    maxScores.partA,
  );
  const b8Score = clampScore(rowSum("fdps", 20) + rowSum("training", 20), 20);
  const partB = clampScore(
    PART_B_SECTIONS
      .filter((section) => section.key !== "fdps" && section.key !== "training")
      .reduce((total, section) => total + rowSum(section.key, section.max), 0) + b8Score,
    maxScores.partB,
  );
  return { partA, partB, total: clampScore(partA + partB, maxScores.grand), maxScores };
};

const getMediaEffectiveMaxScores = (form = {}) => {
  const applicability = form.sectionApplicability || {};
  const partA = effectiveMaxScore(PART_A_MAX, applicability, [
    PART_A_SECTIONS.find((section) => section.key === "projects"),
    PART_A_SECTIONS.find((section) => section.key === "society"),
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
  acr: createAcrRows(incoming.acr || base.acr),
});

const normalizeScoresForSubmit = (form) => normalizeAutoScores(form);

const validateMediaBeforeSubmit = (form, docs = {}, sectionView = "all") => {
  const applicability = form.sectionApplicability || {};
  const sectionsToValidate = sectionView === "partA" ? PART_A_SECTIONS : sectionView === "partB" ? PART_B_SECTIONS : [...PART_A_SECTIONS, ...PART_B_SECTIONS];
  const rowSections = sectionsToValidate.map((section) => ({
    label: section.title,
    rows: form[section.key] || [],
    fields: [
      ...section.fields.filter(([, , readOnly]) => !readOnly).map(([key]) => key),
      ...(section.selfReadOnlyScore || section.autoScore || section.key === "feedback" ? [] : ["score"]),
    ],
    rowMax: section.rowMax,
    maxScore: section.key === "feedback" ? undefined : section.max,
    docPrefix: section.key !== "courseFile" && section.key !== "acr" ? section.doc : "",
    skip: applicability[section.key] === "notApplicable",
  }));
  const errors = validateCompleteRows(rowSections, docs);

  if (sectionView !== "partA") ["internalProjects", "externalProjects"].forEach((key) => {
    (form[key] || []).forEach((row, index) => {
      if (row.date && !isValidDDMMYYYY(row.date)) {
        errors.push(`${key === "internalProjects" ? "B4(b)" : "B4(c)"}, row ${index + 1}: date must be DD/MM/YYYY.`);
      }
    });
  });

  if (sectionView !== "partB") {
    const innovRows = Array.isArray(form.innovRows) && form.innovRows.length
      ? form.innovRows
      : [{ method: form.innovDetails, details: form.innovDetails, score: form.innovScore }];
    errors.push(...validateCompleteRows([{
      label: "A(iii). Innovative Teaching Methods",
      rows: innovRows,
      fields: ["method", "details", "score"],
      docPrefix: "innov",
      rowMax: SCORE_LIMITS.innovativeRow,
      maxScore: 10,
    }], docs));
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
  const integer = type === "integer";
  const [textErr, setTextErr] = useState(false);
  const handleChange = (event) => {
    if (readOnly) return;
    let v = event.target.value;
    if (integer) {
      v = v.replace(/[^0-9]/g, "");
    } else if (numeric) {
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
        type="text"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={handleChange}
        onBlur={handleBlur}
        inputMode={integer ? "numeric" : numeric ? "decimal" : undefined}
        style={{ width: "100%", height: 30, boxSizing: "border-box", border: textErr ? "1.5px solid #ef4444" : "1px solid #cbd5e1", borderRadius: 4, padding: "5px 7px", fontSize: 11, fontFamily: "inherit", background: readOnly ? "#f8fafc" : "#fff", textAlign: center ? "center" : "left" }}
      />
      {textErr && <span style={{ position: "absolute", left: 0, top: "100%", fontSize: 9, color: "#ef4444", whiteSpace: "nowrap", lineHeight: 1.2 }}>Text expected</span>}
    </div>
  );
}

const NUMERIC_KEYS = new Set(["planned", "conducted", "fb1", "fb2", "amount"]);
const TEXT_ONLY_KEYS = new Set(["title", "course", "name", "degree", "thesis", "agency", "role", "status", "type", "level", "activity", "nature", "journal", "book", "publisher", "org", "program", "company", "desc", "coAuthors", "media", "film", "used"]);

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
    const unsupported = selected.find((file) => !isAllowedAttachmentFile(file));
    if (unsupported) {
      setUploadError("Only image or PDF files up to 10 MB are allowed.");
      if (ref.current) ref.current.value = "";
      return;
    }
    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      setUploadError("Only image or PDF files up to 10 MB are allowed.");
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
          <input ref={ref} type="file" accept="image/*,.pdf,application/pdf" style={{ display: "none" }} onChange={(event) => handleFiles(event.target.files)} />
        </button>
      )}
      {readOnly && !files.length && <span style={{ color: "#94a3b8", fontSize: 10 }}>No docs</span>}
    </div>
  );
}

function SectionShell({ title, children, accent = ACCENT }) {
  return (
    <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 800, color: accent, fontSize: 13 }}>{title}</div>
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
  const selfLocked = mode === "self" && section.key === "acr";
  const canToggleApplicability = editableSelf && ["projects", "research", "society"].includes(section.key);
  const earned = notApplicable ? 0 : (section.key === "lectures" || section.key === "courseFile")
    ? averageSectionScore(rows, section.max)
    : scoreSectionRows(section.key, rows, section.max);
  const totalLabel = ["lectures", "courseFile", "feedback"].includes(section.key)
    ? `Average Score (Max ${section.max})`
    : `Total Score (Max ${section.max})`;
  const totalLabelColSpan = 1 + section.fields.length + (section.key === "feedback" ? 1 : 0) + (section.key !== "courseFile" ? 1 : 0);
  const sectionTotalScore = (sourceRows = rows, scoreKey = "score") => {
    if (notApplicable) return 0;
    if (section.key === "lectures" || section.key === "courseFile") return averageSectionScore(sourceRows, section.max, scoreKey);
    if (section.key === "feedback" && scoreKey === "score") return feedbackSectionScore(sourceRows, section.max);
    return scoreSectionRows(section.key, sourceRows, section.max, scoreKey);
  };

  if (section.key === "acr" && mode === "self") {
    const acrRows = createAcrRows(rows);
    const acrTotal = scoreSectionRows(section.key, acrRows, section.max);
    return (
      <SectionShell title="(xi) Annual Confidential Report (ACR) - Max 25 marks" max={section.max} earned={acrTotal} accent="#ef4444" showScoreSummary={false}>
        <div style={{ fontSize: 11, color: "#b45309", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 5, padding: "6px 10px", marginBottom: 8 }}>
          Warning: This section is filled by your superior (HOD/Director). Your scores here are read-only.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={thStyle}>SN</th>
                <th style={thStyle}>Attribute</th>
                <th style={thStyle}>Score</th>
              </tr>
            </thead>
            <tbody>
              {acrRows.map((row, index) => (
                <tr key={`acr-${index}`} style={index % 2 === 1 ? { background: "#f8fafc" } : {}}>
                  <td style={tdCenter}>{index + 1}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    {ACR_DETAIL_POINTS[row.label] && (
                      <ul style={{ margin: "5px 0 0 16px", padding: 0, color: "#64748b", fontSize: 10, lineHeight: 1.5 }}>
                        {ACR_DETAIL_POINTS[row.label].map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    )}
                  </td>
                  <td style={tdCenter}><RO value={String(row.score ?? "").trim() ? clampScore(row.score, SCORE_LIMITS.acrRow) : "-"} center /></td>
                </tr>
              ))}
              <tr style={{ background: "#eff6ff" }}>
                <td style={{ ...tdCenter, fontWeight: "bold" }} colSpan={2}>Total Score (Max 25)</td>
                <td style={{ ...tdCenter, fontWeight: "bold" }}>{acrTotal.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionShell>
    );
  }

  const rowSelfScore = (row) => {
    if (section.key === "feedback") return feedbackRowScore(row, section.max);
    if (section.key === "courseFile") return courseFileRowScore(row);
    if (section.key === "research") return String(row.score ?? "").trim() !== "" ? clampScore(row.score, researchGuidanceRowMax(row)) : researchGuidanceScore(row);
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
    setForm((prev) => ({ ...prev, [section.key]: [...(prev[section.key] || []), { ...blank, score: "", _id: Date.now() + Math.random() }] }));
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
      {!notApplicable && (<>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={thStyle}>SN</th>
              {section.fields.map(([, label]) => <th key={label} style={thStyle}>{label}</th>)}
              {section.key === "feedback" && <th style={thStyle}>Average</th>}
              {section.key !== "courseFile" && <th style={thStyle}>Documents</th>}
              <th style={thStyle}>Faculty Score</th>
              {mode === "review" && previousRoles.map((role) => <th key={role} style={thStyle}>{roleLabel(role)} Score</th>)}
              {mode === "review" && <th style={thStyle}>{roleLabel(currentRole)} Score</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const socRowLocked = section.key === "society" && societyRowLocked(row);
              const currentRowMax = section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max;
              const displayScore = (value) => String(value ?? "").trim() ? clampScore(value, currentRowMax) : "";
              return (
              <tr key={row._id ?? `${section.key}-${index}`} style={socRowLocked ? { background: "#f1f5f9", opacity: 0.65 } : {}}>
                <td style={tdCenter}>{index + 1}</td>
                {section.fields.map(([key, , readOnlyField]) => (
                  <td key={key} style={tdStyle}>
                    {mode !== "self" ? <RO value={row[key]} /> : key === "first" ? (
                      <select
                        value={row[key] || ""}
                        disabled={!editableSelf || readOnlyField || notApplicable || selfLocked}
                        onChange={(event) => updateRow(index, key, event.target.value)}
                        style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "inherit", fontSize: 11 }}
                      >
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : section.key === "research" && key === "degree" ? (
                      <select
                        value={row[key] || ""}
                        disabled={!editableSelf || readOnlyField || notApplicable || selfLocked}
                        onChange={(event) => updateRow(index, key, event.target.value)}
                        style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "inherit", fontSize: 11 }}
                      >
                        <option value="">Select</option>
                        <option value="PhD">PhD</option>
                        <option value="PG">PG</option>
                      </select>
                    ) : section.key === "courseFile" && key === "details" ? (
                      <select
                        value={row[key] || ""}
                        disabled={!editableSelf || notApplicable || selfLocked}
                        onChange={(event) => updateRow(index, key, event.target.value)}
                        style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "inherit", fontSize: 11 }}
                      >
                        <option value="">Select</option>
                        <option value="1.Available">1.Available</option>
                        <option value="2.Partially Available">2.Partially Available</option>
                        <option value="3.Not Available">3.Not Available</option>
                      </select>
                    ) : (
                      <>
                        <TI value={row[key]} type={NUMERIC_KEYS.has(key) ? "number" : "text"} center={section.key === "courseFile" && key === "title"} max={key === "fb1" || key === "fb2" ? SCORE_LIMITS.feedbackAverage : undefined} textOnly={TEXT_ONLY_KEYS.has(key) && !(section.key === "courseFile" && key === "title")} readOnly={!editableSelf || readOnlyField || notApplicable || selfLocked || socRowLocked} onChange={(value) => updateRow(index, key, value)} />
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
                {section.key !== "courseFile" && <td style={tdStyle}><DocCell id={`${section.doc}-${index}`} docs={docs} setDocs={setDocs} readOnly={!editableSelf || notApplicable || selfLocked || socRowLocked} /></td>}
                <td style={tdCenter}>
                  {mode === "self"
                    ? section.key === "feedback"
                      ? <RO value={feedbackRowScore(row, section.max).toFixed(1)} center />
                        : <TI value={row.score} type="number" center max={section.rowMax ? (typeof section.rowMax === "function" ? section.rowMax(row) : section.rowMax) : section.max} readOnly={!editableSelf || section.selfReadOnlyScore || notApplicable || selfLocked || socRowLocked} onChange={(value) => updateRow(index, "score", value)} />
                    : <RO value={rowSelfScore(row) ? rowSelfScore(row).toFixed(1) : ""} center />}
                </td>
                {mode === "review" && previousRoles.map((role) => <td key={role} style={tdCenter}><RO value={socRowLocked ? "0" : displayScore(row[role])} center /></td>)}
                {mode === "review" && (
                  <td style={tdCenter}>
                    <TI type="number" center max={currentRowMax} readOnly={reviewLocked || socRowLocked} value={socRowLocked ? "0" : displayScore(reviewRows[index]?.[currentRole] ?? row[currentRole] ?? "")} onChange={(value) => updateReview(index, value)} />
                  </td>
                )}
              </tr>
              );
            })}
            <tr style={{ background: "#eff6ff" }}>
              <td style={{ ...tdCenter, fontWeight: "bold" }} colSpan={totalLabelColSpan}>{totalLabel}</td>
              <td style={{ ...tdCenter, fontWeight: "bold" }}>{earned.toFixed(1)}</td>
              {mode === "review" && previousRoles.map((role) => (
                <td key={role} style={{ ...tdCenter, fontWeight: "bold" }}>
                  {sectionTotalScore(rows, role).toFixed(1)}
                </td>
              ))}
              {mode === "review" && (
                <td style={{ ...tdCenter, fontWeight: "bold" }}>
                  {sectionTotalScore(reviewRows.length ? reviewRows : rows, currentRole).toFixed(1)}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>
      {editableSelf && !section.selfReadOnlyScore && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" onClick={addRow} style={smallButton("#10b981")}>+ Add Row</button>
          <button type="button" onClick={deleteRow} style={smallButton("#ef4444")}>Delete Last</button>
        </div>
      )}
      </>)}
    </SectionShell>
  );
}

function B8SectionTable({ section, form, setForm, docs, setDocs, mode, locked, reviewerRole, reviewData, setReviewData, previousRoles, showTotal = false }) {
  const rows = form[section.key] || [];
  const reviewRows = reviewData?.[section.key] || [];
  const editableSelf = mode === "self" && !locked;
  const reviewLocked = mode === "review" && locked;
  const totalB8 = clampScore(scoreSectionRows("fdps", form.fdps || [], 20) + scoreSectionRows("training", form.training || [], 20), 20);

  const updateRow = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section.key]: (prev[section.key] || []).map((row, rowIndex) => (
        rowIndex === index
          ? { ...row, [key]: key === "score" ? clampScore(value, SCORE_LIMITS.fdpRow) : value }
          : row
      )),
    }));
  };

  const updateReview = (index, value) => {
    setReviewData((prev) => {
      const source = prev[section.key] || cloneRows(rows);
      const nextRows = source.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [reviewerRole]: value === "" ? "" : String(clampScore(value, SCORE_LIMITS.fdpRow)) } : row
      ));
      return { ...prev, [section.key]: nextRows };
    });
  };

  const addRow = () => {
    const blank = Object.fromEntries(section.fields.map(([key]) => [key, ""]));
    setForm((prev) => ({ ...prev, [section.key]: [...(prev[section.key] || []), { ...blank, score: "", _id: Date.now() + Math.random() }] }));
  };

  const deleteRow = () => {
    setForm((prev) => ({ ...prev, [section.key]: (prev[section.key] || []).length > 1 ? prev[section.key].slice(0, -1) : prev[section.key] }));
  };

  return (
    <SectionShell title={section.title} max={section.max} earned={scoreSectionRows(section.key, rows, section.max)} accent={ACCENT2} showScoreSummary={false}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 60 }}>SN</th>
              {section.fields.map(([, label]) => <th key={label} style={thStyle}>{label}</th>)}
              <th style={thStyle}>Documents</th>
              <th style={thStyle}>Faculty Score</th>
              {mode === "review" && previousRoles.map((role) => <th key={role} style={thStyle}>{roleLabel(role)} Score</th>)}
              {mode === "review" && <th style={thStyle}>{roleLabel(reviewerRole)} Score</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row._id ?? `${section.key}-${index}`}>
                <td style={tdCenter}>{index + 1}</td>
                {section.fields.map(([key]) => (
                  <td key={key} style={tdStyle}>
                    {mode === "self"
                      ? <TI value={row[key]} textOnly={TEXT_ONLY_KEYS.has(key)} readOnly={!editableSelf} onChange={(value) => updateRow(index, key, value)} />
                      : <RO value={row[key]} />}
                  </td>
                ))}
                <td style={tdStyle}><DocCell id={`${section.doc}-${index}`} docs={docs} setDocs={setDocs} readOnly={!editableSelf} /></td>
                <td style={tdCenter}>
                  {mode === "self"
                    ? <TI value={row.score} type="number" center max={SCORE_LIMITS.fdpRow} readOnly={!editableSelf} onChange={(value) => updateRow(index, "score", value)} />
                    : <RO value={row.score} center />}
                </td>
                {mode === "review" && previousRoles.map((role) => <td key={role} style={tdCenter}><RO value={row[role]} center /></td>)}
                {mode === "review" && (
                  <td style={tdCenter}>
                    <TI type="number" center max={SCORE_LIMITS.fdpRow} readOnly={reviewLocked} value={reviewRows[index]?.[reviewerRole] ?? row[reviewerRole] ?? ""} onChange={(value) => updateReview(index, value)} />
                  </td>
                )}
              </tr>
            ))}
            {showTotal && (
              <tr style={{ background: "#f3e8ff" }}>
                <td style={{ ...tdCenter, fontWeight: 900 }} colSpan={section.fields.length + 2}>Total B8 Score (Max 20)</td>
                <td style={{ ...tdCenter, fontWeight: 900 }}>{totalB8.toFixed(1)}</td>
                {mode === "review" && previousRoles.map((role) => (
                  <td key={role} style={{ ...tdCenter, fontWeight: 900 }}>
                    {clampScore(scoreSectionRows("fdps", form.fdps || [], 20, role) + scoreSectionRows("training", form.training || [], 20, role), 20).toFixed(1)}
                  </td>
                ))}
                {mode === "review" && (
                  <td style={{ ...tdCenter, fontWeight: 900 }}>
                    {clampScore(scoreSectionRows("fdps", reviewData.fdps || form.fdps || [], 20, reviewerRole) + scoreSectionRows("training", reviewData.training || form.training || [], 20, reviewerRole), 20).toFixed(1)}
                  </td>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editableSelf && (
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
  const visibleInnovRows = (form.innovRows || []).length > 0
    ? form.innovRows
    : [{ method: form.innovDetails, details: form.innovDetails, score: form.innovScore }];
  const facultyScore = clampScore(
    visibleInnovRows.reduce((total, row) => total + clampScore(row.score, SCORE_LIMITS.innovativeRow), 0),
    10,
  );
  const updateSelfRow = (index, field, value) => {
    setForm((prev) => {
      const baseRows = (prev.innovRows || []).length > 0
        ? prev.innovRows
        : [{ method: prev.innovDetails, details: prev.innovDetails, score: prev.innovScore }];
      const nextRows = baseRows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));
      const nextScore = clampScore(nextRows.reduce((total, row) => total + clampScore(row.score, SCORE_LIMITS.innovativeRow), 0), 10);
      return {
        ...prev,
        innovRows: nextRows,
        innovDetails: nextRows.map((row) => row.method).filter(Boolean).join(", "),
        innovScore: String(nextScore),
      };
    });
  };
  const addInnovRow = () =>
    setForm((prev) => ({
      ...prev,
      innovRows: [...(prev.innovRows || []), { method: "", details: "", score: "" }],
    }));
  const deleteInnovRow = () =>
    setForm((prev) => ({
      ...prev,
      innovRows: (prev.innovRows || []).length > 1 ? (prev.innovRows || []).slice(0, -1) : (prev.innovRows || []),
    }));

  return (
    <SectionShell title="(iii) Innovative Teaching-Learning Methodologies - Max 10 marks" max={10} earned={facultyScore}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 42 }}>SN</th>
            <th style={thStyle}>Methods Used</th>
            <th style={thStyle}>Details</th>
            <th style={thStyle}>Attachment</th>
            <th style={thStyle}>View Docs</th>
            <th style={thStyle}>{mode === "self" ? "Score" : "Faculty Score"}</th>
            {mode === "review" && previousRoles.map((role) => <th key={role} style={thStyle}>{roleLabel(role)} Score</th>)}
            {mode === "review" && <th style={thStyle}>{roleLabel(reviewerRole)} Score</th>}
          </tr>
        </thead>
        <tbody>
          {visibleInnovRows.map((row, index) => (
            <tr key={index}>
              <td style={tdCenter}>{index + 1}</td>
              <td style={tdStyle}>{mode === "self" ? <TI value={row.method} textOnly readOnly={!editableSelf} onChange={(value) => updateSelfRow(index, "method", value)} /> : <RO value={row.method || form.innovDetails} />}</td>
              <td style={tdStyle}>{mode === "self" ? <TI value={row.details} textOnly readOnly={!editableSelf} onChange={(value) => updateSelfRow(index, "details", value)} /> : <RO value={row.details} />}</td>
              <td style={tdStyle}><DocCell id={`innov-${index}`} docs={docs} setDocs={setDocs} readOnly={!editableSelf} /></td>
              <td style={tdStyle}><DocCell id={`innov-${index}`} docs={docs} setDocs={setDocs} readOnly /></td>
              <td style={tdCenter}>{mode === "self" ? <TI type="number" center max={SCORE_LIMITS.innovativeRow} readOnly={!editableSelf} value={row.score} onChange={(value) => updateSelfRow(index, "score", value)} /> : <RO value={row.score || form.innovScore} center />}</td>
              {mode === "review" && previousRoles.map((role) => <td key={role} style={tdCenter}><RO value={form[scoreKeyForInnov(role)]} center /></td>)}
              {mode === "review" && <td style={tdCenter}><TI type="number" center max={10} readOnly={reviewLocked} value={reviewData.innovativeTeaching?.[reviewerRole] ?? form[currentScore] ?? ""} onChange={updateReview} /></td>}
            </tr>
          ))}
          <tr style={{ background: "#eff6ff" }}>
            <td style={{ ...tdCenter, fontWeight: 800 }} colSpan={5}>Total Score (Max 10)</td>
            <td style={{ ...tdCenter, fontWeight: 800 }}>{facultyScore.toFixed(1)}</td>
            {mode === "review" && previousRoles.map((role) => <td key={role} style={{ ...tdCenter, fontWeight: 800 }}><RO value={form[scoreKeyForInnov(role)]} center /></td>)}
            {mode === "review" && <td style={{ ...tdCenter, fontWeight: 800 }}><RO value={reviewData.innovativeTeaching?.[reviewerRole] ?? form[currentScore]} center /></td>}
          </tr>
        </tbody>
      </table>
      {mode === "self" && !locked && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={addInnovRow} style={smallButton("#0f766e")}>Add Row</button>
          <button type="button" onClick={deleteInnovRow} disabled={visibleInnovRows.length <= 1} style={smallButton(visibleInnovRows.length <= 1 ? "#94a3b8" : "#ef4444")}>Delete Last</button>
        </div>
      )}
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
          {PART_B_SECTIONS.map((section) => (
            section.key === "fdps" || section.key === "training"
              ? <B8SectionTable key={section.key} section={section} form={form} setForm={setForm} docs={docs} setDocs={setDocs} mode={mode} locked={locked} reviewerRole={reviewerRole} reviewData={reviewData} setReviewData={setReviewData} previousRoles={previousRoles} showTotal={section.key === "training"} />
              : <SectionTable key={section.key} section={section} form={form} setForm={setForm} docs={docs} setDocs={setDocs} mode={mode} locked={locked} reviewerRole={reviewerRole} reviewData={reviewData} setReviewData={setReviewData} previousRoles={previousRoles} />
          ))}
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
        onChange={(event) => {
          onChange(event.target.value);
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          });
        }}
        style={{ height: 36, border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#0f172a", padding: "0 10px", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}
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
        {locked ? "Submitted and locked" : saved ? `${label} saved to server.` : `Save ${label} draft to server.`}
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
          return { label: roleLabel(role), state: review ? "Reviewed" : next === role ? "Pending" : "Waiting", time: review?.reviewed_at };
        })].map((step) => (
          <div key={step.label} style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: 9, background: step.state === "Reviewed" || step.state === "Done" ? "#ecfdf5" : step.state === "Pending" ? "#fffbeb" : "#f8fafc" }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{step.state}</div>
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>{step.label}</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{step.time ? new Date(step.time).toLocaleString() : "No timestamp yet"}</div>
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
      [reviewerRole]: key === "society" && societyRowLocked(row)
        ? "0"
        : key === "acr"
        ? (String(reviewRows[index]?.[reviewerRole] ?? row[reviewerRole] ?? "").trim() ? String(clampScore(reviewRows[index]?.[reviewerRole] ?? row[reviewerRole], SCORE_LIMITS.acrRow)) : "")
        : reviewRows[index]?.[reviewerRole] ?? row[reviewerRole] ?? "",
    }));
  });
  payload.innovativeTeaching = {
    [reviewerRole]: reviewData.innovativeTeaching?.[reviewerRole] ?? person[scoreKeyForInnov(reviewerRole)] ?? "",
  };
  return payload;
}

function GuideSection({ title, accent = ACCENT, children }) {
  return (
    <div className="fa-section-card" style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(15,23,42,0.07)", marginBottom: 14, overflow: "hidden", border: "1px solid #e8ecf0", borderTop: `3px solid ${accent}` }}>
      <div style={{ padding: "10px 15px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, fontSize: 13, color: accent }}>{title}</div>
      <div style={{ padding: "13px 15px" }}>{children}</div>
    </div>
  );
}

export function MediaCommAuthorityReviewPanel({ person, reviewerRole, onBack, onSubmit, readOnly = false, showReport = false }) {
  const [sectionView, setSectionView] = useState("partA");
  const [reviewData, setReviewData] = useState({});
  const [remarks, setRemarks] = useState(person?.[`${reviewerRole}Remarks`] || "");
  const [confirmed, setConfirmed] = useState(false);
  const form = mergeForm(emptyMediaForm(), person || {});
  const [docs, setDocs] = useState(form.docs || {});
  const subjectProfile = { school: person?.school, department: person?.department, appraisal_role: person?.appraisalRole };
  const visiblePreviousRoles = visiblePreviousReviewRoles(reviewerRole, subjectProfile);

  const reviewerForm = useMemo(() => {
    const merged = { ...form };
    ALL_ARRAY_KEYS.forEach((key) => {
      merged[key] = (form[key] || []).map((row, index) => ({
        ...row,
        [reviewerRole]: key === "society" && societyRowLocked(row) ? "0" : reviewData[key]?.[index]?.[reviewerRole] ?? row[reviewerRole] ?? "",
      }));
    });
    merged[scoreKeyForInnov(reviewerRole)] = reviewData.innovativeTeaching?.[reviewerRole] ?? form[scoreKeyForInnov(reviewerRole)] ?? "";
    return merged;
  }, [form, reviewData, reviewerRole]);
  const facultyTotals = calculateMediaTotals(form, "score");
  const totals = calculateMediaTotals(reviewerForm, reviewerRole);
  const reviewCompleted = readOnly || isReviewerReviewComplete(person, reviewerRole);
  const savedReviewerTotalKeys = [`${reviewerRole}PartA`, `${reviewerRole}PartB`, `${reviewerRole}Total`];
  const hasSavedReviewerTotals = savedReviewerTotalKeys.some((key) => String(person?.[key] ?? "").trim() !== "");
  const reviewerSummaryTotals = reviewCompleted && hasSavedReviewerTotals ? {
    ...totals,
    partA: String(person?.[`${reviewerRole}PartA`] ?? "").trim() !== "" ? n(person?.[`${reviewerRole}PartA`]) : totals.partA,
    partB: String(person?.[`${reviewerRole}PartB`] ?? "").trim() !== "" ? n(person?.[`${reviewerRole}PartB`]) : totals.partB,
    total: String(person?.[`${reviewerRole}Total`] ?? "").trim() !== "" ? n(person?.[`${reviewerRole}Total`]) : totals.total,
  } : totals;

  const generateReviewReport = async () => {
    if (!reviewCompleted) return;
    const applicability = reviewerForm.sectionApplicability || {};
    const rowSum = (key, max) => applicability[key] === "notApplicable" ? 0 : scoreSectionRows(key, reviewerForm[key] || [], max, "score");
    const lecScore = applicability["lectures"] === "notApplicable" ? 0 : averageSectionScore(reviewerForm.lectures || [], 50, "score");
    const cfScore = applicability["courseFile"] === "notApplicable" ? 0 : averageSectionScore(reviewerForm.courseFile || [], 20, "score");
    const innovScore = clampScore(
      Array.isArray(reviewerForm.innovRows)
        ? reviewerForm.innovRows.reduce((t, r) => t + clampScore(r.score, SCORE_LIMITS.innovativeRow), 0)
        : innovativeTeachingScore(reviewerForm.innovDetails, reviewerForm.innovScore, 10),
      10,
    );
    const projScore = rowSum("projects", 10);
    const qualScore = rowSum("quals", 10);
    const fbScore = feedbackSectionScore(reviewerForm.feedback || [], 10);
    const deptScore = rowSum("deptActs", 20);
    const uniScore = rowSum("uniActs", 30);
    const socScore = rowSum("society", 10);
    const acrScore = rowSum("acr", 25);
    const b1iScore = rowSum("journals", 80);
    const b1iiScore = rowSum("popularWritings", 40);
    const b2Score = rowSum("books", 60);
    const b3Score = rowSum("ict", 30);
    const b4aScore = rowSum("research", 30);
    const b4bScore = rowSum("internalProjects", 15);
    const b4cScore = rowSum("externalProjects", 30);
    const b5Score = rowSum("awards", 10);
    const b6Score = rowSum("confs", 30);
    const b7aScore = rowSum("proposals", 10);
    const b7bScore = rowSum("products", 20);
    const b8Score = clampScore(rowSum("fdps", 20) + rowSum("training", 20), 20);
    const maxScores = getMediaEffectiveMaxScores(reviewerForm);
    const partATotal = n(person?.[`${reviewerRole}PartA`] ?? totals.partA);
    const partBTotal = n(person?.[`${reviewerRole}PartB`] ?? totals.partB);
    const grandTotal = n(person?.[`${reviewerRole}Total`] ?? totals.total);
    await generateMediaCommReport({
      title: "SoMCS Appraisal Report",
      subtitle: "School of Media & Communication Studies",
      form: reviewerForm,
      docs,
      partASections: PART_A_SECTIONS,
      partBSections: PART_B_SECTIONS,
      totals: { partA: partATotal, partB: partBTotal, total: grandTotal },
      maxScores,
      generatedBy: sessionStorage.getItem("name") || roleLabel(reviewerRole),
      detailedSummaryRows: [
        { isHeader: true, label: "Part A — Teaching Process & Academic Activities" },
        { id: "A(i)", label: "Lectures / Tutorials / Practicals", max: 50, score: lecScore },
        { id: "A(ii)", label: "Course File", max: 20, score: cfScore },
        { id: "A(iii)", label: "Innovative Teaching-Learning Methodologies", max: 10, score: innovScore },
        ...(applicability.projects !== "notApplicable" ? [{ id: "A(iv)", label: "Project Guidance", max: 10, score: projScore }] : []),
        { id: "A(v)", label: "Qualification Enhancement", max: 10, score: qualScore },
        { id: "A(vi)", label: "Students' Feedback", max: 10, score: fbScore },
        { id: "A(vii)", label: "Departmental / School Activities", max: 20, score: deptScore },
        { id: "A(viii)", label: "University Level Activities", max: 30, score: uniScore },
        { id: "A(ix)", label: "Contribution to Society", max: 10, score: socScore },
        { id: "A(x)", label: "Annual Confidential Report (ACR)", max: 25, score: acrScore },
        { isTotal: true, label: "Part A Total", max: maxScores.partA, score: partATotal },
        { isHeader: true, label: "Part B — Research & Academic Contributions" },
        { id: "B1(i)", label: "Published Papers in Journals", max: 80, score: b1iScore },
        { id: "B1(ii)", label: "Popular Writings, Film & Documentary", max: 40, score: b1iiScore },
        { id: "B2", label: "Articles / Chapters in Books", max: 60, score: b2Score },
        { id: "B3", label: "ICT Mediated Teaching-Learning Pedagogy / New Curricula", max: 30, score: b3Score },
        ...(applicability.research !== "notApplicable" ? [{ id: "B4(a)", label: "Research Guidance — PhD / PG", max: 30, score: b4aScore }] : []),
        { id: "B4(b)", label: "Internal Research Projects", max: 15, score: b4bScore },
        { id: "B4(c)", label: "External Research Projects", max: 30, score: b4cScore },
        { id: "B5", label: "Research Awards", max: 10, score: b5Score },
        { id: "B6", label: "Conferences / Seminars / Workshops", max: 30, score: b6Score },
        { id: "B7(a)", label: "Research Proposals", max: 10, score: b7aScore },
        { id: "B7(b)", label: "Products Developed / Used", max: 20, score: b7bScore },
        { id: "B8", label: "FDP / Self Development + Industrial Training", max: 20, score: b8Score },
        { isTotal: true, label: "Part B Total", max: maxScores.partB, score: partBTotal },
        { isGrandTotal: true, label: "Grand Total (Part A + Part B)", max: maxScores.grand, score: grandTotal },
      ],
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
          <SummaryBox totals={facultyTotals} maxScores={facultyTotals.maxScores} roleScoreLabel="Faculty submitted score for the SoMCS media appraisal form." />
          <SummaryBox totals={reviewerSummaryTotals} maxScores={totals.maxScores} roleScoreLabel={`${roleLabel(reviewerRole)} score for the SoMCS media appraisal form.`} />
          <label style={{ display: "grid", gap: 6, fontWeight: 800, color: "#134e4a", fontSize: 13 }}>
            {roleLabel(reviewerRole)} Remarks
            <textarea value={remarks} readOnly={readOnly} onChange={(event) => setRemarks(event.target.value)} rows={5} style={{ border: "1px solid #99f6e4", borderRadius: 7, padding: 10, fontFamily: "inherit", resize: "vertical" }} />
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
                disabled={!confirmed || !remarks.trim()}
                style={smallButton((confirmed && remarks.trim()) ? "#059669" : "#94a3b8")}
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
  const [guidelinesTab, setGuidelinesTab] = useState("form");
  const [selfSectionView, setSelfSectionView] = useState("partA");
  const [form, setForm] = useState(emptyMediaForm);
  const [docs, setDocs] = useState({});
  const [queue, setQueue] = useState([]);
  const [reviewing, setReviewing] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(null);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attachmentsConfirmed, setAttachmentsConfirmed] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sectionSaveStatus, setSectionSaveStatus] = useState({ partA: true, partB: true });
  const [savingSection, setSavingSection] = useState(null);
  const [declaration, setDeclaration] = useState(null);
  const [reviews, setReviews] = useState([]);
  const userEmail = sessionStorage.getItem("username") || "";
  const academicYear = form.info?.ay || "2025-2026";
  const locked = Boolean(declaration);
  const totals = calculateMediaTotals(form, "score");
  const canSelfSubmit = role !== "vc";

  const setters = useMemo(() => Object.fromEntries([
    ["setInfo", (value) => setForm((prev) => ({ ...prev, info: { ...prev.info, ...value } }))],
    ...ALL_ARRAY_KEYS.map((key) => [`set${titleCase(key)}`, (value) => setForm((prev) => ({ ...prev, [key]: key === "acr" ? createAcrRows(value) : value }))]),
    ["setInnovDetails", (value) => setForm((prev) => ({ ...prev, innovDetails: value }))],
    ["setInnovScore", (value) => setForm((prev) => ({ ...prev, innovScore: value }))],
    ["setInnovRows", (value) => setForm((prev) => ({ ...prev, innovRows: value }))],
    ["setInnovHod", (value) => setForm((prev) => ({ ...prev, innovHod: value }))],
    ["setInnovDirector", (value) => setForm((prev) => ({ ...prev, innovDirector: value }))],
    ["setInnovDean", (value) => setForm((prev) => ({ ...prev, innovDean: value }))],
    ["setInnovVc", (value) => setForm((prev) => ({ ...prev, innovVc: value }))],
    ["setSectionApplicability", (value) => setForm((prev) => ({ ...prev, sectionApplicability: { ...(prev.sectionApplicability || {}), ...(value || {}) } }))],
    ["setSectionSaveStatus", (value) => setSectionSaveStatus((prev) => ({ ...prev, ...(value || {}) }))],
  ]), []);

  useEffect(() => {
    if (!userEmail || !academicYear || !canSelfSubmit) return;
    const loadAll = async () => {
      const data = await api.get("/appraisal/status", { params: { academic_year: academicYear } }).catch((err) => {
        console.error("Could not load workflow status:", err);
        return null;
      });
      const declarationRow = data?.declaration || null;
      setDeclaration(declarationRow);
      setReviews(data?.reviews || []);
      await Promise.all([
        loadSavedAppraisal({ facultyEmail: userEmail, academicYear, setters }),
        loadAppraisalDocuments({ facultyEmail: userEmail, academicYear, setDocs }),
      ]);
    };
    loadAll().catch((err) => console.error("Could not load SoMCS appraisal:", err));
  }, [userEmail, academicYear, setters, canSelfSubmit]);

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
    setSelfSectionView(section);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  const handleSaveSelfSection = async (section) => {
    if (locked) return;
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }
    const nextStatus = { ...sectionSaveStatus, [section]: true };
    setSavingSection(section);
    try {
      await saveAppraisalDraftSection({
        facultyEmail: userEmail,
        academicYear,
        form: { ...form, sectionSaveStatus: nextStatus },
        docs,
        totals: { partATotal: totals.partA, partBTotal: totals.partB, grandTotal: totals.total },
        submitterProfile: { ...profile, appraisal_role: role },
        sectionSaveStatus: nextStatus,
      });
      setSectionSaveStatus(nextStatus);
    } catch (err) {
      if (err?.statusCode === 403 || err?.response?.status === 403) {
        setDeclaration((current) => current || { status: "Submitted" });
        return;
      }
      alert(`Unable to save draft.\n\n${err.message}`);
    } finally {
      setSavingSection(null);
    }
  };

  const handleSubmitAppraisal = async () => {
    if (!confirmed || !attachmentsConfirmed) {
      alert("Please tick both declaration checkboxes before submitting.");
      return;
    }
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }
    const submitterProfile = { ...profile, appraisal_role: role };
    const workflowError = workflowValidationError(submitterProfile);
    if (workflowError) {
      alert(workflowError);
      return;
    }
    const normalizedForm = normalizeScoresForSubmit(form);
    const validationErrors = validateMediaBeforeSubmit(normalizedForm, docs);
    if (validationErrors.length) {
      alert(validationErrors.join("\n"));
      return;
    }
    setSubmitting(true);
    try {
      await submitAppraisal({
        facultyEmail: userEmail,
        academicYear,
        totals: { partATotal: totals.partA, partBTotal: totals.partB, grandTotal: totals.total },
        form: normalizedForm,
        docs,
        submitterProfile,
        activeProfile: submitterProfile,
      });
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
    if (!remarks?.trim()) {
      alert("Remarks are mandatory. Please enter your remarks before submitting the review.");
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

  const openSubmittedReview = async (item) => {
    setReviewLoading(item.id);
    try {
      const data = await fetchSavedAppraisal({
        facultyEmail: item.email,
        academicYear: item.academic_year || item.academicYear || item.info?.ay || APP_INFO.DEFAULT_AY || "2025-2026",
      });
      const submittedForm = data?.payload?.form || data?.form || {};
      const submittedDocs = data?.payload?.docs || data?.docs || {};
      const mergedForm = preserveSavedReviewScores(submittedForm, item);
      setReviewing({ ...item, ...mergedForm, docs: submittedDocs });
    } catch (err) {
      alert(`Unable to open submitted form.\n\n${err.message}`);
    } finally {
      setReviewLoading(null);
    }
  };

  const generateSelfReport = async () => {
    const applicability = form.sectionApplicability || {};
    const rowSum = (key, max) => applicability[key] === "notApplicable" ? 0 : scoreSectionRows(key, form[key] || [], max, "score");
    const lecScore = applicability["lectures"] === "notApplicable" ? 0 : averageSectionScore(form.lectures || [], 50, "score");
    const cfScore = applicability["courseFile"] === "notApplicable" ? 0 : averageSectionScore(form.courseFile || [], 20, "score");
    const innovScore = clampScore(
      Array.isArray(form.innovRows)
        ? form.innovRows.reduce((t, r) => t + clampScore(r.score, SCORE_LIMITS.innovativeRow), 0)
        : innovativeTeachingScore(form.innovDetails, form.innovScore, 10),
      10,
    );
    const projScore = rowSum("projects", 10);
    const qualScore = rowSum("quals", 10);
    const fbScore = feedbackSectionScore(form.feedback || [], 10);
    const deptScore = rowSum("deptActs", 20);
    const uniScore = rowSum("uniActs", 30);
    const socScore = rowSum("society", 10);
    const acrScore = rowSum("acr", 25);
    const b1iScore = rowSum("journals", 80);
    const b1iiScore = rowSum("popularWritings", 40);
    const b2Score = rowSum("books", 60);
    const b3Score = rowSum("ict", 30);
    const b4aScore = rowSum("research", 30);
    const b4bScore = rowSum("internalProjects", 15);
    const b4cScore = rowSum("externalProjects", 30);
    const b5Score = rowSum("awards", 10);
    const b6Score = rowSum("confs", 30);
    const b7aScore = rowSum("proposals", 10);
    const b7bScore = rowSum("products", 20);
    const b8Score = clampScore(rowSum("fdps", 20) + rowSum("training", 20), 20);
    const maxScores = getMediaEffectiveMaxScores(form);
    const partATotal = clampScore(lecScore + cfScore + innovScore + projScore + qualScore + fbScore + deptScore + uniScore + socScore + acrScore, maxScores.partA);
    const partBTotal = clampScore(b1iScore + b1iiScore + b2Score + b3Score + b4aScore + b4bScore + b4cScore + b5Score + b6Score + b7aScore + b7bScore + b8Score, maxScores.partB);
    const grandTotal = clampScore(partATotal + partBTotal, maxScores.grand);
    await generateMediaCommReport({
      title: "SoMCS Faculty Appraisal Report",
      subtitle: "School of Media & Communication Studies",
      form,
      docs,
      partASections: PART_A_SECTIONS,
      partBSections: PART_B_SECTIONS,
      totals: { partA: partATotal, partB: partBTotal, total: grandTotal },
      maxScores,
      generatedBy: sessionStorage.getItem("name") || roleLabel(role),
      declaration,
      reviewChain: reviews.map((rev) => ({
        label: roleLabel(rev.reviewer_role),
        name: rev.reviewer_name || "",
        date: rev.reviewed_at ? new Date(rev.reviewed_at).toLocaleDateString("en-IN") : "",
      })),
      detailedSummaryRows: [
        { isHeader: true, label: "Part A — Teaching Process & Academic Activities" },
        { id: "A(i)", label: "Lectures / Tutorials / Practicals", max: 50, score: lecScore },
        { id: "A(ii)", label: "Course File", max: 20, score: cfScore },
        { id: "A(iii)", label: "Innovative Teaching-Learning Methodologies", max: 10, score: innovScore },
        ...(applicability.projects !== "notApplicable" ? [{ id: "A(iv)", label: "Project Guidance", max: 10, score: projScore }] : []),
        { id: "A(v)", label: "Qualification Enhancement", max: 10, score: qualScore },
        { id: "A(vi)", label: "Students' Feedback", max: 10, score: fbScore },
        { id: "A(vii)", label: "Departmental / School Activities", max: 20, score: deptScore },
        { id: "A(viii)", label: "University Level Activities", max: 30, score: uniScore },
        { id: "A(ix)", label: "Contribution to Society", max: 10, score: socScore },
        { id: "A(x)", label: "Annual Confidential Report (ACR)", max: 25, score: acrScore },
        { isTotal: true, label: "Part A Total", max: maxScores.partA, score: partATotal },
        { isHeader: true, label: "Part B — Research & Academic Contributions" },
        { id: "B1(i)", label: "Published Papers in Journals", max: 80, score: b1iScore },
        { id: "B1(ii)", label: "Popular Writings, Film & Documentary", max: 40, score: b1iiScore },
        { id: "B2", label: "Articles / Chapters in Books", max: 60, score: b2Score },
        { id: "B3", label: "ICT Mediated Teaching-Learning Pedagogy / New Curricula", max: 30, score: b3Score },
        ...(applicability.research !== "notApplicable" ? [{ id: "B4(a)", label: "Research Guidance — PhD / PG", max: 30, score: b4aScore }] : []),
        { id: "B4(b)", label: "Internal Research Projects", max: 15, score: b4bScore },
        { id: "B4(c)", label: "External Research Projects", max: 30, score: b4cScore },
        { id: "B5", label: "Research Awards", max: 10, score: b5Score },
        { id: "B6", label: "Conferences / Seminars / Workshops", max: 30, score: b6Score },
        { id: "B7(a)", label: "Research Proposals", max: 10, score: b7aScore },
        { id: "B7(b)", label: "Products Developed / Used", max: 20, score: b7bScore },
        { id: "B8", label: "FDP / Self Development + Industrial Training", max: 20, score: b8Score },
        { isTotal: true, label: "Part B Total", max: maxScores.partB, score: partBTotal },
        { isGrandTotal: true, label: "Grand Total (Part A + Part B)", max: maxScores.grand, score: grandTotal },
      ],
    });
  };

  const pendingCount = queue.filter((item) => item.status === "Pending Review").length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "inherit" }}>
      <aside style={{ width: 230, height: "100vh", minHeight: "100vh", position: "sticky", top: 0, alignSelf: "flex-start", boxSizing: "border-box", overflow: "hidden", background: "#0f172a", color: "#f8fafc", padding: "18px 12px", display: "flex", flexDirection: "column", gap: 14, borderRight: "1px solid rgba(255,255,255,0.06)", boxShadow: "2px 0 16px rgba(15,23,42,0.14)" }}>
        <div style={{ borderBottom: "1px solid #1e293b", paddingBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>{APP_INFO.PORTAL_NAME}</div>
          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 3 }}>Media & Communication</div>
        </div>
        {canSelfSubmit && (
          <>
            <button onClick={() => { setActiveTab("my"); setReviewing(null); }} style={navButton(activeTab === "my")}>👤 My Appraisal</button>
            {activeTab === "my" && (
              <label style={{ display: "grid", gap: 6, padding: "0 10px 4px 16px", fontSize: 10, color: "#94a3b8", fontWeight: 800 }}>
                Appraisal Section
                <select
                  value={selfSectionView}
                  onChange={(event) => handleSelfSectionChange(event.target.value)}
                  style={{ height: 34, border: "1px solid #334155", borderRadius: 7, background: "#1e293b", color: "#f8fafc", padding: "0 9px", fontFamily: "inherit", fontSize: 11, fontWeight: 700 }}
                >
                  {SECTION_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={!isSelfSectionOpen(option.value)}>{option.label}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        {role !== "faculty" && <button onClick={() => { setActiveTab("approvals"); setReviewing(null); }} style={navButton(activeTab === "approvals")}>🎓 Approvals ({pendingCount})</button>}
        <button onClick={() => { setActiveTab("guidelines"); setReviewing(null); }} style={navButton(activeTab === "guidelines")}>📋 Guidelines</button>
        {activeTab === "guidelines" && (
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "9px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Guidelines Section</div>
            <select value={guidelinesTab} onChange={(e) => setGuidelinesTab(e.target.value)}
              style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "7px 8px", fontSize: 12, fontFamily: "inherit", color: "#e2e8f0", background: "#0f172a", outline: "none" }}>
              <option value="form">Form Guidelines</option>
              <option value="grading">Grading Scheme</option>
            </select>
          </div>
        )}
        <div style={{ marginTop: "auto", borderTop: "1px solid #1e293b", paddingTop: 12, display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate("/edit-profile")}
            title="Edit profile"
            style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
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
          <div style={{ margin: "8px 0", padding: "10px 12px", background: "rgba(37,99,235,0.15)", border: "1px solid #2563eb", borderRadius: 8 }}>
            <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>For any queries</div>
            <a href="mailto:appraisal@dypiu.ac.in" style={{ color: "#60a5fa", fontWeight: 600, fontSize: 11, wordBreak: "break-all", textDecoration: "none" }}>appraisal@dypiu.ac.in</a>
          </div>
          <button
            onClick={() => setShowLogoutModal(true)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "none", border: "1px solid #374151", borderRadius: 8, padding: "9px 11px", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={(event) => { event.currentTarget.style.background = "#1e293b"; }}
            onMouseLeave={(event) => { event.currentTarget.style.background = "none"; }}
          >
            <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12 }}>Logout</span>
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: "20px 24px", overflowX: "auto" }}>
        <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, color: "#0f172a", fontSize: 21 }}>School of Media & Communication Studies</h2>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{roleLabel(role)} workflow dashboard</div>
          </div>
          <AppraisalHeaderImage />
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
                {!locked && (
                  <SectionSaveFooter
                    label={selfSectionView === "partA" ? "Part A" : "Part B"}
                    saved={Boolean(sectionSaveStatus[selfSectionView])}
                    saving={savingSection === selfSectionView}
                    locked={locked}
                    onSave={() => handleSaveSelfSection(selfSectionView)}
                  />
                )}
              </>
            )}
            {selfSectionView === "summary" && (
              <div style={{ display: "grid", gap: 16 }}>
                <SummaryBox totals={totals} maxScores={totals.maxScores} roleScoreLabel="Faculty/self appraisal score from the Media & Communication form." />
                <div style={{ display: "grid", gap: 12, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                  {locked ? <StatusBadge status={declaration?.status || "Submitted"} /> : (
                    <>
                      <AccuracyCheckbox checked={confirmed} onChange={setConfirmed} />
                      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "#334155", lineHeight: 1.5, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={attachmentsConfirmed} onChange={(e) => setAttachmentsConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                        <span>I confirm that <strong>all required supporting documents and attachments have been uploaded</strong> against the respective entries. I understand that any <strong>missing or false attachment is my sole responsibility</strong> and may result in the rejection or revision of my appraisal.</span>
                      </label>
                    </>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button onClick={generateSelfReport} style={smallButton("#4c1d95")}>
                      Generate Report
                    </button>
                    <button onClick={handleSubmitAppraisal} disabled={submitting || locked || !confirmed || !attachmentsConfirmed} style={smallButton((locked || !confirmed || !attachmentsConfirmed) ? "#94a3b8" : "#059669")}>
                      {locked ? "Appraisal Locked" : submitting ? "Submitting..." : "Submit Appraisal"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "approvals" && !reviewing && role !== "faculty" && (
          <div>
            {/* ── Queue header & live stats ── */}
            {!loadingQueue && queue.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Faculty Approvals Queue</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Review and grade submitted appraisals</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ background: "#f1f5f9", color: "#475569", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Total: {queue.length}</span>
                  <span style={{ background: "#fef9c3", color: "#854d0e", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Pending: {queue.filter(i => i.status !== "Reviewed").length}</span>
                  <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Reviewed: {queue.filter(i => i.status === "Reviewed").length}</span>
                </div>
              </div>
            )}

            {/* ── Loading indicator ── */}
            {loadingQueue && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", color: "#64748b", fontSize: 13 }}>
                <div className="fa-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT }} />
                Loading SoMCS queue…
              </div>
            )}

            {/* ── Empty state ── */}
            {!loadingQueue && queue.length === 0 && (
              <div style={{ textAlign: "center", padding: "56px 24px", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>All caught up!</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>No SoMCS submissions are assigned to you at this time.</div>
              </div>
            )}

            {/* ── Faculty cards ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {queue.map((item) => {
                const initials = (item.name || "?").trim().split(/\s+/).map(w => w[0]).join("").substring(0, 2).toUpperCase();
                const isReviewed = item.status === "Reviewed";
                const maxScores = {
                  partA: n(item.effectivePartAMax) || PART_A_MAX,
                  partB: n(item.effectivePartBMax) || PART_B_MAX,
                  grand: n(item.effectiveGrandMax) || (n(item.effectivePartAMax) || PART_A_MAX) + (n(item.effectivePartBMax) || PART_B_MAX),
                };
                const itemTotals = {
                  partA: n(item.selfPartA ?? item.partATotal),
                  partB: n(item.selfPartB ?? item.partBTotal),
                  total: n(item.selfTotal ?? item.grandTotal),
                };
                const scoreLabel = `Submitted on ${item.submittedOn || "record"}`;
                return (
                  <div key={item.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", borderLeft: `4px solid ${isReviewed ? "#22c55e" : ACCENT}`, overflow: "hidden" }}>
                    {/* ── Name / role / action row ── */}
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13, flexShrink: 0, letterSpacing: 0.5 }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{titleCase(item.appraisalRole)} · {item.school}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                        <StatusBadge status={item.status} />
                        <button
                          disabled={reviewLoading === item.id}
                          onClick={() => openSubmittedReview(item)}
                          style={{ ...smallButton(isReviewed ? "#1e293b" : ACCENT2), padding: "6px 14px", fontSize: 11, cursor: reviewLoading === item.id ? "wait" : "pointer", opacity: reviewLoading === item.id ? 0.7 : 1 }}
                        >
                          {reviewLoading === item.id ? "Loading…" : isReviewed ? "View Review →" : "Review Form →"}
                        </button>
                      </div>
                    </div>
                    {/* ── Score metrics grid ── */}
                    <div style={{ padding: "12px 18px 14px", background: "#fafbff", borderTop: "1px solid #f1f5f9" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 20px", marginBottom: 8 }}>
                        {[["Part A", itemTotals.partA, maxScores.partA, ACCENT], ["Part B", itemTotals.partB, maxScores.partB, ACCENT2], ["Grand Total", itemTotals.total, maxScores.grand, "#059669"]].map(([label, value, max, color]) => (
                          <div key={label}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: "#475569" }}>{label}</span>
                              <span style={{ fontWeight: 700, color }}>{n(value).toFixed(1)}<span style={{ color: "#94a3b8", fontWeight: 500 }}>/{max}</span></span>
                            </div>
                            <div style={{ height: 5, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, max > 0 ? (n(value) / max) * 100 : 0)}%`, background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "right" }}>{scoreLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "approvals" && reviewing && (
          <MediaCommAuthorityReviewPanel
            person={reviewing}
            reviewerRole={role}
            onBack={() => setReviewing(null)}
            onSubmit={handleSubmitReview}
            readOnly={isReviewerReviewComplete(reviewing, role)}
          />
        )}

        {activeTab === "guidelines" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "inherit", width: "100%" }}>
              <div style={{ background: "#fff", borderRadius: 9, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 16 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>D Y PATIL INTERNATIONAL UNIVERSITY</h2>
                <div style={{ color: "#64748b", fontSize: 13 }}>Akurdi, Pune</div>
                <h3 style={{ margin: "12px 0 0", fontSize: 15, color: "#1e293b" }}>{guidelinesTab === "form" ? "Guidelines for Faculty Appraisal Form — A.Y. 2025-2026" : "Grading Scheme for Faculty Appraisal"}</h3>
              </div>
              {guidelinesTab === "form" && (<>
                <GuideSection title="General Notes" accent="#0f172a">
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 2, color: "#334155" }}>
                    <li>Claim of points to be made only in one place for each activity.</li>
                    <li>All information in Appraisal form is to be filled for A.Y. 2025-2026, 1st July 2025 to 30th June 2026.</li>
                    <li>For every claimed score, authentic documents are to be attached with Appraisal Form. Score claimed without authentic documents will not be considered.</li>
                    <li>Wherever possible, LMS JUNO record can be shown through login. No need to reprint hard copy of records available in JUNO. The data filled in JUNO must be examined and approved by competent authority.</li>
                    <li>All annexure and authentic documents must be attached in sequence as per appraisal form.</li>
                    <li>Not Applicable (NA) points marks will be deducted from denominator of concerned part total. However, this NA point must be approved by reporting authority.</li>
                    <li>For Research Papers, Book Chapters, Patent only first page with journal &amp; author details to be submitted.</li>
                  </ul>
                  <div style={{ marginTop: 12, fontWeight: 700, fontSize: 12, color: "#1e293b" }}>The 360 Degree Score shall be determined on the basis of following parameters:</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.9, color: "#334155" }}>
                    <li>a. Teaching Process (Maximum Point 25)</li>
                    <li>b. Students' Feedback (Maximum Point 10)</li>
                    <li>c. Department, School, University level Activities (Maximum Point 30)</li>
                    <li>d. ACR (Maximum Point 25)</li>
                    <li>e. Out-reach activity / Contribution to Society (Maximum Point 10)</li>
                  </ul>
                </GuideSection>
                <GuideSection title="PART A — Teaching & Academic Activities (Maximum Marks 200)" accent="#6366f1">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>SN</th>
                        <th style={thStyle}>Nature of Activity</th>
                        <th style={thStyle}>Max. Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdCenter}>(i)</td>
                        <td style={tdStyle}>
                          <strong>Lectures, seminars, tutorials, practical, contact classes</strong> — based on verifiable records (JUNO record).<br/>
                          No score should be assigned if a teacher has taken less than 70% of the assigned classes.<br/>
                          Score will be 50 if teacher has taken 100% assigned classes to particular subject as specified by University.<br/>
                          If a teacher has taken classes less than the allotted hours but above 80% limit of total, then 2 points will be deducted from 50 for each less hour of classes.<br/>
                          <em>Maximum score of 50 if there is 100% performance | 91–99: 95% of 50 | 81–89: 85% | 70–79: 75%</em><br/>
                          <em>Note: For School of Applied Arts and Crafts, School of Design — 40 Marks can be claimed.</em>
                        </td>
                        <td style={tdCenter}>50</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>(ii)</td>
                        <td style={tdStyle}>
                          <strong>Course file of subject</strong> — All points covered as per IQAC index, full marks. Proportionate marking to percentage completion applicable up to 60% completion.<br/>
                          <table style={{ marginTop: 6, borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr><th style={thStyle}>Sr No</th><th style={thStyle}>% Completion</th><th style={thStyle}>Score</th></tr></thead>
                            <tbody>
                              {[["1","100%","20"],["2","90%","18"],["3","80%","16"],["4","70%","14"],["5","60%","12"],["6","Less than 60%","0"]].map(([n,p,s])=>(
                                <tr key={n}><td style={tdCenter}>{n}</td><td style={tdCenter}>{p}</td><td style={tdCenter}>{s}</td></tr>
                              ))}
                            </tbody>
                          </table>
                          <em>Less than 60% — no score claimed.</em>
                        </td>
                        <td style={tdCenter}>20</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>(iii)</td>
                        <td style={tdStyle}>
                          <strong>Use of participatory and innovative teaching-learning methodologies</strong>; updating of subject content, course improvement etc. (Each activity carries 2 marks)<br/>
                          1. Blended learning &nbsp; 2. Virtual Lab &nbsp; 3. Conceptual videos &nbsp; 4. Use of LMS &nbsp; 5. Project Based Learning &nbsp; 6. Open Course Ware (OCW) assignment &nbsp; 7. Quiz &nbsp; 8. Group Discussion &nbsp; 9. Flip classroom &nbsp; 10. Any other innovative teaching learning methods
                        </td>
                        <td style={tdCenter}>10</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>(iv)</td>
                        <td style={tdStyle}>
                          <strong>Qualification Enhancement</strong><br/>
                          Higher qualification during assessment period: 5 marks<br/>
                          Add-on qualification / certification: 5 marks
                        </td>
                        <td style={tdCenter}>10</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>(v)</td>
                        <td style={tdStyle}>
                          <strong>Guided Students Project</strong> (New schools or if there is no project batch allotted can mention as NA)<br/>
                          Project guided: 3/group | Industrial collaboration/Sponsorship (Max 5 marks) | Project outcome: events/competitions (Max 5 marks)<br/>
                          <em>Note: For School of Applied Arts and Crafts, School of Design — 20 Marks can be claimed.</em><br/>
                          Guided students project other than curriculum: Project apart from curriculum: 5 | Industrial collaboration/Sponsorship: 5 | Any Award for project (Max 5 marks): 5
                        </td>
                        <td style={tdCenter}>10</td>
                      </tr>
                      <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                        <td style={tdCenter} colSpan={2}>Total Part A (i+ii+iii+iv+v)</td>
                        <td style={tdCenter}>100</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>B</td>
                        <td style={tdStyle}>
                          <strong>Students' Feedback (Maximum Point 10)</strong><br/>
                          Score will be linearly proportional to feedback. (Score = percentage / 10)<br/>
                          Average score of first and second feedback will be considered per semester at the scale of 10.<br/>
                          If faculty is handling more than one subject, then average score of all the subjects will be considered. (Average Percentage / 10)
                        </td>
                        <td style={tdCenter}>10</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>C &amp; D</td>
                        <td style={tdStyle}>
                          <strong>Department / School / University Activities (Max 20 / 30)</strong><br/>
                          <em>Department/School Level (Max 20):</em> Short-term one-time activity: 3 marks | Semester/Term-based (3–6 months): 5 marks | Academic Year activity (&gt;6 months): 10 marks<br/>
                          <em>University Level (Max 30):</em> Short-term one-time activity: 10 marks | Semester/Term-based: 20 marks | Academic Year activity: 30 marks
                        </td>
                        <td style={tdCenter}>20 / 30</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>E</td>
                        <td style={tdStyle}>
                          <strong>Contribution to Society through institute/University (Social Activities): 5 marks/activity</strong><br/>
                          Faculty involved in UGC/AICTE initiatives like Induction Program, Unnat Bharat Abhiyan, Yoga Classes, Blood Donation, Techno Social, NSS etc.
                        </td>
                        <td style={tdCenter}>10</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>F</td>
                        <td style={tdStyle}>
                          <strong>Industry Connect Activities (Max 5 Marks)</strong><br/>
                          1. Inviting company for campus placement: 5 marks/company (proof of invitation letter required, certified by TPO)<br/>
                          2. Providing internships to students: 2 marks/student<br/>
                          3. Signing MOU with industry: 5 marks per active MOU (training institutes not considered)<br/>
                          4. Industry visits: 2 marks per visit (documentary proof required)<br/>
                          5. Establishing centre of excellence with Industry: 5 marks
                        </td>
                        <td style={tdCenter}>5</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>G</td>
                        <td style={tdStyle}>
                          <strong>Annual Confidential Report (Maximum Point 25)</strong><br/>
                          1. Self-motivation (5): List activities/initiatives other than regular load/duties.<br/>
                          2. Punctuality (5): Number of late marks, punctuality in lecture/practical, timely completion of daily report, absentee without intimation.<br/>
                          3. Target based work (5): List tasks allotted, timely completion of allotted work — observed by HOD.<br/>
                          4. Effectiveness (5): Work done without errors &amp; least follow-up — observed by HOD.<br/>
                          5. Obedience (5): To be observed by HOD and Director.
                        </td>
                        <td style={tdCenter}>25</td>
                      </tr>
                    </tbody>
                  </table>
                </GuideSection>
                <GuideSection title="PART B — Research & Academic Contributions (Maximum Marks 375)" accent="#7c3aed">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>S.N.</th>
                        <th style={thStyle}>APIs</th>
                        <th style={thStyle}>Particular</th>
                        <th style={thStyle}>Max. Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdCenter}>1</td>
                        <td style={tdStyle}><strong>Research Papers (Published in Journals)</strong><br/><em>(With institute affiliation, Maxi. 4 papers can be claimed)</em></td>
                        <td style={tdStyle}>
                          Refereed Journals — SCI/SCIE/WoS Q1 &amp; Q2: 30/publication + Impact factor score<br/>
                          Refereed Journals — Scopus Q3, Q4: 15/publication + Impact factor score<br/>
                          UGC care listed: 10/publication<br/>
                          Submitted and under review: 5/publication | Submitted and rejected after 1–2 reviews: 10/publication (max 2 in this category)<br/>
                          <strong>Instructions:</strong> Multiple DYPIU authors: 70% first author, 30% each co-author. Additional marks for Impact Factor: up to 5 → 3 marks; 5–10 → 5 marks; above 10 → 10 marks. Joint/collaborative publication: full marks.
                        </td>
                        <td style={tdCenter}>80 / 120</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>2</td>
                        <td style={tdStyle}><strong>Publications</strong><br/><em>(other than Research papers, Maxi. 2 book chapters)</em></td>
                        <td style={tdStyle}>
                          Books by international publishers: 15/publication | National publishers: 10/publication | Local publisher with ISBN/ISSN: 5/publication<br/>
                          Chapter in Edited Book: 5/publication | Editor of Book (International): 10 | (National): 8 | (Local with ISBN/ISSN): 3<br/>
                          Translation works: Chapter/Research paper: 3 | Book: 8<br/>
                          <strong>Instructions:</strong> Multiple DYPIU authors: 70% first author, 30% each co-author. SoMCS/SoD/SAA: Max 60 marks; Other schools: Max 50.
                        </td>
                        <td style={tdCenter}>50 / 60</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>3</td>
                        <td style={tdStyle}><strong>Creation of ICT mediated Teaching Learning pedagogy and content</strong></td>
                        <td style={tdStyle}>
                          (a) Development of Innovative pedagogy which does not exist globally: 5<br/>
                          (b) MOOCs / Course Builder / Coursera Course: 5/course<br/>
                          (c) E-Content (available online publicly) — video lecture, blog, website etc.: 5<br/>
                          <em>Note: SoMCS max 30; SoD &amp; SAA max 50; Other schools max 20.</em>
                        </td>
                        <td style={tdCenter}>20 / 30 / 50</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>4</td>
                        <td style={tdStyle}><strong>Research Guidance (Maxi. marks 75)</strong></td>
                        <td style={tdStyle}>
                          (a) Research Guidance (Max 30, if applicable): PhD — 20 for degree awarded, 10 for thesis submitted; PG degree awarded to batch candidate. Joint supervision: 70% supervisor, 30% co-supervisor (7 marks each).<br/>
                          (b) Research Projects Completed (Maxi. 15): Internal Project — Grant received 100% marks.<br/>
                          (c) Research Projects Ongoing (Maxi. 30): &gt;10 lakhs → 15 marks; &lt;10 lakhs → 10 marks.<br/>
                          Consultancy/Testing/Training: up to ₹50k → 3; ₹51k–2L → 5; ₹2L–5L → 10; ₹5L–10L → 15; above ₹10L → 15+3/per 5L.<br/>
                          <em>Note: If no PG/PhD students enrolled, max marks deducted from denominator.</em>
                        </td>
                        <td style={tdCenter}>75</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>5</td>
                        <td style={tdStyle}><strong>Patents (a) + (b) (Maximum marks 50)</strong></td>
                        <td style={tdStyle}>
                          (a) Patent/Product development:<br/>
                          Grant (National): 30/patent | Grant (International): 15/patent | Published: 5/patent | Design Patent: 10/patent | Copyright/Trademark: 3/copyright | Product/Equipment developed/commercialized: 10/product<br/>
                          <em>Max 40 marks</em><br/>
                          (b) Awards/Fellowship/Research awards (Maxi. 10):<br/>
                          International fellowship: 10 | National/state fellowship: 7 | Research excellence awards (External/Internal: 7/5) | Best paper award (International/National): 5
                        </td>
                        <td style={tdCenter}>50</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>6</td>
                        <td style={tdStyle}><strong>Paper presentation in Seminars/Conferences/full paper in Conference Proceeding</strong></td>
                        <td style={tdStyle}>
                          Paper Publication in Scopus indexed conference: 10/paper<br/>
                          Invited lectures / Resource Person: 10/session<br/>
                          Conference attended: 5/conference<br/>
                          Attended FDP of one week duration or more (Maxi. 2): 5/FDP<br/>
                          Industrial training of minimum 3 days duration: 5 marks<br/>
                          <em>* Paper presented in Seminars/Conferences and also published as full paper in Conference Proceedings will be counted only once.</em>
                        </td>
                        <td style={tdCenter}>30</td>
                      </tr>
                      <tr>
                        <td style={tdCenter}>7</td>
                        <td style={tdStyle}><strong>Other research and development activities (Maxi. 20 marks)</strong></td>
                        <td style={tdStyle}>
                          (i) Research proposal submitted: &gt;20 Lacs → 10 marks; &lt;20 Lacs → 5 marks<br/>
                          (ii) Product development in Lab/commercialized (Maximum 10)<br/>
                          <em>Note: SAA &amp; SoD max 10; SoMCS max 30; Other schools max 20.</em>
                        </td>
                        <td style={tdCenter}>10 / 20 / 30</td>
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdCenter}>8</td>
                        <td style={tdStyle}><strong>Self Development (Max. marks 10)</strong></td>
                        <td style={tdStyle}>
                          (a) Attended FDP of one week duration or more (Max 10 marks): 5/FDP<br/>
                          (b) Industrial training (Maximum marks 5)<br/>
                          <em>Total B8 score maximum marks 10.</em>
                        </td>
                        <td style={tdCenter}>10</td>
                      </tr>
                    </tbody>
                  </table>
                </GuideSection>
                <GuideSection title="Maximum Marks Distribution by School" accent="#0ea5e9">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Sr. No</th>
                        <th style={thStyle}>Criteria</th>
                        <th style={thStyle}>SAA and SoD (Max Score)</th>
                        <th style={thStyle}>SoMCS (Max Score)</th>
                        <th style={thStyle}>SoEMR, SCoE, SCM, SoCSEA, SoBB (Max Score)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["","Part A — 360 Degree Feedback","","",""],
                        ["A","Teaching Process (i+ii+iii+iv+v)","100","100","100"],
                        ["B","Students' Feedback","10","10","10"],
                        ["C","Departmental Activities","20","20","20"],
                        ["D","University Activity","30","30","30"],
                        ["E","Contribution to Society","10","10","10"],
                        ["F","Industry Connect","5","5","5"],
                        ["G","Annual Confidential Report","25","25","25"],
                        ["","Marks obtained in Part A","200","200","200"],
                        ["","Part B — Research and Academic Contribution","","",""],
                        ["1","Research papers / journal publication","80","120","120"],
                        ["2","Books authored / edited / book chapter","60","60","50"],
                        ["3","ICT, Teaching learning Pedagogy","50","30","20"],
                        ["4","Research guide / PG guide / Consultancy","75","75","75"],
                        ["5","Patents, Awards, Fellowship","50","10","50"],
                        ["6","Conference attended / paper presented / session chair etc.","30","30","30"],
                        ["7","Research proposal in process","10","30","20"],
                        ["8","Self Development","20","20","10"],
                        ["","Total score","375","375","375"],
                      ].map(([sn, criteria, saa, mcs, other], i) => (
                        <tr key={i} style={criteria.startsWith("Part") ? { background: "#dbeafe", fontWeight: 700 } : criteria === "Marks obtained in Part A" || criteria === "Total score" ? { background: "#d1fae5", fontWeight: 700 } : i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                          <td style={tdCenter}>{sn}</td>
                          <td style={tdStyle}>{criteria}</td>
                          <td style={tdCenter}>{saa}</td>
                          <td style={tdCenter}>{mcs}</td>
                          <td style={tdCenter}>{other}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GuideSection>
              </>)}
              {guidelinesTab === "grading" && (
                <GuideSection title="Grading Scheme for Faculty Appraisal" accent="#059669">
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Appraisal</th>
                        <th style={thStyle}>Maximum Marks</th>
                        <th style={thStyle}>Assistant Prof.</th>
                        <th style={thStyle}>Associate Prof.</th>
                        <th style={thStyle}>Professor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[["Part A","200","180","180","180"],["Part B","375","150","190","220"]].map(([part,max,ap,asc,prof])=>(
                        <tr key={part}>
                          <td style={tdStyle}><strong>{part}</strong></td>
                          <td style={tdCenter}>{max}</td>
                          <td style={tdCenter}>{ap}</td>
                          <td style={tdCenter}>{asc}</td>
                          <td style={tdCenter}>{prof}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 10 }}>Grade &amp; Marks Distribution</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Sr No</th>
                        <th style={thStyle}>Grade</th>
                        <th style={thStyle}>Assistant Prof.</th>
                        <th style={thStyle}>Associate Prof.</th>
                        <th style={thStyle}>Professor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["1","A+","Above 350","Above 380","Above 400","#059669","#d1fae5"],
                        ["2","A","331 to 340","360 to 379","375 to 399","#0284c7","#dbeafe"],
                        ["3","B++","321 to 330","340 to 359","350 to 374","#7c3aed","#ede9fe"],
                        ["4","B+","311 to 320","320 to 339","325 to 349","#d97706","#fef3c7"],
                        ["5","B","300 to 310","300 to 319","300 to 324","#ea580c","#fff7ed"],
                        ["6","C","Below 300","Below 300","Below 300","#dc2626","#fee2e2"],
                      ].map(([sn,grade,ap,asc,prof,color,bg])=>(
                        <tr key={sn} style={{ background: bg }}>
                          <td style={tdCenter}>{sn}</td>
                          <td style={{ ...tdCenter, fontWeight: 800, color }}>{grade}</td>
                          <td style={tdCenter}>{ap}</td>
                          <td style={tdCenter}>{asc}</td>
                          <td style={tdCenter}>{prof}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </GuideSection>
              )}
            </div>
          </div>
        )}
      </main>
      {showLogoutModal && (
        <LogoutConfirmModal
          onCancel={() => setShowLogoutModal(false)}
          onConfirm={() => {
            setShowLogoutModal(false);
            sessionStorage.clear();
            navigate("/login", { replace: true });
          }}
        />
      )}
    </div>
  );
}

function LogoutConfirmModal({ onCancel, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "grid", placeItems: "center" }} onClick={onCancel}>
      <div style={{ width: "min(380px, 92vw)", background: "#fff", borderRadius: 12, padding: "26px 28px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", fontFamily: "inherit" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 17, marginBottom: 8 }}>Confirm Logout</div>
        <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6, marginBottom: 18 }}>You are about to leave {APP_INFO.PORTAL_NAME}. Any unsaved edits will be lost.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, border: "none", borderRadius: 8, background: "#f1f5f9", color: "#475569", padding: "10px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{ flex: 1, border: "none", borderRadius: 8, background: "#dc2626", color: "#fff", padding: "10px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Yes, Logout</button>
        </div>
      </div>
    </div>
  );
}

const thStyle = { border: "1px solid #334155", padding: "7px 8px", background: "#1e293b", color: "#e2e8f0", fontWeight: 800, textAlign: "center", fontSize: 10, whiteSpace: "nowrap", letterSpacing: "0.3px" };
const tdStyle = { border: "1px solid #e2e8f0", padding: "5px 7px", verticalAlign: "middle", minWidth: 120 };
const tdCenter = { ...tdStyle, textAlign: "center", minWidth: 70 };
const smallButton = (background) => ({ padding: "8px 14px", background, color: "#fff", border: "none", borderRadius: 7, cursor: background === "#94a3b8" ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" });
const navButton = (active) => ({ width: "100%", border: "none", borderLeft: `3px solid ${active ? ACCENT : "transparent"}`, background: active ? `${ACCENT}33` : "transparent", color: active ? "#fbbf24" : "#cbd5e1", borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left", fontWeight: 800, fontFamily: "inherit" });
