import { useState, useRef, useEffect } from "react";
import { HodInput } from "../components/Inputs";
import { useNavigate } from "react-router-dom";
import { ACR_DETAIL_POINTS, SOCIETY_LABELS, MAX_SCORES, APP_INFO, createAcrRows } from "../constants/formConfig";

import { fetchSavedAppraisal, loadAppraisalDocuments, loadSavedAppraisal, saveAppraisalDraftSection, submitAppraisal } from "../services/appraisalPersistence";
import { api } from "../services/api";
import { fetchReviewQueueForRole, submitWorkflowReview } from "../services/reviewWorkflow";
import { INNOVATIVE_METHODS, SCORE_LIMITS, clampScore, courseFileRowScore, effectiveMaxScore, feedbackAverage, feedbackRowScore, feedbackSectionScore, innovativeSelectionsFromDetails, innovativeTeachingScore, isAllowedAttachmentFile, isValidDDMMYYYY, maskDateDDMMYYYY, normalizeAutoScores, projectGuidanceRowMax, researchGuidanceRowMax, researchGuidanceScore, scoreRemaining, societyRowLocked, societyRowScore, societySelectionForRow, sumSectionScore, toggleInnovativeMethod, validateCompleteRows } from "../utils/appraisalFormUtils";
import { reviewedStatusFor, profileFromsessionStorage, workflowValidationError } from "../utils/hierarchy";
import { generateStandardReport } from "../utils/fullFormReport";
import { standardSubmittedScoreSummary } from "../utils/reviewSummaryTotals";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0;
const pct = (v, m) => Math.min(100, Math.round((v / m) * 100)) || 0;
const grade = (score, max) => {
  const p = (score / max) * 100;
  if (p >= 85) return { label: "Outstanding", color: "#059669", bg: "#d1fae5" };
  if (p >= 70) return { label: "Very Good", color: "#0284c7", bg: "#dbeafe" };
  if (p >= 55) return { label: "Good", color: "#7c3aed", bg: "#ede9fe" };
  if (p >= 40) return { label: "Satisfactory", color: "#d97706", bg: "#fef3c7" };
  return { label: "Needs Improvement", color: "#dc2626", bg: "#fee2e2" };
};

// ─── Sub-components (Shared & UI) ─────────────────────────────────────────────
function Avatar({ initials, color = "#0ea5e9", size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg,${color},${color}99)`, color: "#fff", fontWeight: 800, fontSize: size * 0.32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, letterSpacing: 0.5 }}>
      {initials}
    </div>
  );
}

function ScoreBar({ score, max, color = "#0ea5e9" }) {
  return (
    <div style={{ width: "100%", background: "#f1f5f9", borderRadius: 4, height: 5, overflow: "hidden" }}>
      <div style={{ width: `${pct(score, max)}%`, height: "100%", background: color, borderRadius: 4, transition: "width .5s" }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "Pending Review":    { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    "HOD Reviewed":      { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
    "Director Reviewed": { bg: "#d1fae5", color: "#065f46", dot: "#10b981" },
    "Dean Reviewed":     { bg: "#ede9fe", color: "#5b21b6", dot: "#7c3aed" },
    Rejected:            { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
    "Director Rejected": { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
  };
  const s = map[status] || map["Pending Review"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {status}
    </span>
  );
}

function SC({ title, subtitle, accent = "#0ea5e9", children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 9, boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 14, overflow: "hidden", border: "1px solid #e2e8f0", borderTop: `3px solid ${accent}` }}>
      <div style={{ padding: "10px 15px", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: accent }}>{title}</div>
        {subtitle && <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: "13px 15px" }}>{children}</div>
    </div>
  );
}

// ─── Input & Table Controls (Self-Appraisal Mode) ──────────────────────────────
function TI({ val, onChange, center, placeholder, readOnly = false, numeric = false, integer = false, textOnly = false, max }) {
  const [textErr, setTextErr] = useState(false);
  const handleChange = (e) => {
    if (readOnly) return;
    let v = e.target.value;
    if (integer) {
      v = v.replace(/[^0-9]/g, "");
    } else if (numeric) {
      v = v.replace(/[^0-9.]/g, "").replace(/^\./, "0.").replace(/(\.\d*)\./g, "$1");
      if (v !== "" && max !== undefined) v = String(clampScore(v, max));
    }
    if (textOnly && textErr) setTextErr(false);
    onChange?.(v);
  };
  const handleBlur = (e) => {
    if (readOnly || !onChange) return;
    const trimmed = e.target.value.trim();
    if (trimmed !== e.target.value) onChange(trimmed);
    if (textOnly && trimmed.length > 0 && /^[\d\s.,+\-/\\()[\]{}]+$/.test(trimmed)) {
      setTextErr(true);
    }
  };
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        value={val ?? ""} disabled={readOnly} onChange={handleChange} onBlur={handleBlur}
        placeholder={placeholder || ""}
        inputMode={integer ? "numeric" : numeric ? "decimal" : undefined}
        style={center
          ? { width: "100%", maxWidth: "100%", height: 30, boxSizing: "border-box", border: textErr ? "1.5px solid #ef4444" : "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, lineHeight: 1.25, fontFamily: "Georgia, serif", outline: "none", textAlign: "center" }
          : { width: "100%", maxWidth: "100%", height: 30, boxSizing: "border-box", border: textErr ? "1.5px solid #ef4444" : "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, lineHeight: 1.25, fontFamily: "Georgia, serif", outline: "none" }}
      />
      {textErr && (
        <span style={{ position: "absolute", left: 0, top: "100%", fontSize: 9, color: "#ef4444", whiteSpace: "nowrap", lineHeight: 1.2 }}>
          Text expected
        </span>
      )}
    </div>
  );
}

function DocCell({ id, docs, setDocs, readOnly = false }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const handleFiles = async (files) => {
    if (readOnly) return;
    const selectedFiles = Array.from(files || []).slice(0, 1);
    if (!selectedFiles.length) return;

    const unsupported = selectedFiles.find((file) => !isAllowedAttachmentFile(file));
    if (unsupported) {
      setUploadError("Only image or PDF files up to 10 MB are allowed.");
      if (ref.current) ref.current.value = "";
      return;
    }
    const oversized = selectedFiles.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      setUploadError("Only image or PDF files up to 10 MB are allowed.");
      if (ref.current) ref.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploadedFiles = [];
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", `faculty-appraisal/${id}`);
        uploadedFiles.push(await api.post("/upload", formData, { headers: { "Content-Type": "multipart/form-data" } }));
      }
      setDocs((p) => ({ ...p, [id]: uploadedFiles.slice(0, 1) }));
    } catch (err) {
      console.error("Upload error:", err);
      alert(`Unable to upload file.\n\n${err.message}`);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };
  const removeFile = (idx) => {
    setDocs((p) => {
      const updated = [...(p[id] || [])];
      updated.splice(idx, 1);
      return { ...p, [id]: updated };
    });
  };
  const files = docs[id] || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((f, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f0f9ff", border: "1px solid #0ea5e9", borderRadius: 4, padding: "2px 6px" }}>
          <span style={{ fontSize: 10, color: "#1e293b", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={f.name}>{f.name}</span>
          {!readOnly && <button onClick={() => removeFile(idx)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 10, cursor: "pointer" }}>✕</button>}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "4px 6px", border: "1px dashed #cbd5e1", borderRadius: 4, background: "#f8fafc" }} onClick={() => !readOnly && ref.current.click()}>
        <span style={{ fontSize: 10, color: "#64748b" }}>📎 Attach</span>
        <input ref={ref} type="file" accept="image/*,.pdf,application/pdf" style={{ display: "none" }} disabled={readOnly} onChange={(e) => handleFiles(e.target.files)} />
      </div>
    </div>
  );
}

function ViewCell({ id, docs }) {
  const files = docs[id] || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((f, idx) => (
        <a key={idx} href={f.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#3b82f6", fontSize: 10, textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }} title={f.name}>
          👁 {f.name.length > 12 ? f.name.slice(0, 12) + "…" : f.name}
        </a>
      ))}
    </div>
  );
}

function RowBtns({ onAdd, onDel, canDel = true }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={onAdd}>+ Add Row</button>
      {canDel && <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={onDel}>− Delete Last</button>}
    </div>
  );
}

// ─── Read-Only Controls (Reviewing Others) ────────────────────────────────────
function RO({ val, center }) {
  return <span style={{ fontSize: 11, fontFamily: "Georgia, serif", color: "#1e293b", display: "block", textAlign: center ? "center" : "left" }}>{val || <span style={{ color: "#cbd5e1" }}>—</span>}</span>;
}

function DirInput({ val, onChange, max, disabled = false }) {
  return (
    <input type="number" min="0" step="0.5" value={val ?? ""}
      max={max}
      disabled={disabled}
      onChange={e => onChange(e.target.value === "" || max === undefined ? e.target.value : String(clampScore(e.target.value, max)))}
      style={{ width: 58, textAlign: "center", border: "1.5px solid #0ea5e9", borderRadius: 5, padding: "3px 5px", fontSize: 11, fontFamily: "Georgia, serif", outline: "none", background: disabled ? "#f1f5f9" : "#f0fbff", cursor: disabled ? "not-allowed" : "text" }}
    />
  );
}

function SectionSaveFooter({ label, saved, saving, locked, onSave }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ color: saved ? "#047857" : "#64748b", fontSize: 12, fontWeight: 700 }}>
        {locked ? "Submitted and locked" : saved ? `${label} saved to server.` : `Save ${label} draft to server.`}
      </span>
      <button
        type="button"
        onClick={onSave}
        disabled={locked || saving}
        style={{ padding: "9px 22px", background: locked ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 7, cursor: locked || saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 12, fontFamily: "Georgia, serif", opacity: saving ? 0.75 : 1 }}
      >
        {saving ? "Saving..." : `Save ${label}`}
      </button>
    </div>
  );
}

function ViewDocsCell({ docKey, docs }) {
  const files = docs?.[docKey] || [];
  if (!files.length) return <span style={{ color: "#cbd5e1", fontSize: 10 }}>No docs</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {files.map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#0ea5e9", fontSize: 10, textDecoration: "none", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}
          title={f.name}>
          📄 {f.name.length > 16 ? f.name.slice(0, 16) + "…" : f.name}
        </a>
      ))}
    </div>
  );
}

// ─── Table style constants ────────────────────────────────────────────────────
const T = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const TH = { border: "1px solid #cbd5e1", padding: "7px 8px", background: "#0f172a", color: "#cbd5e1", fontWeight: 700, textAlign: "center", fontSize: 10 };
const TH_HOD = { ...TH, background: "#312e81", color: "#c7d2fe" };
const TH_DIR = { ...TH, background: "#065f46", color: "#6ee7b7" };
const TD = { border: "1px solid #e2e8f0", padding: "4px 6px", verticalAlign: "middle" };
const TDC = { ...TD, textAlign: "center" };
const TDS = { ...TD, textAlign: "center", background: "#f8fafc", minWidth: 52 };
const TDS_HOD = { ...TDS, background: "#f0f4ff" };
const TDS_DIR = { ...TDS, background: "#f0fdf4", minWidth: 62 };
const TDV = { ...TD, background: "#fafbff", minWidth: 110 };

const REVIEW_ARRAY_KEYS = ["lectures", "courseFile", "projects", "quals", "feedback", "deptActs", "uniActs", "society", "industry", "acr", "journals", "books", "ict", "research", "projects2", "externalProjects", "patents", "awards", "confs", "proposals", "products", "fdps", "training"];
const REVIEW_SCORE_FIELDS = ["hod", "director", "dean", "vc"];
const preserveSavedReviewScores = (form = {}, source = {}) => {
  const merged = { ...form };
  REVIEW_ARRAY_KEYS.forEach((key) => {
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
const buildDirectorSectionScores = (faculty, dirData) => {
  const payload = {};
  REVIEW_ARRAY_KEYS.forEach((key) => {
    const rows = Array.isArray(faculty[key]) ? faculty[key] : [];
    payload[key] = rows.map((row, index) => ({
      ...row,
      director: key === "society" && societyRowLocked(row)
        ? "0"
        : key === "acr"
        ? (String(dirData[key]?.[index]?.dir ?? row.director ?? "").trim() ? String(clampScore(dirData[key]?.[index]?.dir ?? row.director, SCORE_LIMITS.acrRow)) : "")
        : dirData[key]?.[index]?.dir ?? row.director ?? "",
    }));
  });
  payload.innovativeTeaching = {
    director: dirData.innovDir ?? faculty.innovDirector ?? "",
  };
  return payload;
};

// ─── Faculty Form in HOD Review Mode ─────────────────────────────────────────
function FacultyReviewForm({ faculty, hodData, setHodData, dirData, setDirData, sectionView = "partA" }) {
  const set = (section, idx, field, val) => {
    setHodData(prev => {
      const updated = { ...prev };
      if (!updated[section]) updated[section] = JSON.parse(JSON.stringify(faculty[section] || []));
      if (idx === null) {
        updated[section] = Array.isArray(updated[section])
          ? (updated[section].length ? updated[section].map((r, i) => i === 0 ? { ...r, [field]: val } : r) : [{ [field]: val }])
          : { ...updated[section], [field]: val };
      }
      else { updated[section] = updated[section].map((r, i) => i === idx ? { ...r, [field]: val } : r); }
      return updated;
    });
  };
  const setScalar = (key, val) => setHodData(prev => ({ ...prev, [key]: val }));

  const setDir = (section, idx, field, val) => {
    setDirData(prev => {
      const updated = { ...prev };
      if (!updated[section]) updated[section] = JSON.parse(JSON.stringify(faculty[section] || []));
      if (idx === null) {
        updated[section] = Array.isArray(updated[section])
          ? (updated[section].length ? updated[section].map((r, i) => i === 0 ? { ...r, [field]: val } : r) : [{ [field]: val }])
          : { ...updated[section], [field]: val };
      }
      else { updated[section] = updated[section].map((r, i) => i === idx ? { ...r, [field]: val } : r); }
      return updated;
    });
  };
  const setDirScalar = (key, val) => setDirData(prev => ({ ...prev, [key]: val }));

  const get = (section, idx, field) => {
    if (hodData[section]) {
      const s = hodData[section];
      return idx === null
        ? (Array.isArray(s) ? (s[0]?.[field] ?? "") : (s[field] ?? ""))
        : (s[idx]?.[field] ?? faculty[section]?.[idx]?.[field] ?? "");
    }
    if (idx === null) {
      const source = faculty[section];
      return Array.isArray(source) ? (source[0]?.[field] ?? "") : (source?.[field] ?? "");
    }
    return faculty[section]?.[idx]?.[field] ?? "";
  };
  const getS = (key) => hodData[key] ?? faculty[key] ?? "";

  const getDir = (section, idx, field) => {
    if (dirData[section]) {
      const s = dirData[section];
      return idx === null ? (Array.isArray(s) ? (s[0]?.[field] ?? "") : (s[field] ?? "")) : (s[idx]?.[field] ?? "");
    }
    if (idx === null) {
      const source = faculty[section];
      return Array.isArray(source) ? (source[0]?.director ?? "") : (source?.director ?? "");
    }
    return faculty[section]?.[idx]?.director ?? "";
  };
  const getDirS = (key) => dirData[key] ?? faculty.innovDirector ?? faculty.innovDir ?? "";

  const { info, lectures, courseFile, projects, quals, feedback, deptActs, uniActs, society, industry, acr, journals, books, ict, research, projects2, externalProjects, patents, awards, confs, proposals, products, fdps, training, docs } = faculty;
  const rows = (arr) => arr && arr.length > 0 ? arr : [{}];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* HOD Review Banner */}
      <div style={{ background: "linear-gradient(90deg,#065f46,#059669)", color: "#d1fae5", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <div>
          <strong>Director Review Mode</strong> — Faculty self-scores are read-only. Only <span style={{ color: "#6ee7b7", fontWeight: 700 }}>Director Score</span> columns are editable. Click <span style={{ color: "#6ee7b7" }}>📄 View Doc</span> links to open uploaded files.
        </div>
      </div>

      {/* Faculty Info */}
      <SC title="Faculty Information" accent="#6366f1">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[["Name", info.name], ["Qualification", info.qual], ["Designation", info.desig], ["Academic Year", info.ay]].map(([label, val]) => (
              <tr key={label}>
                <td style={{ padding: "6px 10px", background: "#f8fafc", fontWeight: 600, border: "1px solid #e2e8f0", width: "35%" }}>{label}</td>
                <td style={{ padding: "5px 10px", border: "1px solid #e2e8f0", color: "#334155" }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {sectionView === "partA" && (<>
      {/* ── PART A ── */}
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#dbeafe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>PART A — Teaching & Academic Activities</div>

      {/* A1: Lectures */}
      <SC title="A1. Lectures / Tutorials / Practicals (Max 50)" accent="#6366f1">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Semester</th><th style={TH}>Course Code / Name</th>
              <th style={TH}>Classes (as per course structure)</th><th style={TH}>Classes Actually Conducted</th>
              <th style={TH}>View Docs</th>
              <th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(lectures).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.sem} /></td>
                  <td style={TD}><RO val={r.code} /></td>
                  <td style={TDC}><RO val={r.planned} center /></td>
                  <td style={TDC}><RO val={r.conducted} center /></td>
                  <td style={TDV}><ViewDocsCell docKey={`lec-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("lectures", i, "dir")} onChange={v => setDir("lectures", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* A2: Course File */}
      <SC title="A2. Course File (Max 20)" accent="#6366f1">
        <table style={T}>
          <thead><tr>
            <th style={{ ...TH, width: 30 }}>SN</th>
            <th style={TH}>Course</th><th style={TH}>Program & Semester</th><th style={TH}>Availability as per IQAC format</th>
            <th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(courseFile).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.course} /></td>
                <td style={TD}><RO val={r.title} /></td>
                <td style={TDC}><RO val={r.details} center /></td>
                <td style={TDS}><RO val={courseFileRowScore(r) ? String(courseFileRowScore(r)) : ""} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("courseFile", i, "dir")} onChange={v => setDir("courseFile", i, "dir", v)} max={SCORE_LIMITS.courseFileRow} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* A3: Innovative Teaching */}
      <SC title="A3. Innovative Teaching-Learning (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>Method</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={TD}>Innovative / participatory teaching methods used</td>
              <td style={TDS}><RO val={faculty.innovScore} center /></td>
              <td style={TDS_DIR}><DirInput val={getDirS("innovDir")} onChange={v => setDirScalar("innovDir", v)} /></td>
            </tr>
          </tbody>
        </table>
      </SC>

      {/* A4: Projects */}
      {faculty.sectionApplicability?.projects !== "notApplicable" && <SC title="A4. Projects (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Project Type</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(projects).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDV}><ViewDocsCell docKey={`proj-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={clampScore(r.score, projectGuidanceRowMax(r))} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("projects", i, "dir")} max={projectGuidanceRowMax(r)} onChange={v => setDir("projects", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>}

      {/* A5: Qualification */}
      <SC title="A5. Qualification Enhancement (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Description</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(quals).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDV}><ViewDocsCell docKey={`qual-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("quals", i, "dir")} onChange={v => setDir("quals", i, "dir", v)} max={SCORE_LIMITS.qualificationRow} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B: Student Feedback */}
      <SC title="B. Student Feedback (Max 10)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Course</th><th style={TH}>First Feedback</th>
            <th style={TH}>Second Feedback</th><th style={TH}>Average</th>
            <th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(feedback).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.code} /></td>
                <td style={TDC}><RO val={r.fb1} center /></td>
                <td style={TDC}><RO val={r.fb2} center /></td>
                <td style={{ ...TDC, fontWeight: 700, color: "#6366f1" }}>
                  {r.fb1 && r.fb2 ? ((n(r.fb1) + n(r.fb2)) / 2).toFixed(2) : "—"}
                </td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("feedback", i, "dir")} onChange={v => setDir("feedback", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* C: Dept Activities */}
      <SC title="C. Departmental Activities (Max 20)" accent="#f59e0b">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Activity</th><th style={TH}>Nature</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(deptActs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.activity} /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`dept-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("deptActs", i, "dir")} onChange={v => setDir("deptActs", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* D: University Activities */}
      <SC title="D. University Activities (Max 30)" accent="#f59e0b">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Activity</th><th style={TH}>Nature</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(uniActs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.activity} /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`uni-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("uniActs", i, "dir")} onChange={v => setDir("uniActs", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* E: Society */}
      <SC title="E. Contribution to Society (Max 10, Max 5 per row)" accent="#10b981">
        <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 12, fontWeight: 800, color: "#334155" }}>
          {["applicable", "notApplicable"].map((v) => (
            <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={(faculty.sectionApplicability?.society || "applicable") === v} readOnly disabled />
              {v === "applicable" ? "Applicable" : "Not Applicable"}
            </label>
          ))}
        </div>
        {faculty.sectionApplicability?.society !== "notApplicable" && <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Activity</th><th style={TH}>Yes/No</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score (Max 5)</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(society).map((r, i) => (
              <tr key={i} style={societyRowLocked(r) ? { background: "#f1f5f9", opacity: 0.65 } : i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDC}><RO val={societySelectionForRow(r) || "No"} center /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`soc-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={societyRowScore(r)} center /></td>
                <td style={TDS_DIR}><DirInput val={societyRowLocked(r) ? "0" : getDir("society", i, "dir")} max={SCORE_LIMITS.societyRow} disabled={societyRowLocked(r)} onChange={v => setDir("society", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>}
      </SC>

      {/* F: Industry */}
      <SC title="F. Industry Connect (Max 5)" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Industry Name</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(industry).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.name} /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`ind-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("industry", i, "dir")} onChange={v => setDir("industry", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* G: ACR */}
      <SC title="G. Annual Confidential Report (Max 25)" accent="#ef4444">
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>ACR is assessed in the Director review column - faculty does not fill scores.</div>
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Parameter</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(acr).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDS_DIR}><DirInput val={String(getDir("acr", i, "dir") ?? "").trim() ? clampScore(getDir("acr", i, "dir"), SCORE_LIMITS.acrRow) : ""} max={SCORE_LIMITS.acrRow} onChange={v => setDir("acr", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      </>)}
      {sectionView === "partB" && (<>
      {/* ── PART B ── */}
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#ede9fe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>PART B — Research & Academic Contributions</div>

      {/* B1: Journals */}
      <SC title="B1. Research Papers / Journal Publications (Max 120)" accent="#7c3aed">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Journal</th>
              <th style={TH}>ISSN</th><th style={TH}>General Indexing</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(journals).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.journal} /></td>
                  <td style={TDC}><RO val={r.issn} center /></td>
                  <td style={TDC}><RO val={r.index} center /></td>
                  <td style={TDV}><ViewDocsCell docKey={`jour-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("journals", i, "dir")} onChange={v => setDir("journals", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* B2: Books */}
      <SC title="B2. Books / Book Chapters (Max 50)" accent="#7c3aed">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title with Page Nos.</th><th style={TH}>Book Title, Editor & Publisher</th>
              <th style={TH}>ISSN / ISBN No.</th><th style={TH}>Type of Publisher</th><th style={TH}>Co-authors (from DYPIU)</th><th style={TH}>First Author</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(books).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.book} /></td>
                  <td style={TDC}><RO val={r.issn} center /></td>
                  <td style={TD}><RO val={r.pub} /></td>
                  <td style={TD}><RO val={r.coauth} /></td>
                  <td style={TDC}><RO val={r.first} center /></td>
                  <td style={TDV}><ViewDocsCell docKey={`book-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("books", i, "dir")} onChange={v => setDir("books", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* B3: ICT */}
      <SC title="B3. ICT / E-Content / Pedagogy (Max 20)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Type</th><th style={TH}>Quadrants</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(ict).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.title} /></td>
                <td style={TD}><RO val={r.type} /></td>
                <td style={TDC}><RO val={r.quad} center /></td>
                <td style={TDV}><ViewDocsCell docKey={`ict-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("ict", i, "dir")} onChange={v => setDir("ict", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B4: Research Guidance */}
      {faculty.sectionApplicability?.research !== "notApplicable" && <SC title="B4(a). Research Guidance — PhD / PG (Max 30)" accent="#059669">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Degree</th><th style={TH}>Student Name</th><th style={TH}>Status</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(research).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TDC}><RO val={r.degree} center /></td>
                <td style={TD}><RO val={r.name} /></td>
                <td style={TD}><RO val={r.thesis} /></td>
                <td style={TDV}><ViewDocsCell docKey={`res-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={researchGuidanceScore(r).toFixed(1)} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("research", i, "dir")} onChange={v => setDir("research", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>}

      <SC title="B4(b). Research / Consultancy Internal Projects (Max 15)" accent="#059669">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Agency</th>
              <th style={TH}>Sanction Date</th><th style={TH}>Amount</th><th style={TH}>Role</th><th style={TH}>Status</th>
              <th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(faculty.projects2).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.agency} /></td>
                  <td style={TDC}><RO val={r.date} center /></td>
                  <td style={TDC}><RO val={r.amount} center /></td>
                  <td style={TD}><RO val={r.role} /></td>
                  <td style={TD}><RO val={r.status} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("projects2", i, "dir")} max={SCORE_LIMITS.researchInternalProjects} onChange={v => setDir("projects2", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      <SC title="B4(c). Research / Consultancy External Projects (Max 30)" accent="#059669">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Agency</th>
              <th style={TH}>Sanction Date</th><th style={TH}>Amount</th><th style={TH}>Role</th><th style={TH}>Status</th>
              <th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(faculty.externalProjects).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.agency} /></td>
                  <td style={TDC}><RO val={r.date} center /></td>
                  <td style={TDC}><RO val={r.amount} center /></td>
                  <td style={TD}><RO val={r.role} /></td>
                  <td style={TD}><RO val={r.status} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("externalProjects", i, "dir")} max={SCORE_LIMITS.researchExternalProjects} onChange={v => setDir("externalProjects", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* B5: Patents */}
      <SC title="B5(a). Patents (IPR) (Max 40)" accent="#f97316">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>National / International</th>
              <th style={TH}>Filed</th><th style={TH}>Status</th><th style={TH}>File No.</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(patents).map((r, i) => (
                <tr key={i}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TDC}><RO val={r.type} center /></td>
                  <td style={TDC}><RO val={r.date} center /></td>
                  <td style={TDC}><RO val={r.status} center /></td>
                  <td style={TDC}><RO val={r.fileNo} center /></td>
                  <td style={TDV}><ViewDocsCell docKey={`pat-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("patents", i, "dir")} onChange={v => setDir("patents", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* B5b: Awards */}
      <SC title="B5(b). Awards (Max 10)" accent="#f97316">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Award Title</th><th style={TH}>Date</th>
            <th style={TH}>Agency</th><th style={TH}>Level</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(awards).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.title} /></td>
                <td style={TDC}><RO val={r.date} center /></td>
                <td style={TD}><RO val={r.agency} /></td>
                <td style={TD}><RO val={r.level} /></td>
                <td style={TDV}><ViewDocsCell docKey={`awd-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("awards", i, "dir")} onChange={v => setDir("awards", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B6: Conferences */}
      <SC title="B6. Invited Lectures / Resource Person / Paper Presentations (Max 30)" accent="#6366f1">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title / Session</th><th style={TH}>Type</th>
            <th style={TH}>Organizer</th><th style={TH}>Level</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(confs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.title} /></td>
                <td style={TD}><RO val={r.type} /></td>
                <td style={TD}><RO val={r.org} /></td>
                <td style={TD}><RO val={r.level} /></td>
                <td style={TDV}><ViewDocsCell docKey={`conf-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("confs", i, "dir")} onChange={v => setDir("confs", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B7: Proposals */}
      <SC title="B7(a). Submitted Research Proposals (Max 10)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Duration</th>
            <th style={TH}>Funding Agency</th><th style={TH}>Amount</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(proposals).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.title} /></td>
                <td style={TDC}><RO val={r.duration} center /></td>
                <td style={TD}><RO val={r.agency} /></td>
                <td style={TDC}><RO val={r.amount} center /></td>
                <td style={TDV}><ViewDocsCell docKey={`prop-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("proposals", i, "dir")} onChange={v => setDir("proposals", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <SC title="B7(b). Product Developed and Used by Students in Lab / Commercialized (Max 10)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Details of Product</th><th style={TH}>Used by Students in Lab / Commercialized</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(products).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TD}><RO val={r.usage} /></td>
                <td style={TDV}><ViewDocsCell docKey={`prod-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("products", i, "dir")} onChange={v => setDir("products", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B8: Self Dev */}
      <SC title="B8(a). FDP / Workshops Attended (Max 10)" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Program</th><th style={TH}>Duration</th><th style={TH}>Organizer</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(fdps).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.program} /></td>
                <td style={TDC}><RO val={r.duration} center /></td>
                <td style={TD}><RO val={r.org} /></td>
                <td style={TDV}><ViewDocsCell docKey={`fdp-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={clampScore(r.score, SCORE_LIMITS.fdpRow)} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("fdps", i, "dir")} max={SCORE_LIMITS.fdpRow} onChange={v => setDir("fdps", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <SC title="B8(b). Industrial Training" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Company</th><th style={TH}>Duration</th><th style={TH}>Nature</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(training).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.company} /></td>
                <td style={TDC}><RO val={r.duration} center /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`train-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={clampScore(r.score, SCORE_LIMITS.fdpRow)} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("training", i, "dir")} max={SCORE_LIMITS.fdpRow} onChange={v => setDir("training", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>
      </>)}
    </div>
  );
}

// ─── Full Review Panel (opened when HOD clicks Review) ────────────────────────
function ReviewPanel({ faculty, onBack, onSubmit, readOnly = false }) {
  const [hodData, setHodData] = useState({});
  const [dirData, setDirData] = useState({});
  const [hodRemarks] = useState(faculty.hodRemarks || "");
  const [dirRemarks, setDirRemarks] = useState(faculty.directorRemarks || "");
  const [sectionView, setSectionView] = useState("partA");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const reviewLocked = readOnly || faculty.status === "Reviewed" || /Director\s*(Reviewed|Rejected)/i.test(faculty.status || "") || n(faculty.directorTotal) > 0 || String(faculty.directorRemarks || "").trim() !== "";

  // Compute HOD total from hodData
  const calcHodScore = () => {
    const get = (section, idx, field) => {
      if (hodData[section]) {
        const s = hodData[section];
        return idx === null ? n(Array.isArray(s) ? s[0]?.[field] : s[field]) : n(s[idx]?.[field]);
      }
      const source = faculty[section];
      return idx === null ? n(Array.isArray(source) ? source[0]?.[field] : source?.[field]) : n(source?.[idx]?.[field]);
    };
    const getS = (key) => n(hodData[key] ?? faculty[key]);
    const sumReviewRows = (section, field, max, rowMax) => clampScore(
      (faculty[section] || []).reduce((total, row, index) => {
        if (section === "society" && societyRowLocked(row)) return total;
        const limit = typeof rowMax === "function" ? rowMax(row) : rowMax;
        return total + (limit ? clampScore(get(section, index, field), limit) : get(section, index, field));
      }, 0),
      max,
    );
    const avgReviewRows = (section, field, max, rowMax) => {
      const rows = faculty[section] || [];
      const filled = rows.filter((r) => r?.course || r?.title || r?.details);
      if (!filled.length) return 0;
      const sum = rows.reduce((total, row, index) => {
        const limit = typeof rowMax === "function" ? rowMax(row) : rowMax;
        return total + (limit ? clampScore(get(section, index, field), limit) : get(section, index, field));
      }, 0);
      return clampScore(sum / filled.length, max);
    };

    const lec = avgReviewRows("lectures", "hod", 50);
    const cf = avgReviewRows("courseFile", "hod", 20, SCORE_LIMITS.courseFileRow);
    const innov = clampScore(getS("innovHod"), 10);
    const proj = faculty.sectionApplicability?.projects === "notApplicable" ? 0 : sumReviewRows("projects", "hod", 10, projectGuidanceRowMax);
    const qual = sumReviewRows("quals", "hod", 10, SCORE_LIMITS.qualificationRow);
    const fb = sumReviewRows("feedback", "hod", 10, 10);
    const dept = sumReviewRows("deptActs", "hod", 20);
    const uni = sumReviewRows("uniActs", "hod", 30);
    const soc = sumReviewRows("society", "hod", 10, SCORE_LIMITS.societyRow);
    const ind = sumReviewRows("industry", "hod", 5);
    const acrT = sumReviewRows("acr", "hod", 25, SCORE_LIMITS.acrRow);
    const partA = clampScore(lec + cf + innov + proj + qual + fb + dept + uni + soc + ind + acrT, 200);

    const jour = sumReviewRows("journals", "hod", 120);
    const bk = sumReviewRows("books", "hod", 50);
    const ictT = sumReviewRows("ict", "hod", 20);
    const res = faculty.sectionApplicability?.research === "notApplicable" ? 0 : sumReviewRows("research", "hod", 30, researchGuidanceRowMax);
    const resProjects = sumReviewRows("projects2", "hod", SCORE_LIMITS.researchInternalProjects);
    const externalResProjects = sumReviewRows("externalProjects", "hod", SCORE_LIMITS.researchExternalProjects);
    const pat = sumReviewRows("patents", "hod", 40);
    const awd = sumReviewRows("awards", "hod", 10);
    const conf = sumReviewRows("confs", "hod", 30);
    const prop = sumReviewRows("proposals", "hod", 10);
    const prod = sumReviewRows("products", "hod", 10);
    const fdp = sumReviewRows("fdps", "hod", 5, SCORE_LIMITS.fdpRow);
    const train = sumReviewRows("training", "hod", 5, SCORE_LIMITS.fdpRow);
    const partB = clampScore(jour + bk + ictT + res + resProjects + externalResProjects + pat + awd + conf + prop + prod + fdp + train, 375);

    return { partA, partB, total: clampScore(partA + partB, 575) };
  };

  // Compute Director total from dirData
  const calcDirScore = () => {
    const getD = (section, idx, field) => {
      if (dirData[section]) {
        const s = dirData[section];
        return idx === null ? n(Array.isArray(s) ? s[0]?.[field] : s[field]) : n(s[idx]?.[field]);
      }
      const source = faculty[section];
      return idx === null ? n(Array.isArray(source) ? source[0]?.director : source?.director) : n(source?.[idx]?.director);
    };
    const getDirS = (key) => n(dirData[key] ?? faculty.innovDirector ?? faculty.innovDir);
    const sumReviewRows = (section, field, max, rowMax) => clampScore(
      (faculty[section] || []).reduce((total, row, index) => {
        if (section === "society" && societyRowLocked(row)) return total;
        const limit = typeof rowMax === "function" ? rowMax(row) : rowMax;
        return total + (limit ? clampScore(getD(section, index, field), limit) : getD(section, index, field));
      }, 0),
      max,
    );
    const avgReviewRows = (section, field, max, rowMax) => {
      const rows = faculty[section] || [];
      const filled = rows.filter((r) => r?.course || r?.title || r?.details);
      if (!filled.length) return 0;
      const sum = rows.reduce((total, row, index) => {
        const limit = typeof rowMax === "function" ? rowMax(row) : rowMax;
        return total + (limit ? clampScore(getD(section, index, field), limit) : getD(section, index, field));
      }, 0);
      return clampScore(sum / filled.length, max);
    };

    const lec = avgReviewRows("lectures", "dir", 50);
    const cf = avgReviewRows("courseFile", "dir", 20, SCORE_LIMITS.courseFileRow);
    const innov = clampScore(getDirS("innovDir"), 10);
    const proj = faculty.sectionApplicability?.projects === "notApplicable" ? 0 : sumReviewRows("projects", "dir", 10, projectGuidanceRowMax);
    const qual = sumReviewRows("quals", "dir", 10, SCORE_LIMITS.qualificationRow);
    const fb = sumReviewRows("feedback", "dir", 10, 10);
    const dept = sumReviewRows("deptActs", "dir", 20);
    const uni = sumReviewRows("uniActs", "dir", 30);
    const soc = sumReviewRows("society", "dir", 10, SCORE_LIMITS.societyRow);
    const ind = sumReviewRows("industry", "dir", 5);
    const acrT = sumReviewRows("acr", "dir", 25, SCORE_LIMITS.acrRow);
    const partA = clampScore(lec + cf + innov + proj + qual + fb + dept + uni + soc + ind + acrT, 200);

    const jour = sumReviewRows("journals", "dir", 120);
    const bk = sumReviewRows("books", "dir", 50);
    const ictT = sumReviewRows("ict", "dir", 20);
    const res = faculty.sectionApplicability?.research === "notApplicable" ? 0 : sumReviewRows("research", "dir", 30, researchGuidanceRowMax);
    const resProjects = sumReviewRows("projects2", "dir", SCORE_LIMITS.researchInternalProjects);
    const externalResProjects = sumReviewRows("externalProjects", "dir", SCORE_LIMITS.researchExternalProjects);
    const pat = sumReviewRows("patents", "dir", 40);
    const awd = sumReviewRows("awards", "dir", 10);
    const conf = sumReviewRows("confs", "dir", 30);
    const prop = sumReviewRows("proposals", "dir", 10);
    const prod = sumReviewRows("products", "dir", 10);
    const fdp = sumReviewRows("fdps", "dir", 5, SCORE_LIMITS.fdpRow);
    const train = sumReviewRows("training", "dir", 5, SCORE_LIMITS.fdpRow);
    const partB = clampScore(jour + bk + ictT + res + resProjects + externalResProjects + pat + awd + conf + prop + prod + fdp + train, 375);

    return { partA, partB, total: clampScore(partA + partB, 575) };
  };

  const { partA, partB, total } = calcHodScore();
  const calculatedDirScores = calcDirScore();
  const hasSavedDirectorScores = ["directorPartA", "directorPartB", "directorTotal"].some((key) => String(faculty?.[key] ?? "").trim() !== "");
  const displayedDirScores = reviewLocked && hasSavedDirectorScores ? {
    partA: String(faculty?.directorPartA ?? "").trim() !== "" ? n(faculty.directorPartA) : calculatedDirScores.partA,
    partB: String(faculty?.directorPartB ?? "").trim() !== "" ? n(faculty.directorPartB) : calculatedDirScores.partB,
    total: String(faculty?.directorTotal ?? "").trim() !== "" ? n(faculty.directorTotal) : calculatedDirScores.total,
  } : calculatedDirScores;
  const { partA: dirPartA, partB: dirPartB, total: dirTotal } = displayedDirScores;
  const g = grade(dirTotal, 575);
  const facultySummary = standardSubmittedScoreSummary(faculty, {
    partA: faculty.lectures?.reduce((a, r) => a + n(r.score), 0) || 0,
    partB: faculty.journals?.reduce((a, r) => a + n(r.score), 0) || 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: "100%" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, marginBottom: 16, borderRadius: 10 }}>
        <button onClick={onBack} style={{ background: "#1e293b", border: "none", color: "#94a3b8", cursor: "pointer", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "Georgia, serif" }}>← Back</button>
        <Avatar initials={faculty.avatar} color={faculty.avatarColor} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>{faculty.name}</div>
          <div style={{ color: "#64748b", fontSize: 11 }}>{faculty.designation} · {faculty.employeeId}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: "#86efac", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>Dir Part A</div>
            <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 16 }}>{dirPartA.toFixed(1)}</div>
          </div>
          <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: "#86efac", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>Dir Part B</div>
            <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 16 }}>{dirPartB.toFixed(1)}</div>
          </div>
          <div style={{ background: g.bg, border: `2px solid ${g.color}40`, borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: g.color, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>Dir Total</div>
            <div style={{ color: g.color, fontWeight: 800, fontSize: 16 }}>{dirTotal.toFixed(1)}<span style={{ fontSize: 10, color: "#94a3b8" }}>/575</span></div>
          </div>
        </div>
      </div>

      {/* Section switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["partA", "Part A"], ["partB", "Part B"], ["summary", "Summary"]].map(([id, label]) => (
          <button key={id} onClick={() => {
            setSectionView(id);
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            });
          }}
            style={{ padding: "7px 18px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700, background: sectionView === id ? "#312e81" : "#e2e8f0", color: sectionView === id ? "#e0e7ff" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {(sectionView === "partA" || sectionView === "partB") && (
        <fieldset disabled={reviewLocked} style={{ border: "none", padding: 0, margin: 0 }}>
          <FacultyReviewForm faculty={faculty} hodData={hodData} setHodData={setHodData} dirData={dirData} setDirData={setDirData} sectionView={sectionView} />
        </fieldset>
      )}

      {sectionView === "summary" && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "22px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: 15 }}>{reviewLocked ? "Director Submitted Review" : "Director Remarks & Final Submission"}</h3>

          {/* Score Summary */}
          <table style={{ ...T, marginBottom: 18 }}>
            <thead><tr>
              <th style={TH}>Section</th><th style={TH}>Max</th>
              <th style={TH}>Faculty Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {[
                ["Part A — Teaching & Activities", facultySummary.partAMax, facultySummary.partA, partA, dirPartA],
                ["Part B — Research & Contributions", facultySummary.partBMax, facultySummary.partB, partB, dirPartB],
              ].map(([label, max, fac, _hod, dir]) => (
                <tr key={label}>
                  <td style={TD}>{label}</td>
                  <td style={TDC}>{max}</td>
                  <td style={TDS}>{fac.toFixed(1)}</td>
                  <td style={{ ...TDS_DIR, fontWeight: 700, color: "#065f46" }}>{dir.toFixed(1)}</td>
                </tr>
              ))}
              <tr style={{ background: "#d1fae5", fontWeight: 700 }}>
                <td style={TD}>Grand Total</td>
                <td style={TDC}>{facultySummary.grandMax}</td>
                <td style={TDS}>{facultySummary.total.toFixed(1)}</td>
                <td style={{ ...TDS_DIR, color: "#065f46", fontSize: 14 }}>{dirTotal.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
{/* Director Remarks — editable */}
          <label style={{ fontWeight: 700, fontSize: 13, color: "#065f46", display: "block", marginBottom: 6 }}>Director Remarks</label>
          <textarea value={dirRemarks} onChange={e => setDirRemarks(e.target.value)} rows={4} readOnly={reviewLocked}
            placeholder="Enter your director remarks, observations, and recommendations..."
            style={{ width: "100%", border: "1.5px solid #86efac", borderRadius: 7, padding: "10px 12px", fontSize: 12, fontFamily: "Georgia, serif", resize: "vertical", boxSizing: "border-box", marginBottom: 16, background: reviewLocked ? "#f8fafc" : "#f0fdf4", outline: "none" }} />

          {!reviewLocked && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14, color: "#334155", fontSize: 12, lineHeight: 1.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={reviewConfirmed}
                onChange={(e) => setReviewConfirmed(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>I have verified all the details and confirm that the information provided is correct. I am responsible for the accuracy of this data.</span>
            </label>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onBack} style={{ padding: "9px 22px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "Georgia, serif" }}>{reviewLocked ? "Close" : "Cancel"}</button>
            {!reviewLocked && (
            <button onClick={() => onSubmit(faculty.id, { partA: dirPartA, partB: dirPartB, total: dirTotal }, dirRemarks, buildDirectorSectionScores(faculty, dirData), reviewConfirmed)}
              disabled={!reviewConfirmed}
              style={{ padding: "10px 28px", background: reviewConfirmed ? "#059669" : "#64748b", color: "#fff", border: "none", borderRadius: 7, cursor: reviewConfirmed ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>
              ✔ Submit Director Review
            </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Director Dashboard ───────────────────────────────────────────────────────
export default function DirectorDashboard() {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState("myAppraisal");
  const [hodAppraisalTab, setHodAppraisalTab] = useState("partA");
  const [guidelinesTab, setGuidelinesTab] = useState("form");
  const [reviewingFaculty, setReviewingFaculty] = useState(null);
  const [reviewingHod, setReviewingHod] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(null);

  const dirSchool = sessionStorage.getItem("school");
  const hasHOD = sessionStorage.getItem("hasHod") === "true";

  const [facultyList, setFacultyList] = useState([]);
  const [hodList, setHodList] = useState([]);

  useEffect(() => {
    const loadReviewQueue = async () => {
      try {
        const items = await fetchReviewQueueForRole({
          reviewerRole: "director",
          reviewerProfile: { ...profileFromsessionStorage(), school: dirSchool },
          schoolValues: [dirSchool],
        });
        setFacultyList(items.filter((item) => item.appraisalRole === "faculty"));
        setHodList(items.filter((item) => item.appraisalRole === "hod"));
      } catch (err) {
        console.error("Could not load Director review queue:", err);
        setFacultyList([]);
        setHodList([]);
      }
    };

    loadReviewQueue();
  }, [dirSchool]);

  const [filterStatus, setFilterStatus] = useState("All");
  const [showLogoutModal, setShowLogoutModal] = useState(false);


  // ── HOD's own appraisal form state ──
  const [info, setInfo] = useState({
    name: sessionStorage.getItem("name") || "",
    qual: "",
    desig: sessionStorage.getItem("role") === "director" ? "Director" : "",
    school: sessionStorage.getItem("school") || sessionStorage.getItem("department") || "",
    expDyp: "",
    expPrev: "",
    expTotal: "",
    ay: "2025-2026"
  });
  const inf = (k) => (v) => setInfo((p) => ({ ...p, [k]: v }));

  const [lectures, setLectures] = useState([
    { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" },
  ]);
  const setLec = (i, k, v) => setLectures((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [courseFile, setCourseFile] = useState([{ course: "", title: "", details: "", score: "", hod: "", director: "" }]);
  const setCF = (i, k, v) => setCourseFile((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const [innovScore, setInnovScore] = useState("");
  const [innovDetails, setInnovDetails] = useState("");
  const [innovRows, setInnovRows] = useState([{ method: "", details: "", score: "" }]);
  const setInnov = (i, k, v) => setInnovRows((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const [projects, setProjects] = useState([
    { label: "", score: "", hod: "", director: "" },
  ]);
  const setProj = (i, k, v) => setProjects((p) => p.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, [k]: k === "score" ? String(clampScore(v, projectGuidanceRowMax(r)) || "") : v };
    return k === "label" ? { ...next, score: String(clampScore(next.score, projectGuidanceRowMax(next)) || "") } : next;
  }));

  const [quals, setQuals] = useState([
    { label: "", score: "", hod: "", director: "" },
  ]);
  const setQual = (i, k, v) => setQuals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [feedback, setFeedback] = useState([
    { code: "", fb1: "", fb2: "", score: "", hod: "", director: "" },
  ]);
  const setFb = (i, k, v) => setFeedback((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [deptActs, setDeptActs] = useState([
    { activity: "", nature: "", score: "", hod: "", director: "" },
  ]);
  const setDept = (i, k, v) => setDeptActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [uniActs, setUniActs] = useState([
    { activity: "", nature: "", score: "", hod: "", director: "" },
  ]);
  const setUni = (i, k, v) => setUniActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [society, setSociety] = useState([
    { label: "", details: "", score: "", hod: "", director: "" },
  ]);
  const setSoc = (i, k, v) => setSociety((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [industry, setIndustry] = useState([
    { name: "", details: "", score: "", hod: "", director: "" },
  ]);
  const setInd = (i, k, v) => setIndustry((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [acr, setAcr] = useState(createAcrRows);
  const setAcrRow = (i, k, v) => setAcr((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [journals, setJournals] = useState([
    { title: "", journal: "", issn: "", index: "", score: "", hod: "", director: "" },
  ]);
  const setJour = (i, k, v) => setJournals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [books, setBooks] = useState([
    { title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "", hod: "", director: "" },
  ]);
  const setBook = (i, k, v) => setBooks((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [ict, setIct] = useState([
    { title: "", desc: "", type: "", quad: "", score: "", hod: "", director: "" },
  ]);
  const setIctRow = (i, k, v) => setIct((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [research, setResearch] = useState([
    { degree: "", name: "", thesis: "", score: "", hod: "", director: "" },
  ]);
  const setRes = (i, k, v) => setResearch((p) => p.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, [k]: v };
    return ["degree", "name", "thesis"].includes(k)
      ? { ...next, score: next.name || next.thesis ? String(researchGuidanceScore(next)) : "" }
      : next;
  }));

  const [projects2, setProjects2] = useState([
    { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" },
  ]);
  const setPrj2 = (i, k, v) => setProjects2((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [externalProjects, setExternalProjects] = useState([
    { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" },
  ]);
  const setExtPrj = (i, k, v) => setExternalProjects((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [patents, setPatents] = useState([
    { title: "", type: "", date: "", status: "", fileNo: "", score: "", hod: "", director: "" },
  ]);
  const setPat = (i, k, v) => setPatents((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [awards, setAwards] = useState([
    { title: "", date: "", agency: "", level: "", score: "", hod: "", director: "" },
  ]);
  const setAwd = (i, k, v) => setAwards((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [confs, setConfs] = useState([
    { title: "", type: "", org: "", level: "", score: "", hod: "", director: "" },
  ]);
  const setConf = (i, k, v) => setConfs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [proposals, setProposals] = useState([
    { title: "", duration: "", agency: "", amount: "", score: "", hod: "", director: "" },
  ]);
  const setProp = (i, k, v) => setProposals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [products, setProducts] = useState([
    { details: "", usage: "", score: "", hod: "", director: "" },
  ]);
  const setProd = (i, k, v) => setProducts((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [fdps, setFdps] = useState([
    { program: "", duration: "", org: "", score: "", hod: "", director: "" },
  ]);
  const setFdp = (i, k, v) => setFdps((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [training, setTraining] = useState([
    { company: "", duration: "", nature: "", score: "", hod: "", director: "" },
  ]);
  const setTrain = (i, k, v) => setTraining((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [docs, setDocs] = useState({});
  const [sectionApplicability, setSectionApplicability] = useState({ projects: "applicable", research: "applicable", society: "applicable" });
  const [appraisalLocked, setAppraisalLocked] = useState(false);
  const [sectionSaveStatus, setSectionSaveStatus] = useState({ partA: false, partB: false });
  const [savingSection, setSavingSection] = useState(null);

  useEffect(() => {
    const userEmail = sessionStorage.getItem("username");
    if (!userEmail || !info.ay) return;

    const loadOwnAppraisal = async () => {
      try {
        const statusData = await api.get("/appraisal/status", { params: { academic_year: info.ay } }).catch(() => null);
        const declarationRow = statusData?.declaration || null;

        await Promise.all([
          loadSavedAppraisal({
            facultyEmail: userEmail,
            academicYear: info.ay,
            setters: {
              setInfo,
              setLectures,
              setCourseFile,
              setInnovRows,
              setInnovDetails,
              setInnovScore,
              setProjects,
              setQuals,
              setFeedback,
              setDeptActs,
              setUniActs,
              setSociety,
              setIndustry,
              setAcr,
              setJournals,
              setBooks,
              setIct,
              setResearch,
              setProjects2,
              setExternalProjects,
              setPatents,
              setAwards,
              setConfs,
              setProposals,
              setProducts,
              setFdps,
              setTraining,
              setDocs,
              setSectionApplicability,
              setSectionSaveStatus,
            },
          }),
          loadAppraisalDocuments({
            facultyEmail: userEmail,
            academicYear: info.ay,
            setDocs,
          }),
        ]);
        setAppraisalLocked(Boolean(declarationRow));
      } catch (err) {
        console.error("Could not load saved director appraisal:", err);
      }
    };

    loadOwnAppraisal();
  }, [info.ay]);

  // ── Computed scores for HOD appraisal ──
  const totalLecScore = sumSectionScore(lectures, 50);
  const courseFileScore = clampScore(courseFile.reduce((total, row) => total + courseFileRowScore(row), 0), 20);
  const hasInnovRows = innovRows.some((row) => ["method", "details", "score"].some((field) => String(row?.[field] ?? "").trim() !== ""));
  const visibleInnovRows = hasInnovRows ? innovRows : [{ method: innovDetails, details: innovDetails, score: innovScore }];
  const innovTotal = hasInnovRows
    ? clampScore(innovRows.reduce((total, row) => total + clampScore(row.score, SCORE_LIMITS.innovativeRow), 0), 10)
    : innovativeTeachingScore(innovDetails, innovScore, 10);
  const innovScoreComputed = String(innovTotal);
  const projectTotal = sectionApplicability.projects === "notApplicable" ? 0 : sumSectionScore(projects, 10, "score", projectGuidanceRowMax);
  const qualTotal = sumSectionScore(quals, 10, "score", SCORE_LIMITS.qualificationRow);
  const teachingRaw = totalLecScore + courseFileScore + innovTotal + projectTotal + qualTotal;
  const stuFeedbackScore = feedbackSectionScore(feedback, 10);
  const deptScore = sumSectionScore(deptActs, 20);
  const uniScore = sumSectionScore(uniActs, 30);
  const societyScore = sectionApplicability.society === "notApplicable" ? 0 : clampScore(society.reduce((total, row) => total + societyRowScore(row), 0), 10);
  const industryScore = sumSectionScore(industry, 5);
  const acrScore = sumSectionScore(acr, 25, "score", SCORE_LIMITS.acrRow);
  const effectivePartAMax = effectiveMaxScore(200, sectionApplicability, [{ key: "projects", max: 10 }, { key: "society", max: 10 }]);
  const partATotal = clampScore(teachingRaw + stuFeedbackScore + deptScore + uniScore + societyScore + industryScore + acrScore, effectivePartAMax);

  const journalScore = sumSectionScore(journals, 120);
  const bookScore = sumSectionScore(books, 50);
  const ictScore = sumSectionScore(ict, 20);
  const researchScore = sectionApplicability.research === "notApplicable" ? 0 : clampScore(research.reduce((total, row) => total + researchGuidanceScore(row), 0), 30);
  const projectBScore = sumSectionScore(projects2, SCORE_LIMITS.researchInternalProjects);
  const externalProjectScore = sumSectionScore(externalProjects, SCORE_LIMITS.researchExternalProjects);
  const patentScore = sumSectionScore(patents, 40);
  const awardScore = sumSectionScore(awards, 10);
  const confScore = sumSectionScore(confs, 30);
  const proposalScore = sumSectionScore(proposals, 10);
  const productScore = sumSectionScore(products, 10);
  const fdpScore = fdps.reduce((s, r) => s + clampScore(parseFloat(r.score) || 0, SCORE_LIMITS.fdpRow), 0);
  const trainScore = training.reduce((s, r) => s + clampScore(parseFloat(r.score) || 0, SCORE_LIMITS.fdpRow), 0);
  const b8Score = clampScore(fdpScore + trainScore, 10);
  const effectivePartBMax = effectiveMaxScore(375, sectionApplicability, [{ key: "research", max: 30 }]);
  const effectiveGrandMax = effectivePartAMax + effectivePartBMax;
  const partBTotal = clampScore(journalScore + bookScore + ictScore + researchScore + projectBScore + externalProjectScore + patentScore + awardScore + confScore + proposalScore + productScore + b8Score, effectivePartBMax);
  const grandTotal = clampScore(partATotal + partBTotal, effectiveGrandMax);

  const gradeFunc = () => {
    const p = pct(grandTotal, effectiveGrandMax);
    if (p >= 85) return { label: "Outstanding", color: "#10b981" };
    if (p >= 70) return { label: "Very Good", color: "#3b82f6" };
    if (p >= 55) return { label: "Good", color: "#f59e0b" };
    if (p >= 40) return { label: "Satisfactory", color: "#f97316" };
    return { label: "Needs Improvement", color: "#ef4444" };
  };
  const g = gradeFunc();
  const isDirectorPending = (item) => {
    const s = item.status || "";
    return s === "pending_director" || s === "Pending Review" || s === "pending_hod" ||
      (n(item.directorTotal) <= 0 && !String(item.directorRemarks || "").trim() && s !== "Reviewed" && s !== "pending_dean" && s !== "director_reviewed" && !/Director\s*(Reviewed|Rejected)/i.test(s) && s !== "completed");
  };
  const isDirectorReviewed = (item) => {
    const s = item.status || "";
    return n(item.directorTotal) > 0 || String(item.directorRemarks || "").trim() !== "" || s === "Reviewed" || s === "pending_dean" || s === "director_reviewed" || /Director\s*Reviewed/i.test(s);
  };

  const facultyPendingCount = facultyList.filter(isDirectorPending).length;
  const facultyReviewedCount = facultyList.filter(isDirectorReviewed).length;
  const hodPendingCount = hodList.filter(isDirectorPending).length;
  const hodReviewedCount = hodList.filter(isDirectorReviewed).length;

  const navItems = [
    { id: "myAppraisal", icon: "👤", label: "My Appraisal", sub: "View your self-appraisal form" },
    { id: "facultyApprovals", icon: "🎓", label: "Faculty's Appraisal", sub: `${facultyPendingCount} awaiting review`, badge: facultyPendingCount },
    { id: "hodApprovals", icon: "👥", label: "HOD's Appraisal", sub: `${hodPendingCount} awaiting review`, badge: hodPendingCount },
    { id: "guidelines", icon: "📋", label: "Guidelines", sub: "Faculty appraisal guidelines AY 2025-26" },
  ];
  const [submitting, setSubmitting] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);

  const validateSelfAppraisalRows = () => {
    const sections = [
      { label: "A(i). Lectures", rows: lectures, fields: ["sem", "code", "planned", "conducted", "score"] },
      { label: "A(ii). Course File", rows: courseFile, fields: ["course", "title", "details"] },
      { label: "A(iv). Projects", rows: projects, fields: ["label", "score"], rowMax: projectGuidanceRowMax, maxScore: 10, skip: sectionApplicability.projects === "notApplicable" },
      { label: "A(v). Qualifications", rows: quals, fields: ["label", "score"] },
      { label: "A(vi). Student Feedback", rows: feedback, fields: ["code", "fb1", "fb2"] },
      { label: "A(vii). Department Activities", rows: deptActs, fields: ["activity", "nature", "score"] },
      { label: "A(viii). University Activities", rows: uniActs, fields: ["activity", "nature", "score"] },
      { label: "A(ix). Contribution to Society", rows: society, fields: ["details", "participated"] },
      { label: "A(x). Industry Connect", rows: industry, fields: ["name", "details", "score"] },
      { label: "B1. Journals", rows: journals, fields: ["title", "journal", "issn", "index", "score"] },
      { label: "B2. Books / Chapters", rows: books, fields: ["title", "book", "issn", "pub", "coauth", "first", "score"] },
      { label: "B3. ICT Pedagogy", rows: ict, fields: ["title", "desc", "type", "quad", "score"] },
      { label: "B4(a). Research Guidance", rows: research, fields: ["degree", "name", "thesis"], skip: sectionApplicability.research === "notApplicable" },
      { label: "B4(b). Internal Projects", rows: projects2, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B4(c). External Projects", rows: externalProjects, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B5(a). Patents (IPR)", rows: patents, fields: ["title", "type", "date", "status", "fileNo", "score"] },
      { label: "B5(b). Awards", rows: awards, fields: ["title", "date", "agency", "level", "score"] },
      { label: "B6. Conferences", rows: confs, fields: ["title", "type", "org", "level", "score"] },
      { label: "B7(a). Proposals", rows: proposals, fields: ["title", "duration", "agency", "amount", "score"] },
      { label: "B7(b). Products", rows: products, fields: ["details", "usage", "score"] },
      { label: "B8(a). FDP / Workshops", rows: fdps, fields: ["program", "duration", "org", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 5 },
      { label: "B8(b). Industrial Training", rows: training, fields: ["company", "duration", "nature", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 5 },
    ];
    sections.push({ label: "A(iii). Innovative Teaching Methods", rows: visibleInnovRows, fields: ["method", "details", "score"], docKey: (_row, index) => index === 0 ? "innov" : `innov-${index}`, rowMax: SCORE_LIMITS.innovativeRow, maxScore: 10 });
    const errors = validateCompleteRows(sections, docs);
    [...projects2, ...externalProjects].forEach((row, index) => {
      if (row.date && !isValidDDMMYYYY(row.date)) {
        errors.push(`B4 project row ${index + 1}: date must be DD/MM/YYYY.`);
      }
    });
    if (errors.length) {
      alert(errors.join("\n"));
      return false;
    }
    return true;
  };
  const validateSelfAppraisalSectionRows = (section) => {
    const partASections = [
      { label: "A(i). Lectures", rows: lectures, fields: ["sem", "code", "planned", "conducted", "score"] },
      { label: "A(ii). Course File", rows: courseFile, fields: ["course", "title", "details"] },
      { label: "A(iv). Projects", rows: projects, fields: ["label", "score"], rowMax: projectGuidanceRowMax, maxScore: 10, skip: sectionApplicability.projects === "notApplicable" },
      { label: "A(v). Qualifications", rows: quals, fields: ["label", "score"] },
      { label: "A(vi). Student Feedback", rows: feedback, fields: ["code", "fb1", "fb2"] },
      { label: "A(vii). Department Activities", rows: deptActs, fields: ["activity", "nature", "score"] },
      { label: "A(viii). University Activities", rows: uniActs, fields: ["activity", "nature", "score"] },
      { label: "A(ix). Contribution to Society", rows: society, fields: ["details", "participated"] },
      { label: "A(x). Industry Connect", rows: industry, fields: ["name", "details", "score"] },
    ];
    const partBSections = [
      { label: "B1. Journals", rows: journals, fields: ["title", "journal", "issn", "index", "score"] },
      { label: "B2. Books / Chapters", rows: books, fields: ["title", "book", "issn", "pub", "coauth", "first", "score"] },
      { label: "B3. ICT Pedagogy", rows: ict, fields: ["title", "desc", "type", "quad", "score"] },
      { label: "B4(a). Research Guidance", rows: research, fields: ["degree", "name", "thesis"], skip: sectionApplicability.research === "notApplicable" },
      { label: "B4(b). Internal Projects", rows: projects2, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B4(c). External Projects", rows: externalProjects, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B5(a). Patents (IPR)", rows: patents, fields: ["title", "type", "date", "status", "fileNo", "score"] },
      { label: "B5(b). Awards", rows: awards, fields: ["title", "date", "agency", "level", "score"] },
      { label: "B6. Conferences", rows: confs, fields: ["title", "type", "org", "level", "score"] },
      { label: "B7(a). Proposals", rows: proposals, fields: ["title", "duration", "agency", "amount", "score"] },
      { label: "B7(b). Products", rows: products, fields: ["details", "usage", "score"] },
      { label: "B8(a). FDP / Workshops", rows: fdps, fields: ["program", "duration", "org", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 5 },
      { label: "B8(b). Industrial Training", rows: training, fields: ["company", "duration", "nature", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 5 },
    ];
    if (section === "partA") partASections.push({ label: "A(iii). Innovative Teaching Methods", rows: visibleInnovRows, fields: ["method", "details", "score"], docKey: (_row, index) => index === 0 ? "innov" : `innov-${index}`, rowMax: SCORE_LIMITS.innovativeRow, maxScore: 10 });
    const errors = validateCompleteRows(section === "partA" ? partASections : partBSections, docs);
    if (section === "partA") {
    } else {
      [...projects2, ...externalProjects].forEach((row, index) => {
        if (row.date && !isValidDDMMYYYY(row.date)) errors.push(`B4 project row ${index + 1}: date must be DD/MM/YYYY.`);
      });
    }
    if (errors.length) {
      alert(errors.join("\n"));
      return false;
    }
    return true;
  };

  const isMyAppraisalSectionOpen = (_section) => true;

  const handleMyAppraisalSectionChange = (section) => {
    setHodAppraisalTab(section);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  const buildSelfDraftForm = (saveStatus = sectionSaveStatus) => normalizeAutoScores({
    info, lectures, courseFile, innovDetails: visibleInnovRows.map((row) => row.method).filter(Boolean).join(", "), innovScore: innovScoreComputed, innovRows: visibleInnovRows, projects, quals, feedback,
    deptActs, uniActs, society, industry, acr, journals, books, ict, research,
    projects2, externalProjects, patents, awards, confs, proposals, products, fdps,
    training, sectionApplicability, sectionSaveStatus: saveStatus,
  });

  const handleSaveCurrentSection = async (section) => {
    if (appraisalLocked) return;
    const userEmail = sessionStorage.getItem("username");
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }
    const nextStatus = { ...sectionSaveStatus, [section]: true };
    setSavingSection(section);
    try {
      await saveAppraisalDraftSection({
        facultyEmail: userEmail,
        academicYear: info.ay,
        totals: { partATotal, partBTotal, grandTotal },
        form: buildSelfDraftForm(nextStatus),
        docs,
        submitterProfile: profileFromsessionStorage(),
        sectionSaveStatus: nextStatus,
      });
      setSectionSaveStatus(nextStatus);
    } catch (err) {
      if (err?.statusCode === 403 || err?.response?.status === 403) {
        setAppraisalLocked(true);
        return;
      }
      alert(`Unable to save draft.\n\n${err.message}`);
    } finally {
      setSavingSection(null);
    }
  };
  const handleSubmitAppraisal = async () => {
    if (appraisalLocked) {
      alert("This appraisal has already been submitted and locked.");
      return;
    }
    if (!accuracyConfirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting.");
      return;
    }
    if (!validateSelfAppraisalRows()) return;
    if (!info.name || !info.ay) {
      alert("Please fill in basic faculty information (Name, Academic Year).");
      setHodAppraisalTab("partA");
      return;
    }

    const userEmail = sessionStorage.getItem("username");
    if (!userEmail) {
      alert("Please login again before submitting. Your email was not found in this session.");
      navigate("/login", { replace: true });
      return;
    }

    const submitterProfile = profileFromsessionStorage();
    const workflowError = workflowValidationError(submitterProfile);
    if (workflowError) {
      alert(workflowError);
      return;
    }

    const confirmSubmit = window.confirm("Are you sure you want to submit your appraisal? This will save your data to the database.");
    if (!confirmSubmit) return;

    setSubmitting(true);
    try {
      await submitAppraisal({
        facultyEmail: userEmail,
        academicYear: info.ay,
        totals: { partATotal, partBTotal, grandTotal },
        form: buildSelfDraftForm(),
        docs,
        submitterProfile,
        activeProfile: submitterProfile,
      });

      alert("Appraisal submitted successfully!");
      setAppraisalLocked(true);
    } catch (err) {
      console.error("Submission error:", err);
      alert(`Unable to submit appraisal.\n\n${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const generateReport = () => generateStandardReport({
    info, lectures, courseFile, innovRows, innovTotal, projects, quals,
    feedback, deptActs, uniActs, society, industry, acr,
    journals, books, ict, research, projects2, externalProjects,
    patents, awards, confs, proposals, products, fdps, training,
    sectionApplicability,
    totalLecScore, courseFileScore, teachingRaw, stuFeedbackScore,
    deptScore, uniScore, societyScore, industryScore, acrScore,
    partATotal, effectivePartAMax,
    journalScore, bookScore, ictScore, researchScore, projectBScore,
    externalProjectScore, patentScore, awardScore, confScore,
    proposalScore, productScore, fdpScore, trainScore,
    partBTotal, effectivePartBMax, grandTotal, effectiveGrandMax,
    researchGuidanceScore,
  });

  const handleSubmitReview = async (type, id, scores, remarks, sectionScores, reviewConfirmed = false) => {
    if (!reviewConfirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting the review.");
      return;
    }
    const sourceList = type === "hod" ? hodList : facultyList;
    const item = sourceList.find((entry) => entry.id === id);
    if (!item) return;

    try {
      await submitWorkflowReview({
        subjectEmail: item.email,
        academicYear: item.academicYear || item.academic_year || item.info?.ay || APP_INFO.DEFAULT_AY || "2025-2026",
        reviewerRole: "director",
        partAScore: scores.partA,
        partBScore: scores.partB,
        totalScore: scores.total,
        remarks,
        sectionScores,
        subjectProfile: item,
      });

      if (type === "hod") {
        setHodList(prev => prev.map(h => h.id === id ? { ...h, ...sectionScores, innovDirector: sectionScores?.innovativeTeaching?.director ?? h.innovDirector, status: "Reviewed", workflowStatus: reviewedStatusFor("director"), directorPartA: scores.partA, directorPartB: scores.partB, directorTotal: scores.total, directorRemarks: remarks } : h));
        setReviewingHod(null);
      } else {
        setFacultyList(prev => prev.map(f => f.id === id ? { ...f, ...sectionScores, innovDirector: sectionScores?.innovativeTeaching?.director ?? f.innovDirector, status: "Reviewed", workflowStatus: reviewedStatusFor("director"), directorPartA: scores.partA, directorPartB: scores.partB, directorTotal: scores.total, directorRemarks: remarks } : f));
        setReviewingFaculty(null);
      }

      alert("Director review approved and forwarded to Dean.");
    } catch (err) {
      console.error("Could not submit Director review:", err);
      alert(`Unable to submit Director review.\n\n${err.message}`);
    }
  };

  const filtered = activeMainTab === "hodApprovals"
    ? (filterStatus === "All" ? hodList : (filterStatus === "Pending Review" ? hodList.filter(isDirectorPending) : hodList.filter(isDirectorReviewed)))
    : (filterStatus === "All" ? facultyList : (filterStatus === "Pending Review" ? facultyList.filter(isDirectorPending) : facultyList.filter(isDirectorReviewed)));

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Georgia, serif", background: "#f8fafc", color: "#1e293b" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 252, height: "100vh", minHeight: "100vh", boxSizing: "border-box", overflow: "hidden", background: "#0f172a", display: "flex", flexDirection: "column", padding: "22px 16px", gap: 14, position: "sticky", top: 0, alignSelf: "flex-start", flexShrink: 0, borderTopRightRadius: 18, borderBottomRightRadius: 18, marginRight: 8, boxShadow: "6px 0 20px rgba(15,23,42,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>FA</div>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13 }}>{APP_INFO.PORTAL_NAME}</div>
            <div style={{ color: "#475569", fontSize: 9, lineHeight: 1.3 }}>{APP_INFO.UNIVERSITY_NAME}</div>
          </div>
        </div>

        <div style={{ height: 1, background: "#1e293b" }} />

        {navItems.map(tab => (
          <button key={tab.id} onClick={() => { setActiveMainTab(tab.id); setReviewingFaculty(null); }}
            style={{ background: activeMainTab === tab.id ? "#1e293b" : "none", border: "none", borderRadius: 9, padding: "10px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", fontFamily: "Georgia, serif" }}>
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 12 }}>{tab.label}</div>
              <div style={{ color: "#64748b", fontSize: 10, marginTop: 1 }}>{tab.sub}</div>
            </div>
            {tab.badge > 0 && (
              <div style={{ background: "#f59e0b", color: "#fff", fontWeight: 800, fontSize: 10, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{tab.badge}</div>
            )}
          </button>
        ))}
        {activeMainTab === "myAppraisal" && (
          <div style={{ marginTop: 6, background: "#1e293b", borderRadius: 8, padding: "9px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>
              My Appraisal Section
            </div>
            <select
              value={hodAppraisalTab}
              onChange={(e) => handleMyAppraisalSectionChange(e.target.value)}
              style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "7px 8px", fontSize: 12, fontFamily: "Georgia, serif", color: "#e2e8f0", background: "#0f172a", outline: "none" }}
            >
              <option value="partA">Part A</option>
              <option value="partB" disabled={!isMyAppraisalSectionOpen("partB")}>Part B</option>
              <option value="summary" disabled={!isMyAppraisalSectionOpen("summary")}>Summary</option>
            </select>
          </div>
        )}
        {activeMainTab === "guidelines" && (
          <div style={{ marginTop: 6, background: "#1e293b", borderRadius: 8, padding: "9px 10px" }}>
            <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Guidelines Section</div>
            <select value={guidelinesTab} onChange={e => setGuidelinesTab(e.target.value)}
              style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "7px 8px", fontSize: 12, fontFamily: "Georgia, serif", color: "#e2e8f0", background: "#0f172a", outline: "none" }}>
              <option value="form">Form Guidelines</option>
              <option value="grading">Grading Scheme</option>
            </select>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ height: 1, background: "#1e293b" }} />
        <button
          type="button"
          onClick={() => navigate("/edit-profile")}
          title="Edit profile"
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", fontFamily: "Georgia, serif", textAlign: "left" }}
        >
          <Avatar initials={(sessionStorage.getItem("name") || "U").split(" ").map(n => n[0]).join("").toUpperCase()} color="#6366f1" size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 700 }}>{(sessionStorage.getItem("name") || "User").split(" ").slice(0, 2).join(" ")}</div>
            <div style={{ color: "#475569", fontSize: 9 }}>Director · {sessionStorage.getItem("department")?.split(" ")[0] || ""}</div>
          </div>
        </button>
        <button
          onClick={() => setShowLogoutModal(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "none", border: "1px solid #374151", borderRadius: 8, padding: "9px 11px", cursor: "pointer", fontFamily: "Georgia, serif" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <span style={{ fontSize: 15 }}>🚪</span>
          <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12 }}>Logout</span>
        </button>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: "24px 30px", display: "flex", flexDirection: "column", gap: 18, overflowX: "auto" }}>

        {/* MY APPRAISAL TAB */}
        {activeMainTab === "myAppraisal" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 9, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>My Appraisal Form</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{info.name || "HOD"} · {info.ay}</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ flex: 1 }}>

            {/* Part A Tab */}
            {hodAppraisalTab === "partA" && (
              <SC title="Part A — Teaching & Academic Activities (Max 200)" accent="#6366f1">
                <div style={{ marginBottom: 14, padding: "8px 12px", background: "#f0f4ff", borderRadius: 6, fontSize: 12, color: "#312e81", fontWeight: 600 }}>
                  📊 Total Part A Score: {partATotal.toFixed(1)}/{effectivePartAMax}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Fill in your teaching and academic activities for the appraisal period. Enter scores for each item.</div>
{/* A1. Teaching Process */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(i) Lectures, Tutorials, Practicals, Projects — Max 50 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={TH}>SN</th>
                        <th style={TH}>Semester</th>
                        <th style={TH}>Course Code / Name</th>
                        <th style={TH}>Classes (as per course structure)</th>
                        <th style={TH}>Classes Actually Conducted</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lectures.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.sem} onChange={(v) => setLec(i, "sem", v)} /></td>
                          <td style={TD}><TI val={r.code} onChange={(v) => setLec(i, "code", v)} textOnly /></td>
                          <td style={TDC}><TI val={r.planned} numeric onChange={(v) => setLec(i, "planned", v)} center /></td>
                          <td style={TDC}><TI val={r.conducted} numeric onChange={(v) => setLec(i, "conducted", v)} center /></td>
                          <td style={TD}><DocCell id={`lec-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`lec-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setLec(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total</td>
                        <td style={{ ...TDS, fontWeight: "bold", color: "#1e3a5f" }}>{totalLecScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setLectures((p) => [...p, { sem: "", code: "", planned: "", conducted: "", score: "" }])} onDel={() => setLectures((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={lectures.length > 1} />
                </div>

                {/* A2. Course File */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(ii) Course File — Max 20 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Course / Paper</th>
                        <th style={TH}>Program & Semester</th>
                        <th style={TH}>Availability as per IQAC format</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                    {courseFile.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                    <td style={TDC}>{i + 1}</td>
                    <td style={TD}><TI val={r.course} onChange={(v) => setCF(i, "course", v)} /></td>
                    <td style={TD}><TI val={r.title} onChange={(v) => setCF(i, "title", v)} /></td>
                    <td style={TD}>
                      <select value={r.details} onChange={(e) => setCF(i, "details", e.target.value)} style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "Georgia, serif", fontSize: 11 }}>
                        <option value="">Select</option>
                        <option value="1.Available">1.Available</option>
                        <option value="2.Partially Available">2.Partially Available</option>
                        <option value="3.Not Available">3.Not Available</option>
                      </select>
                    </td>
                    <td style={TDS}><TI val={r.score} onChange={(v) => setCF(i, "score", v === "" ? "" : String(clampScore(v, SCORE_LIMITS.courseFileRow)))} numeric max={SCORE_LIMITS.courseFileRow} center /></td>
                   </tr>
                 ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Total Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold", color: "#1e3a5f" }}>{courseFileScore.toFixed(1)}</td>
                      </tr>
                  </tbody>
                  </table>
                  <RowBtns onAdd={() =>setCourseFile((p) => [ ...p, { course: "", title: "", details: "", score: "" }])}onDel={() =>setCourseFile((p) => (p.length > 1 ? p.slice(0, -1) : p))}canDel={courseFile.length > 1}/>
                </div>

                {/* A3. Innovative Teaching */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(iii) Innovative Teaching-Learning Methodologies - Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Methods Used</th>
                        <th style={TH}>Details</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInnovRows.map((r, i) => (
                        <tr key={i}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.method} onChange={(v) => setInnov(i, "method", v)} /></td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setInnov(i, "details", v)} /></td>
                          <td style={TD}><DocCell id={i === 0 ? "innov" : `innov-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={i === 0 ? "innov" : `innov-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setInnov(i, "score", v === "" ? "" : String(clampScore(v, SCORE_LIMITS.innovativeRow)))} numeric max={SCORE_LIMITS.innovativeRow} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{innovTotal.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setInnovRows((p) => [...(hasInnovRows ? p : visibleInnovRows), { method: "", details: "", score: "" }])} onDel={() => setInnovRows((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={visibleInnovRows.length > 1} />
                </div>

                {/* A4. Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(iv) Projects — Max 10 marks</div>                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 12, fontWeight: 700, color: "#334155" }}>
                    {["applicable", "notApplicable"].map((value) => (
                      <label key={value} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={sectionApplicability.projects === value} onChange={() => { setSectionApplicability((current) => ({ ...current, projects: value })); if (value === "notApplicable") setProjects((rows) => rows.map((row) => ({ ...row, label: "", score: "" }))); }} />
                        {value === "applicable" ? "Applicable" : "Not Applicable"}
                      </label>
                    ))}
                  </div>
                  {sectionApplicability.projects !== "notApplicable" && (<>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Project Description</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((r, i) => (
                        <tr key={i}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.label} readOnly={sectionApplicability.projects === "notApplicable"} onChange={(v) => setProj(i, "label", v)} /></td>
                          <td style={TD}><DocCell id={`proj-${i}`} docs={docs} setDocs={setDocs} readOnly={sectionApplicability.projects === "notApplicable"} /></td>
                          <td style={TD}><ViewCell id={`proj-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric readOnly={sectionApplicability.projects === "notApplicable"} onChange={(v) => setProj(i, "score", v)} center max={projectGuidanceRowMax(r)} /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Total Score (Max {sectionApplicability.projects === "notApplicable" ? 0 : 10})</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{projectTotal.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProjects((p) => [...p, { label: "", score: "" }])} onDel={() => setProjects((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={projects.length > 1} />
                  </>)}
                </div>

                {/* A5. Qualifications */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(v) Qualifications — Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Qualification</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quals.map((r, i) => (
                        <tr key={i}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.label} onChange={(v) => setQual(i, "label", v)} /></td>
                          <td style={TD}><DocCell id={`qual-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`qual-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setQual(i, "score", v)} center max={SCORE_LIMITS.qualificationRow} /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{qualTotal.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setQuals((p) => [...p, { label: "", score: "" }])} onDel={() => setQuals((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={quals.length > 1} />
                </div>

                {/* A6. Student Feedback */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(vi) Student Feedback — Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Course Code / Name</th>
                        <th style={TH}>First Feedback</th>
                        <th style={TH}>Second Feedback</th>
                        <th style={TH}>Average</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.code} onChange={(v) => setFb(i, "code", v)} textOnly /></td>
                          <td style={TDC}><TI val={r.fb1} numeric onChange={(v) => setFb(i, "fb1", v)} center max={SCORE_LIMITS.feedbackAverage} /></td>
                          <td style={TDC}><TI val={r.fb2} numeric onChange={(v) => setFb(i, "fb2", v)} center max={SCORE_LIMITS.feedbackAverage} /></td>
                          <td style={{ ...TDC, fontWeight: 700, color: "#0ea5e9" }}>{r.fb1 || r.fb2 ? feedbackAverage(r).toFixed(2) : ""}</td>
                          <td style={TDS}>{feedbackRowScore(r, 10).toFixed(1)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{stuFeedbackScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setFeedback((p) => [...p, { code: "", fb1: "", fb2: "", score: "" }])} onDel={() => setFeedback((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={feedback.length > 1} />
                </div>

                {/* A7. Department Activities */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(vii) Department Activities — Max 20 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Activity</th>
                        <th style={TH}>Nature</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptActs.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.activity} onChange={(v) => setDept(i, "activity", v)} /></td>
                          <td style={TD}><TI val={r.nature} onChange={(v) => setDept(i, "nature", v)} /></td>
                          <td style={TD}><DocCell id={`dept-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`dept-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setDept(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{deptScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setDeptActs((p) => [...p, { activity: "", nature: "", score: "" }])} onDel={() => setDeptActs((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={deptActs.length > 1} />
                </div>

                {/* A8. University Activities */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(viii) University Activities — Max 30 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Activity</th>
                        <th style={TH}>Nature</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uniActs.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.activity} onChange={(v) => setUni(i, "activity", v)} /></td>
                          <td style={TD}><TI val={r.nature} onChange={(v) => setUni(i, "nature", v)} /></td>
                          <td style={TD}><DocCell id={`uni-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`uni-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setUni(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 30)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{uniScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setUniActs((p) => [...p, { activity: "", nature: "", score: "" }])} onDel={() => setUniActs((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={uniActs.length > 1} />
                </div>

                {/* A9. Contribution to Society */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(ix) Contribution to Society - Max 10 marks (Max 5 per row)</div>
                  <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 12, fontWeight: 800, color: "#334155" }}>
                    {["applicable", "notApplicable"].map((v) => (
                      <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={(sectionApplicability.society || "applicable") === v} onChange={() => setSectionApplicability((p) => ({ ...p, society: v }))} />
                        {v === "applicable" ? "Applicable" : "Not Applicable"}
                      </label>
                    ))}
                  </div>
                  {sectionApplicability.society !== "notApplicable" && <><table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Activity</th>
                        <th style={TH}>Yes/No</th>
                        <th style={TH}>Details</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score (Max 5)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {society.map((r, i) => {
                        const socLocked = societyRowLocked(r);
                        return (
                        <tr key={i} style={socLocked ? { background: "#f1f5f9", opacity: 0.65 } : i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.label} onChange={(v) => setSoc(i, "label", v)} readOnly={socLocked} /></td>
                          <td style={TDC}>
                            <select value={societySelectionForRow(r) || "No"} onChange={(e) => setSociety((rows) => rows.map((row, ri) => ri === i ? { ...row, participated: e.target.value, score: e.target.value === "No" ? "0" : row.score } : row))} style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #cbd5e1", fontFamily: "Georgia, serif" }}>
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setSoc(i, "details", v)} readOnly={socLocked} /></td>
                          <td style={TD}><DocCell id={`soc-${i}`} docs={docs} setDocs={setDocs} readOnly={socLocked} /></td>
                          <td style={TD}><ViewCell id={`soc-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setSoc(i, "score", v === "" ? "" : String(clampScore(v, SCORE_LIMITS.societyRow)))} numeric max={SCORE_LIMITS.societyRow} center readOnly={socLocked} /></td>
                        </tr>
                        );
                      })}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{societyScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setSociety((p) => [...p, { label: "", details: "", participated: "", score: "" }])} onDel={() => setSociety((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={society.length > 1} />
                  </>}
                </div>

                {/* A10. Industry Connect */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(x) Industry Connect — Max 5 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Company/Organization</th>
                        <th style={TH}>Details</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {industry.map((r, i) => (
                        <tr key={i}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.name} onChange={(v) => setInd(i, "name", v)} textOnly /></td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setInd(i, "details", v)} /></td>
                          <td style={TD}><DocCell id={`ind-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`ind-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setInd(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 5)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{industryScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setIndustry((p) => [...p, { name: "", details: "", score: "" }])} onDel={() => setIndustry((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={industry.length > 1} />
                </div>

                {/* A11. ACR */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(xi) Annual Confidential Report (ACR) — Max 25 marks</div>
                  <div style={{ fontSize: 11, color: "#b45309", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 5, padding: "6px 10px", marginBottom: 8 }}>Warning: This section is filled by your superior (HOD/Director). Your scores here are read-only.</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Attribute</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acr.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><div style={{ fontWeight: 700 }}>{r.label}</div>{ACR_DETAIL_POINTS[r.label] && <ul style={{ margin: "5px 0 0 16px", padding: 0, color: "#64748b", fontSize: 10, lineHeight: 1.5 }}>{ACR_DETAIL_POINTS[r.label].map((point) => <li key={point}>{point}</li>)}</ul>}</td>
                          <td style={TDS}><RO val={String(r.score ?? "").trim() ? clampScore(r.score, SCORE_LIMITS.acrRow) : "-"} center /></td>

                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={2}>Total Score (Max 25)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{acrScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SC>
            )}

            {/* Part B Tab */}
            {hodAppraisalTab === "partB" && (
              <SC title="Part B — Research & Academic Contributions (Max 375)" accent="#7c3aed">
                <div style={{ marginBottom: 14, padding: "8px 12px", background: "#ede9fe", borderRadius: 6, fontSize: 12, color: "#6d28d9", fontWeight: 600 }}>
                  📊 Total Part B Score: {partBTotal.toFixed(1)}/{effectivePartBMax}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Enter your research publications, patents, conferences, and other academic contributions.</div>

                {/* B1. Research Papers / Journals */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B1. Research Papers / Journals — Max 120 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Journal</th>
                        <th style={TH}>ISSN</th>
                        <th style={TH}>General Indexing</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journals.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setJour(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.journal} onChange={(v) => setJour(i, "journal", v)} /></td>
                          <td style={TD}><TI val={r.issn} onChange={(v) => setJour(i, "issn", v)} /></td>
                          <td style={TD}><TI val={r.index} onChange={(v) => setJour(i, "index", v)} /></td>
                          <td style={TD}><DocCell id={`jour-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`jour-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setJour(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total Score (Max 120)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{journalScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setJournals((p) => [...p, { title: "", journal: "", issn: "", index: "", score: "" }])} onDel={() => setJournals((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={journals.length > 1} />
                </div>

                {/* B2. Books / Chapters */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B2. Books / Chapters — Max 50 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title with Page Nos.</th>
                        <th style={TH}>Book Title, Editor & Publisher</th>
                        <th style={TH}>ISSN / ISBN No.</th>
                        <th style={TH}>Type of Publisher</th>
                        <th style={TH}>Co-authors (from DYPIU)</th>
                        <th style={TH}>First Author</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {books.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setBook(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.book} onChange={(v) => setBook(i, "book", v)} /></td>
                          <td style={TD}><TI val={r.issn} onChange={(v) => setBook(i, "issn", v)} /></td>
                          <td style={TD}><TI val={r.pub} onChange={(v) => setBook(i, "pub", v)} /></td>
                          <td style={TD}><TI val={r.coauth} onChange={(v) => setBook(i, "coauth", v)} /></td>
                          <td style={TD}><select value={r.first || ""} onChange={(e) => setBook(i, "first", e.target.value)} style={{ width: "100%", height: 30, border: "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, fontFamily: "Georgia, serif" }}><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select></td>
                          <td style={TD}><DocCell id={`book-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`book-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setBook(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={9}>Total Score (Max 50)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{bookScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setBooks((p) => [...p, { title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "" }])} onDel={() => setBooks((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={books.length > 1} />
                </div>

                {/* B3. ICT Pedagogy */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B3. ICT Pedagogy — Max 20 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Description</th>
                        <th style={TH}>Type</th>
                        <th style={TH}>Quadrant</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ict.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setIctRow(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.desc} onChange={(v) => setIctRow(i, "desc", v)} /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setIctRow(i, "type", v)} textOnly /></td>
                          <td style={TD}><TI val={r.quad} onChange={(v) => setIctRow(i, "quad", v)} /></td>
                          <td style={TD}><DocCell id={`ict-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`ict-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setIctRow(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{ictScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setIct((p) => [...p, { title: "", desc: "", type: "", quad: "", score: "" }])} onDel={() => setIct((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={ict.length > 1} />
                </div>

                {/* B4(a). Research Guidance */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B4(a). Research Guidance - Max 30 marks (PhD: 20, PG: 10)</div>                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 12, fontWeight: 700, color: "#334155" }}>
                    {["applicable", "notApplicable"].map((value) => (
                      <label key={value} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={sectionApplicability.research === value} onChange={() => { setSectionApplicability((current) => ({ ...current, research: value })); if (value === "notApplicable") setResearch((rows) => rows.map((row) => ({ ...row, degree: "", name: "", thesis: "", score: "" }))); }} />
                        {value === "applicable" ? "Applicable" : "Not Applicable"}
                      </label>
                    ))}
                  </div>
                  {sectionApplicability.research !== "notApplicable" && (<>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Degree</th>
                        <th style={TH}>Name</th>
                        <th style={TH}>Thesis Title</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {research.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}>
                            <select
                              value={r.degree || ""}
                              disabled={sectionApplicability.research === "notApplicable"}
                              onChange={(event) => setRes(i, "degree", event.target.value)}
                              style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontSize: 11, fontFamily: "Georgia, serif" }}
                            >
                              <option value="">Select</option>
                              <option value="PhD">PhD</option>
                              <option value="PG">PG</option>
                            </select>
                          </td>
                          <td style={TD}><TI val={r.name} readOnly={sectionApplicability.research === "notApplicable"} onChange={(v) => setRes(i, "name", v)} textOnly /></td>
                          <td style={TD}><TI val={r.thesis} readOnly={sectionApplicability.research === "notApplicable"} onChange={(v) => setRes(i, "thesis", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`res-${i}`} docs={docs} setDocs={setDocs} readOnly={sectionApplicability.research === "notApplicable"} /></td>
                          <td style={TD}><ViewCell id={`res-${i}`} docs={docs} /></td>
                          <td style={TDS}><RO val={sectionApplicability.research === "notApplicable" ? "0" : researchGuidanceScore(r).toFixed(1)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Score (Max {sectionApplicability.research === "notApplicable" ? 0 : 30})</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{researchScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setResearch((p) => [...p, { degree: "PhD", name: "", thesis: "", score: "" }])} onDel={() => setResearch((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={research.length > 1} />
                  </>)}
                </div>

                {/* B4(b). Research / Consultancy Internal Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B4(b). Ongoing & Completed Research / Consultancy Internal Projects - Max 15 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Funding Agency</th>
                        <th style={TH}>Date of Sanction</th>
                        <th style={TH}>Grant Amount</th>
                        <th style={TH}>Role PI / Co-PI / Consultant</th>
                        <th style={TH}>Status</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects2.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setPrj2(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.agency} onChange={(v) => setPrj2(i, "agency", v)} textOnly /></td>
                          <td style={TD}><TI val={r.date} onChange={(v) => setPrj2(i, "date", maskDateDDMMYYYY(v))} placeholder="DD/MM/YYYY" /></td>
                          <td style={TD}><TI val={r.amount} numeric onChange={(v) => setPrj2(i, "amount", v)} /></td>
                          <td style={TD}><TI val={r.role} onChange={(v) => setPrj2(i, "role", v)} textOnly /></td>
                          <td style={TD}><TI val={r.status} onChange={(v) => setPrj2(i, "status", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`project2-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`project2-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setPrj2(i, "score", v)} center max={SCORE_LIMITS.researchInternalProjects} /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={9}>Total Score (Max 15)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{projectBScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProjects2((p) => [...p, { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "" }])} onDel={() => setProjects2((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={projects2.length > 1} />
                </div>

                {/* B4(c). Research / Consultancy External Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B4(c). Ongoing & Completed Research / Consultancy External Projects - Max 30 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Funding Agency</th>
                        <th style={TH}>Date of Sanction</th>
                        <th style={TH}>Grant Amount</th>
                        <th style={TH}>Role PI / Co-PI / Consultant</th>
                        <th style={TH}>Status</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {externalProjects.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setExtPrj(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.agency} onChange={(v) => setExtPrj(i, "agency", v)} textOnly /></td>
                          <td style={TD}><TI val={r.date} onChange={(v) => setExtPrj(i, "date", maskDateDDMMYYYY(v))} placeholder="DD/MM/YYYY" /></td>
                          <td style={TD}><TI val={r.amount} numeric onChange={(v) => setExtPrj(i, "amount", v)} /></td>
                          <td style={TD}><TI val={r.role} onChange={(v) => setExtPrj(i, "role", v)} textOnly /></td>
                          <td style={TD}><TI val={r.status} onChange={(v) => setExtPrj(i, "status", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`externalProject-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`externalProject-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setExtPrj(i, "score", v)} center max={SCORE_LIMITS.researchExternalProjects} /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={9}>Total Score (Max 30)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{externalProjectScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setExternalProjects((p) => [...p, { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "" }])} onDel={() => setExternalProjects((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={externalProjects.length > 1} />
                </div>

                {/* B5(a). Patents (IPR) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B5(a). Patents (IPR) — Max 40 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>National / International</th>
                        <th style={TH}>Date</th>
                        <th style={TH}>Status</th>
                        <th style={TH}>File No.</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patents.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setPat(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setPat(i, "type", v)} textOnly /></td>
                          <td style={TD}><TI val={r.date} onChange={(v) => setPat(i, "date", maskDateDDMMYYYY(v))} placeholder="DD/MM/YYYY" /></td>
                          <td style={TD}><TI val={r.status} onChange={(v) => setPat(i, "status", v)} textOnly /></td>
                          <td style={TD}><TI val={r.fileNo} onChange={(v) => setPat(i, "fileNo", v)} /></td>
                          <td style={TD}><DocCell id={`pat-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`pat-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setPat(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={8}>Total Patents Score (Max 40)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{patentScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setPatents((p) => [...p, { title: "", type: "", date: "", status: "", fileNo: "", score: "" }])} onDel={() => setPatents((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={patents.length > 1} />
                </div>

                {/* B5(b). Awards */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B5(b). Awards — Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Award Title</th>
                        <th style={TH}>Date</th>
                        <th style={TH}>Agency</th>
                        <th style={TH}>Level</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awards.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setAwd(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.date} onChange={(v) => setAwd(i, "date", maskDateDDMMYYYY(v))} placeholder="DD/MM/YYYY" /></td>
                          <td style={TD}><TI val={r.agency} onChange={(v) => setAwd(i, "agency", v)} textOnly /></td>
                          <td style={TD}><TI val={r.level} onChange={(v) => setAwd(i, "level", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`awd-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`awd-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setAwd(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total Awards Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{awardScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setAwards((p) => [...p, { title: "", type: "", date: "", agency: "", level: "", score: "" }])} onDel={() => setAwards((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={awards.length > 1} />
                </div>

                {/* B6. Invited Lectures / Resource Person / Paper Presentations */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B6. Invited Lectures / Resource Person / Paper Presentations — Max 30 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Type</th>
                        <th style={TH}>Organization</th>
                        <th style={TH}>Level</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confs.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setConf(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setConf(i, "type", v)} textOnly /></td>
                          <td style={TD}><TI val={r.org} onChange={(v) => setConf(i, "org", v)} /></td>
                          <td style={TD}><TI val={r.level} onChange={(v) => setConf(i, "level", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`conf-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`conf-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setConf(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total Score (Max 30)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{confScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setConfs((p) => [...p, { title: "", type: "", org: "", level: "", score: "" }])} onDel={() => setConfs((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={confs.length > 1} />
                </div>

                {/* B7(a). Submitted Research Proposals */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B7(a). Submitted Research Proposals — Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title of Proposal</th>
                        <th style={TH}>Duration</th>
                        <th style={TH}>Funding Agency</th>
                        <th style={TH}>Grant Amount Requested</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposals.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setProp(i, "title", v)} textOnly /></td>
                          <td style={TD}><TI val={r.duration} onChange={(v) => setProp(i, "duration", v)} /></td>
                          <td style={TD}><TI val={r.agency} onChange={(v) => setProp(i, "agency", v)} textOnly /></td>
                          <td style={TD}><TI val={r.amount} numeric onChange={(v) => setProp(i, "amount", v)} /></td>
                          <td style={TD}><DocCell id={`prop-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`prop-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setProp(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{proposalScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProposals((p) => [...p, { title: "", duration: "", agency: "", amount: "", score: "" }])} onDel={() => setProposals((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={proposals.length > 1} />
                </div>

                {/* B7(b). Product Developed */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B7(b). Product Developed and Used by Students in Lab / Commercialized — Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Details of Product</th>
                        <th style={TH}>Used by Students in Lab / Commercialized</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setProd(i, "details", v)} /></td>
                          <td style={TD}><TI val={r.usage} onChange={(v) => setProd(i, "usage", v)} /></td>
                          <td style={TD}><DocCell id={`prod-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`prod-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setProd(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{productScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProducts((p) => [...p, { details: "", usage: "", score: "" }])} onDel={() => setProducts((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={products.length > 1} />
                </div>

                {/* B8(a). FDP / Workshops Attended */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B8(a). FDP / Workshops Attended - Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Program</th>
                        <th style={TH}>Duration</th>
                        <th style={TH}>Organization</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fdps.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.program} onChange={(v) => setFdp(i, "program", v)} /></td>
                          <td style={TD}><TI val={r.duration} onChange={(v) => setFdp(i, "duration", v)} /></td>
                          <td style={TD}><TI val={r.org} onChange={(v) => setFdp(i, "org", v)} /></td>
                          <td style={TD}><DocCell id={`fdp-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`fdp-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setFdp(i, "score", v)} center max={SCORE_LIMITS.fdpRow} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setFdps((p) => [...p, { program: "", duration: "", org: "", score: "" }])} onDel={() => setFdps((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={fdps.length > 1} />
                </div>

                {/* B8(b). Industrial Training */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B8(b). Industrial Training</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Company</th>
                        <th style={TH}>Duration</th>
                        <th style={TH}>Nature</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {training.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.company} onChange={(v) => setTrain(i, "company", v)} /></td>
                          <td style={TD}><TI val={r.duration} onChange={(v) => setTrain(i, "duration", v)} /></td>
                          <td style={TD}><TI val={r.nature} onChange={(v) => setTrain(i, "nature", v)} /></td>
                          <td style={TD}><DocCell id={`train-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`train-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setTrain(i, "score", v)} center max={SCORE_LIMITS.fdpRow} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setTraining((p) => [...p, { company: "", duration: "", nature: "", score: "" }])} onDel={() => setTraining((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={training.length > 1} />
                  <table style={{ ...T, marginTop: 8 }}>
                    <tbody>
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total B8 Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{b8Score.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </SC>
            )}

            {(hodAppraisalTab === "partA" || hodAppraisalTab === "partB") && !appraisalLocked && (
              <SectionSaveFooter
                label={hodAppraisalTab === "partA" ? "Part A" : "Part B"}
                saved={Boolean(sectionSaveStatus[hodAppraisalTab])}
                saving={savingSection === hodAppraisalTab}
                locked={appraisalLocked}
                onSave={() => handleSaveCurrentSection(hodAppraisalTab)}
              />
            )}

            {/* Summary Tab */}
            {hodAppraisalTab === "summary" && (
              <SC title="Appraisal Summary & Submission" accent="#10b981">
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
                  <tbody>
                    {[
                      ["Part A — Teaching & Activities", partATotal, effectivePartAMax, "#6366f1"],
                      ["Part B — Research & Contributions", partBTotal, effectivePartBMax, "#7c3aed"],
                      ["Grand Total", grandTotal, effectiveGrandMax, g.color],
                    ].map(([label, score, max, color]) => (
                      <tr key={label}>
                        <td style={{ padding: "10px", background: "#f8fafc", fontWeight: 600, border: "1px solid #e2e8f0", width: "50%" }}>{label}</td>
                        <td style={{ padding: "10px", textAlign: "center", border: "1px solid #e2e8f0", color, fontWeight: 700, fontSize: 14 }}>
                          {score.toFixed(1)}/{max}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14, color: "#334155", fontSize: 12, lineHeight: 1.5, cursor: appraisalLocked ? "not-allowed" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={accuracyConfirmed}
                    onChange={(e) => setAccuracyConfirmed(e.target.checked)}
                    disabled={submitting || appraisalLocked}
                    style={{ marginTop: 3 }}
                  />
                  <span>I have verified all the details and confirm that the information provided is correct. I am responsible for the accuracy of this data.</span>
                </label>

                <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                  <button
                    onClick={generateReport}
                    style={{ padding: "10px 28px", background: "#4c1d95", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}
                  >
                    Generate Report
                  </button>
                  <button
                    onClick={handleSubmitAppraisal}
                    disabled={submitting || appraisalLocked || !accuracyConfirmed}
                    style={{ padding: "10px 28px", background: appraisalLocked || !accuracyConfirmed ? "#64748b" : "#059669", color: "#fff", border: "none", borderRadius: 7, cursor: appraisalLocked || !accuracyConfirmed ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif", opacity: submitting ? 0.7 : 1 }}
                  >
                    {appraisalLocked ? "Submitted & Locked" : submitting ? "Submitting..." : "✔ Submit Appraisal"}
                  </button>
                </div>
              </SC>
            )}
          </div>
            </div>
          </div>
        )}

        {/* APPROVALS TAB */}
        {(activeMainTab === "facultyApprovals" || activeMainTab === "hodApprovals") && !reviewingFaculty && !reviewingHod && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.5 }}>
                  {activeMainTab === "facultyApprovals" ? "Faculty's Appraisal" : "HOD's Appraisal"}
                </h1>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>{sessionStorage.getItem("department") || ""} · AY {APP_INFO.DEFAULT_AY}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: "#fef3c7", color: "#92400e" }}>
                  ⏳ {activeMainTab === "facultyApprovals" ? facultyPendingCount : hodPendingCount} Pending
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: "#d1fae5", color: "#065f46" }}>
                  ✔ {activeMainTab === "facultyApprovals" ? facultyReviewedCount : hodReviewedCount} Reviewed
                </div>
              </div>
            </div>

            {/* Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#fff", borderRadius: 9, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Filter:</span>
              {["All", "Pending Review", "Reviewed"].map(f => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  style={{ fontSize: 11, padding: "4px 12px", border: "1px solid #e2e8f0", borderRadius: 20, cursor: "pointer", fontFamily: "Georgia, serif", background: filterStatus === f ? "#0f172a" : "none", color: filterStatus === f ? "#f1f5f9" : "#475569" }}>
                  {f}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
              {filtered.map(item => {
                const itemSummary = standardSubmittedScoreSummary(item);
                const courseFilePartA = Array.isArray(item.courseFile)
                  ? (() => {
                      const filled = item.courseFile.filter(row => String(row?.score ?? "").trim() !== "");
                      return filled.length ? filled.reduce((total, row) => total + courseFileRowScore(row), 0) / filled.length : 0;
                    })()
                  : n(item.courseFile?.score);
                const partA = [
                  ...(item.lectures || []).map(r => n(r.score)),
                  courseFilePartA, n(item.innovScore),
                  ...(item.sectionApplicability?.projects === "notApplicable" ? [] : (item.projects || []).map(r => n(r.score))),
                  ...(item.quals || []).map(r => n(r.score)),
                  ...(item.feedback || []).map(r => n(r.score)),
                  ...(item.deptActs || []).map(r => n(r.score)),
                  ...(item.uniActs || []).map(r => n(r.score)),
                  ...(item.society || []).map(r => societyRowScore(r)),
                  ...(item.industry || []).map(r => n(r.score)),
                ].reduce((a, b) => a + b, 0);

                const partB = [
                  ...(item.journals || []).map(r => n(r.score)),
                  ...(item.books || []).map(r => n(r.score)),
                  ...(item.confs || []).map(r => n(r.score)),
                  ...(item.patents || []).map(r => n(r.score)),
                ].reduce((a, b) => a + b, 0);

                const docCount = Object.values(item.docs || {}).reduce((a, arr) => a + arr.length, 0);

                return (
                  <div key={item.id} style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 6px rgba(0,0,0,.07)", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Avatar initials={item.avatar} color={item.avatarColor} size={46} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>{item.designation}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{item.employeeId}</div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
                      {[
                        { label: "Part A", val: itemSummary.partA, max: itemSummary.partAMax, color: "#6366f1" },
                        { label: "Part B", val: itemSummary.partB, max: itemSummary.partBMax, color: "#0ea5e9" },
                        { label: "Docs", val: docCount, max: null, color: "#10b981" },
                      ].map(({ label, val, max, color }) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>
                            {val.toFixed ? val.toFixed(1) : val}{max && <span style={{ fontSize: 9, color: "#94a3b8" }}>/{max}</span>}
                          </div>
                          {max && <ScoreBar score={val} max={max} color={color} />}
                          {!max && <div style={{ fontSize: 9, color: "#94a3b8" }}>files uploaded</div>}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Submitted: {item.submittedOn}</div>
                      <button
                        disabled={reviewLoading === item.id}
                        onClick={async () => {
                          setReviewLoading(item.id);
                          try {
                            const data = await fetchSavedAppraisal({
                              facultyEmail: item.email,
                              academicYear: item.academic_year || item.academicYear || APP_INFO.DEFAULT_AY || "2025-2026",
                            });
                            const form = data?.payload?.form || data?.form || {};
                            const docs = data?.payload?.docs || data?.docs || {};
                            const mergedForm = preserveSavedReviewScores(form, item);
                            const merged = { ...item, ...mergedForm, docs };
                            activeMainTab === "facultyApprovals" ? setReviewingFaculty(merged) : setReviewingHod(merged);
                          } catch (err) {
                            alert(`Unable to open submitted form.\n\n${err.message}`);
                          } finally {
                            setReviewLoading(null);
                          }
                        }}
                        style={{ fontSize: 11, padding: "7px 18px", background: isDirectorReviewed(item) ? "#1e293b" : "#312e81", color: "#f1f5f9", border: "none", borderRadius: 6, cursor: reviewLoading === item.id ? "wait" : "pointer", fontWeight: 700, fontFamily: "Georgia, serif", opacity: reviewLoading === item.id ? 0.7 : 1 }}>
                        {reviewLoading === item.id ? "Loading..." : isDirectorReviewed(item) ? "View Review" : "Review Form"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>All caught up!</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>No forms match the selected filter.</div>
              </div>
            )}
          </>
        )}

        {/* REVIEW PANEL */}
        {activeMainTab === "facultyApprovals" && reviewingFaculty && (
          <ReviewPanel
            faculty={reviewingFaculty}
            onBack={() => setReviewingFaculty(null)}
            onSubmit={(id, total, remarks, sectionScores, reviewConfirmed) => handleSubmitReview("faculty", id, total, remarks, sectionScores, reviewConfirmed)}
            readOnly={isDirectorReviewed(reviewingFaculty)}
          />
        )}
        {activeMainTab === "hodApprovals" && reviewingHod && (
          <ReviewPanel
            faculty={reviewingHod}
            onBack={() => setReviewingHod(null)}
            onSubmit={(id, total, remarks, sectionScores, reviewConfirmed) => handleSubmitReview("hod", id, total, remarks, sectionScores, reviewConfirmed)}
            readOnly={isDirectorReviewed(reviewingHod)}
          />
        )}

        {activeMainTab === "guidelines" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "Georgia, serif", width: "100%" }}>
            <div style={{ background: "#fff", borderRadius: 9, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 16 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>D Y PATIL INTERNATIONAL UNIVERSITY</h2>
              <div style={{ color: "#64748b", fontSize: 13 }}>Akurdi, Pune</div>
              <h3 style={{ margin: "12px 0 0", fontSize: 15, color: "#1e293b" }}>{guidelinesTab === "form" ? "Guidelines for Faculty Appraisal Form — A.Y. 2025-2026" : "Grading Scheme for Faculty Appraisal"}</h3>
            </div>
            {guidelinesTab === "form" && (<>
            <SC title="General Notes" accent="#0f172a">
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
            </SC>
            <SC title="PART A — Teaching & Academic Activities (Maximum Marks 200)" accent="#6366f1">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={TH}>SN</th>
                    <th style={TH}>Nature of Activity</th>
                    <th style={TH}>Max. Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={TDC}>(i)</td>
                    <td style={TD}>
                      <strong>Lectures, seminars, tutorials, practical, contact classes</strong> — based on verifiable records (JUNO record).<br/>
                      No score should be assigned if a teacher has taken less than 70% of the assigned classes.<br/>
                      Score will be 50 if teacher has taken 100% assigned classes to particular subject as specified by University.<br/>
                      If a teacher has taken classes less than the allotted hours but above 80% limit of total, then 2 points will be deducted from 50 for each less hour of classes.<br/>
                      <em>Maximum score of 50 if there is 100% performance | 91–99: 95% of 50 | 81–89: 85% | 70–79: 75%</em><br/>
                      <em>Note: For School of Applied Arts and Crafts, School of Design — 40 Marks can be claimed.</em>
                    </td>
                    <td style={TDC}>50</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>(ii)</td>
                    <td style={TD}>
                      <strong>Course file of subject</strong> — All points covered as per IQAC index, full marks. Proportionate marking to percentage completion applicable up to 60% completion.<br/>
                      <table style={{ marginTop: 6, borderCollapse: "collapse", fontSize: 11 }}>
                        <thead><tr><th style={TH}>Sr No</th><th style={TH}>% Completion</th><th style={TH}>Score</th></tr></thead>
                        <tbody>
                          {[["1","100%","20"],["2","90%","18"],["3","80%","16"],["4","70%","14"],["5","60%","12"],["6","Less than 60%","0"]].map(([n,p,s])=>(
                            <tr key={n}><td style={TDC}>{n}</td><td style={TDC}>{p}</td><td style={TDC}>{s}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <em>Less than 60% — no score claimed.</em>
                    </td>
                    <td style={TDC}>20</td>
                  </tr>
                  <tr>
                    <td style={TDC}>(iii)</td>
                    <td style={TD}>
                      <strong>Use of participatory and innovative teaching-learning methodologies</strong>; updating of subject content, course improvement etc. (Each activity carries 2 marks)<br/>
                      1. Blended learning &nbsp; 2. Virtual Lab &nbsp; 3. Conceptual videos &nbsp; 4. Use of LMS &nbsp; 5. Project Based Learning &nbsp; 6. Open Course Ware (OCW) assignment &nbsp; 7. Quiz &nbsp; 8. Group Discussion &nbsp; 9. Flip classroom &nbsp; 10. Any other innovative teaching learning methods
                    </td>
                    <td style={TDC}>10</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>(iv)</td>
                    <td style={TD}>
                      <strong>Qualification Enhancement</strong><br/>
                      Higher qualification during assessment period: 5 marks<br/>
                      Add-on qualification / certification: 5 marks
                    </td>
                    <td style={TDC}>10</td>
                  </tr>
                  <tr>
                    <td style={TDC}>(v)</td>
                    <td style={TD}>
                      <strong>Guided Students Project</strong> (New schools or if there is no project batch allotted can mention as NA)<br/>
                      Project guided: 3/group | Industrial collaboration/Sponsorship (Max 5 marks) | Project outcome: events/competitions (Max 5 marks)<br/>
                      <em>Note: For School of Applied Arts and Crafts, School of Design — 20 Marks can be claimed.</em><br/>
                      Guided students project other than curriculum: Project apart from curriculum: 5 | Industrial collaboration/Sponsorship: 5 | Any Award for project (Max 5 marks): 5
                    </td>
                    <td style={TDC}>10</td>
                  </tr>
                  <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                    <td style={TDC} colSpan={2}>Total Part A (i+ii+iii+iv+v)</td>
                    <td style={TDC}>100</td>
                  </tr>
                  <tr>
                    <td style={TDC}>B</td>
                    <td style={TD}>
                      <strong>Students' Feedback (Maximum Point 10)</strong><br/>
                      Score will be linearly proportional to feedback. (Score = percentage / 10)<br/>
                      Average score of first and second feedback will be considered per semester at the scale of 10.<br/>
                      If faculty is handling more than one subject, then average score of all the subjects will be considered. (Average Percentage / 10)
                    </td>
                    <td style={TDC}>10</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>C &amp; D</td>
                    <td style={TD}>
                      <strong>Department / School / University Activities (Max 20 / 30)</strong><br/>
                      <em>Department/School Level (Max 20):</em> Short-term one-time activity: 3 marks | Semester/Term-based (3–6 months): 5 marks | Academic Year activity (&gt;6 months): 10 marks<br/>
                      <em>University Level (Max 30):</em> Short-term one-time activity: 10 marks | Semester/Term-based: 20 marks | Academic Year activity: 30 marks
                    </td>
                    <td style={TDC}>20 / 30</td>
                  </tr>
                  <tr>
                    <td style={TDC}>E</td>
                    <td style={TD}>
                      <strong>Contribution to Society through institute/University (Social Activities): 5 marks/activity</strong><br/>
                      Faculty involved in UGC/AICTE initiatives like Induction Program, Unnat Bharat Abhiyan, Yoga Classes, Blood Donation, Techno Social, NSS etc.
                    </td>
                    <td style={TDC}>10</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>F</td>
                    <td style={TD}>
                      <strong>Industry Connect Activities (Max 5 Marks)</strong><br/>
                      1. Inviting company for campus placement: 5 marks/company (proof of invitation letter required, certified by TPO)<br/>
                      2. Providing internships to students: 2 marks/student<br/>
                      3. Signing MOU with industry: 5 marks per active MOU (training institutes not considered)<br/>
                      4. Industry visits: 2 marks per visit (documentary proof required)<br/>
                      5. Establishing centre of excellence with Industry: 5 marks
                    </td>
                    <td style={TDC}>5</td>
                  </tr>
                  <tr>
                    <td style={TDC}>G</td>
                    <td style={TD}>
                      <strong>Annual Confidential Report (Maximum Point 25)</strong><br/>
                      1. Self-motivation (5): List activities/initiatives other than regular load/duties.<br/>
                      2. Punctuality (5): Number of late marks, punctuality in lecture/practical, timely completion of daily report, absentee without intimation.<br/>
                      3. Target based work (5): List tasks allotted, timely completion of allotted work — observed by HOD.<br/>
                      4. Effectiveness (5): Work done without errors &amp; least follow-up — observed by HOD.<br/>
                      5. Obedience (5): To be observed by HOD and Director.
                    </td>
                    <td style={TDC}>25</td>
                  </tr>
                </tbody>
              </table>
            </SC>
            <SC title="PART B — Research & Academic Contributions (Maximum Marks 375)" accent="#7c3aed">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={TH}>S.N.</th>
                    <th style={TH}>APIs</th>
                    <th style={TH}>Particular</th>
                    <th style={TH}>Max. Marks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={TDC}>1</td>
                    <td style={TD}><strong>Research Papers (Published in Journals)</strong><br/><em>(With institute affiliation, Maxi. 4 papers can be claimed)</em></td>
                    <td style={TD}>
                      Refereed Journals — SCI/SCIE/WoS Q1 &amp; Q2: 30/publication + Impact factor score<br/>
                      Refereed Journals — Scopus Q3, Q4: 15/publication + Impact factor score<br/>
                      UGC care listed: 10/publication<br/>
                      Submitted and under review: 5/publication | Submitted and rejected after 1–2 reviews: 10/publication (max 2 in this category)<br/>
                      <strong>Instructions:</strong> Multiple DYPIU authors: 70% first author, 30% each co-author. Additional marks for Impact Factor: up to 5 → 3 marks; 5–10 → 5 marks; above 10 → 10 marks. Joint/collaborative publication: full marks.
                    </td>
                    <td style={TDC}>80 / 120</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>2</td>
                    <td style={TD}><strong>Publications</strong><br/><em>(other than Research papers, Maxi. 2 book chapters)</em></td>
                    <td style={TD}>
                      Books by international publishers: 15/publication | National publishers: 10/publication | Local publisher with ISBN/ISSN: 5/publication<br/>
                      Chapter in Edited Book: 5/publication | Editor of Book (International): 10 | (National): 8 | (Local with ISBN/ISSN): 3<br/>
                      Translation works: Chapter/Research paper: 3 | Book: 8<br/>
                      <strong>Instructions:</strong> Multiple DYPIU authors: 70% first author, 30% each co-author. SoMCS/SoD/SAA: Max 60 marks; Other schools: Max 50.
                    </td>
                    <td style={TDC}>50 / 60</td>
                  </tr>
                  <tr>
                    <td style={TDC}>3</td>
                    <td style={TD}><strong>Creation of ICT mediated Teaching Learning pedagogy and content</strong></td>
                    <td style={TD}>
                      (a) Development of Innovative pedagogy which does not exist globally: 5<br/>
                      (b) MOOCs / Course Builder / Coursera Course: 5/course<br/>
                      (c) E-Content (available online publicly) — video lecture, blog, website etc.: 5<br/>
                      <em>Note: SoMCS max 30; SoD &amp; SAA max 50; Other schools max 20.</em>
                    </td>
                    <td style={TDC}>20 / 30 / 50</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>4</td>
                    <td style={TD}><strong>Research Guidance (Maxi. marks 75)</strong></td>
                    <td style={TD}>
                      (a) Research Guidance (Max 30, if applicable): PhD — 20 for degree awarded, 10 for thesis submitted; PG degree awarded to batch candidate. Joint supervision: 70% supervisor, 30% co-supervisor (7 marks each).<br/>
                      (b) Research Projects Completed (Maxi. 15): Internal Project — Grant received 100% marks.<br/>
                      (c) Research Projects Ongoing (Maxi. 30): &gt;10 lakhs → 15 marks; &lt;10 lakhs → 10 marks.<br/>
                      Consultancy/Testing/Training: up to ₹50k → 3; ₹51k–2L → 5; ₹2L–5L → 10; ₹5L–10L → 15; above ₹10L → 15+3/per 5L.<br/>
                      <em>Note: If no PG/PhD students enrolled, max marks deducted from denominator.</em>
                    </td>
                    <td style={TDC}>75</td>
                  </tr>
                  <tr>
                    <td style={TDC}>5</td>
                    <td style={TD}><strong>Patents (a) + (b) (Maximum marks 50)</strong></td>
                    <td style={TD}>
                      (a) Patent/Product development:<br/>
                      Grant (National): 30/patent | Grant (International): 15/patent | Published: 5/patent | Design Patent: 10/patent | Copyright/Trademark: 3/copyright | Product/Equipment developed/commercialized: 10/product<br/>
                      <em>Max 40 marks</em><br/>
                      (b) Awards/Fellowship/Research awards (Maxi. 10):<br/>
                      International fellowship: 10 | National/state fellowship: 7 | Research excellence awards (External/Internal: 7/5) | Best paper award (International/National): 5
                    </td>
                    <td style={TDC}>50</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>6</td>
                    <td style={TD}><strong>Paper presentation in Seminars/Conferences/full paper in Conference Proceeding</strong></td>
                    <td style={TD}>
                      Paper Publication in Scopus indexed conference: 10/paper<br/>
                      Invited lectures / Resource Person: 10/session<br/>
                      Conference attended: 5/conference<br/>
                      Attended FDP of one week duration or more (Maxi. 2): 5/FDP<br/>
                      Industrial training of minimum 3 days duration: 5 marks<br/>
                      <em>* Paper presented in Seminars/Conferences and also published as full paper in Conference Proceedings will be counted only once.</em>
                    </td>
                    <td style={TDC}>30</td>
                  </tr>
                  <tr>
                    <td style={TDC}>7</td>
                    <td style={TD}><strong>Other research and development activities (Maxi. 20 marks)</strong></td>
                    <td style={TD}>
                      (i) Research proposal submitted: &gt;20 Lacs → 10 marks; &lt;20 Lacs → 5 marks<br/>
                      (ii) Product development in Lab/commercialized (Maximum 10)<br/>
                      <em>Note: SAA &amp; SoD max 10; SoMCS max 30; Other schools max 20.</em>
                    </td>
                    <td style={TDC}>10 / 20 / 30</td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <td style={TDC}>8</td>
                    <td style={TD}><strong>Self Development (Max. marks 10)</strong></td>
                    <td style={TD}>
                      (a) Attended FDP of one week duration or more (Max 5 marks): 5/FDP<br/>
                      (b) Industrial training (Maximum marks 5)<br/>
                      <em>Total B8 score maximum marks 10.</em>
                    </td>
                    <td style={TDC}>10</td>
                  </tr>
                </tbody>
              </table>
            </SC>
            <SC title="Maximum Marks Distribution by School" accent="#0ea5e9">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={TH}>Sr. No</th>
                    <th style={TH}>Criteria</th>
                    <th style={TH}>SAA and SoD (Max Score)</th>
                    <th style={TH}>SoMCS (Max Score)</th>
                    <th style={TH}>SoEMR, SCoE, SCM, SoCSEA (Max Score)</th>
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
                      <td style={TDC}>{sn}</td>
                      <td style={TD}>{criteria}</td>
                      <td style={TDC}>{saa}</td>
                      <td style={TDC}>{mcs}</td>
                      <td style={TDC}>{other}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SC>
            </>)}
            {guidelinesTab === "grading" && (
              <SC title="Grading Scheme for Faculty Appraisal" accent="#059669">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Appraisal</th>
                      <th style={TH}>Maximum Marks</th>
                      <th style={TH}>Assistant Prof.</th>
                      <th style={TH}>Associate Prof.</th>
                      <th style={TH}>Professor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[["Part A","200","180","180","180"],["Part B","375","150","190","220"]].map(([part,max,ap,asc,prof])=>(
                      <tr key={part}>
                        <td style={TD}><strong>{part}</strong></td>
                        <td style={TDC}>{max}</td>
                        <td style={TDC}>{ap}</td>
                        <td style={TDC}>{asc}</td>
                        <td style={TDC}>{prof}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 10 }}>Grade &amp; Marks Distribution</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Sr No</th>
                      <th style={TH}>Grade</th>
                      <th style={TH}>Assistant Prof.</th>
                      <th style={TH}>Associate Prof.</th>
                      <th style={TH}>Professor</th>
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
                        <td style={TDC}>{sn}</td>
                        <td style={{ ...TDC, fontWeight: 800, color }}>{grade}</td>
                        <td style={TDC}>{ap}</td>
                        <td style={TDC}>{asc}</td>
                        <td style={TDC}>{prof}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SC>
            )}
          </div>
          </div>
        )}
      </main>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowLogoutModal(false)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "32px 36px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, fontFamily: "Georgia, serif" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🚪</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a", marginBottom: 6 }}>Confirm Logout</div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
                You are about to log out of <strong>{APP_INFO.PORTAL_NAME}</strong>.<br />Any unsaved changes will be lost.
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, width: "100%" }}>
              <button
  onClick={() => setShowLogoutModal(false)}
  style={{
    flex: 1,
    padding: "10px 0",
    background: "#f1f5f9",
    color: "#475569",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    fontFamily: "Georgia, serif"
  }}
>
  Cancel
</button>

<button
  onClick={() => {
    setShowLogoutModal(false);
    sessionStorage.removeItem("user");
    sessionStorage.clear();
    navigate("/login", { replace: true });
  }}
  style={{
    flex: 1,
    padding: "10px 0",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    fontFamily: "Georgia, serif"
  }}
>
  Yes, Logout
</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

