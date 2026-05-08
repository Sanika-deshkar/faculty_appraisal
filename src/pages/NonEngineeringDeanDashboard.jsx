import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ACR_DETAIL_POINTS, SOCIETY_LABELS, ACR_LABELS, MAX_SCORES, APP_INFO } from "../constants/formConfig";
import { HodInput } from "../components/Inputs";
import { loadAppraisalDocuments, loadSavedAppraisal, saveAppraisal, saveAppraisalDraftSection } from "../services/appraisalPersistence";
import { api } from "../services/api";
import { fetchReviewQueueForRole, submitWorkflowReview } from "../services/reviewWorkflow";
import { clampScore, effectiveMaxScore, clearDraft, draftKeyFor, feedbackAverage, feedbackRowScore, feedbackSectionScore, isValidDDMMYYYY, loadDraft, maskDateDDMMYYYY, saveDraft, scoreRemaining, sumSectionScore, validateCompleteRows } from "../utils/appraisalFormUtils";
import { DEAN_TRACKS, getSchoolKey, getSchoolsByDeanTrack } from "../constants/universityHierarchy";
import { FORM_TYPES, formTypeForSchool } from "../constants/formRouting";
import { reviewedStatusFor, profileFromsessionStorage } from "../utils/hierarchy";
import { MediaCommAuthorityReviewPanel } from "./MediaCommDashboard";
import { DesignArtsAuthorityReviewPanel } from "./DesignArtsDashboard";

const NON_ENGINEERING_SCHOOLS = getSchoolsByDeanTrack(DEAN_TRACKS.NON_ENGINEERING);
const NON_ENGINEERING_SCHOOL_VALUES = NON_ENGINEERING_SCHOOLS.flatMap((school) => [
  school.code,
  school.name,
  school.label,
]);
const NON_ENGINEERING_SCHOOL_CODES = NON_ENGINEERING_SCHOOLS.map((school) => school.code);
const SCHOOL_VISUALS = {
  SoC: { icon: "▣", color: "#14b8a6", bg: "#ecfeff" },
  SoMCS: { icon: "◰", color: "#6366f1", bg: "#eef2ff" },
  CioD: { icon: "▰", color: "#ec4899", bg: "#fdf2f8" },
  SoAA: { icon: "●", color: "#7c3aed", bg: "#f3e8ff" },
};

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

// ─── Sub-components ───────────────────────────────────────────────────────────
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
    "Pending Review":         { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    "HOD Reviewed":           { bg: "#ede9fe", color: "#5b21b6", dot: "#7c3aed" },
    "Director Reviewed":      { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
    "Director Approved":      { bg: "#cffafe", color: "#164e63", dot: "#06b6d4" },
    "Pending Dean Review":    { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    "Dean Reviewed":          { bg: "#d1fae5", color: "#065f46", dot: "#10b981" },
    Rejected:                 { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
    "Dean Rejected":          { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
  };
  const s = map[status] || map["Pending Review"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {status}
    </span>
  );
}
function RO({ val, center }) {
  return <span style={{ fontSize: 11, fontFamily: "Georgia, serif", color: "#1e293b", display: "block", textAlign: center ? "center" : "left" }}>{val || <span style={{ color: "#cbd5e1" }}>—</span>}</span>;
}
function DeanInput({ val, onChange }) {
  return (
    <input type="number" min="0" step="0.5" value={val ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{ width: 58, textAlign: "center", border: "1.5px solid #7c3aed", borderRadius: 5, padding: "3px 5px", fontSize: 11, fontFamily: "Georgia, serif", outline: "none", background: "#faf5ff" }}
    />
  );
}
function SelfInput({ val, onChange }) {
  return (
    <input type="number" min="0" step="0.5" value={val ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{ width: 58, textAlign: "center", border: "1.5px solid #10b981", borderRadius: 5, padding: "3px 5px", fontSize: 11, fontFamily: "Georgia, serif", outline: "none", background: "#f0fff8" }}
    />
  );
}
// ─── Input & Table Controls (Self-Appraisal Mode) ──────────────────────────────
function TI({ val, onChange, center, placeholder, readOnly = false, numeric = false, textOnly = false }) {
  const [textErr, setTextErr] = useState(false);
  const handleChange = (e) => {
    if (readOnly) return;
    let v = e.target.value;
    if (numeric) {
      v = v.replace(/[^0-9.]/g, "").replace(/^\./, "0.").replace(/(\.\d*)\./g, "$1");
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
        inputMode={numeric ? "decimal" : undefined}
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
    const oversized = selectedFiles.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      setUploadError("File exceeds 10 MB limit.");
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
        <input ref={ref} type="file" style={{ display: "none" }} disabled={readOnly} onChange={(e) => handleFiles(e.target.files)} />
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
function SectionSaveFooter({ label, saved, saving, locked, onSave }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ color: saved ? "#047857" : "#64748b", fontSize: 12, fontWeight: 700 }}>
        {locked ? "Submitted and locked" : saved ? `${label} saved. Next section unlocked.` : `Save ${label} to unlock the next section.`}
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

function SC({ title, subtitle, accent = "#7c3aed", children }) {
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

// ─── Table style constants ────────────────────────────────────────────────────
const T = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const TH = { border: "1px solid #cbd5e1", padding: "7px 8px", background: "#0f172a", color: "#cbd5e1", fontWeight: 700, textAlign: "center", fontSize: 10 };
const TH_HOD = { ...TH, background: "#312e81", color: "#c7d2fe" };
const TH_DIR = { ...TH, background: "#065f46", color: "#6ee7b7" };
const TH_DEAN = { ...TH, background: "#4c1d95", color: "#ddd6fe" };
const TD = { border: "1px solid #e2e8f0", padding: "4px 6px", verticalAlign: "middle" };
const TDC = { ...TD, textAlign: "center" };
const TDS = { ...TD, textAlign: "center", background: "#f8fafc", minWidth: 52 };
const TDS_HOD = { ...TDS, background: "#f0f4ff" };
const TDS_DIR = { ...TDS, background: "#f0fdf4", minWidth: 62 };
const TDS_DEAN = { ...TDS, background: "#faf5ff", minWidth: 62 };
const TDV = { ...TD, background: "#fafbff", minWidth: 110 };

// ─── Faculty Form in HOD Review Mode ─────────────────────────────────────────
function FacultyReviewForm({ faculty, hodData, setHodData }) {
  const set = (section, idx, field, val) => {
    setHodData(prev => {
      const updated = { ...prev };
      if (!updated[section]) updated[section] = JSON.parse(JSON.stringify(faculty[section] || []));
      if (idx === null) { updated[section] = { ...updated[section], [field]: val }; }
      else { updated[section] = updated[section].map((r, i) => i === idx ? { ...r, [field]: val } : r); }
      return updated;
    });
  };
  const setScalar = (key, val) => setHodData(prev => ({ ...prev, [key]: val }));

  const get = (section, idx, field) => {
    if (hodData[section]) {
      const s = hodData[section];
      return idx === null ? (s[field] ?? faculty[section]?.[field] ?? "") : (s[idx]?.[field] ?? faculty[section]?.[idx]?.[field] ?? "");
    }
    return idx === null ? (faculty[section]?.[field] ?? "") : (faculty[section]?.[idx]?.[field] ?? "");
  };
  const getS = (key) => hodData[key] ?? faculty[key] ?? "";

  const { info, lectures, courseFile, projects, quals, feedback, deptActs, uniActs, society, industry, acr, journals, books, ict, research, projects2, externalProjects, patents, awards, confs, proposals, products, fdps, training, docs } = faculty;

  const rows = (arr) => arr && arr.length > 0 ? arr : [{}];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* HOD Review Banner */}
      <div style={{ background: "linear-gradient(90deg,#312e81,#4338ca)", color: "#e0e7ff", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <div>
          <strong>HOD Review Mode</strong> — Faculty data is read-only. Only <span style={{ color: "#c7d2fe", fontWeight: 700 }}>HOD Score</span> columns are editable. Click <span style={{ color: "#c7d2fe" }}>📄 View Doc</span> links to open uploaded files.
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
              <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                  <td style={TDS_HOD}><HodInput val={get("lectures", i, "hod")} onChange={v => set("lectures", i, "hod", v)} /></td>
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
            <th style={TH}>Course</th><th style={TH}>Title</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={TD}><RO val={courseFile?.course} /></td>
              <td style={TD}><RO val={courseFile?.title} /></td>
              <td style={TDC}><RO val={courseFile?.details} center /></td>
              <td style={TDV}><ViewDocsCell docKey="cf-0" docs={docs} /></td>
              <td style={TDS}><RO val={courseFile?.score} center /></td>
              <td style={TDS_HOD}><HodInput val={get("courseFile", null, "hod")} onChange={v => set("courseFile", null, "hod", v)} /></td>
            </tr>
          </tbody>
        </table>
      </SC>

      {/* A3: Innovative Teaching */}
      <SC title="A3. Innovative Teaching-Learning (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>Method</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={TD}>Innovative / participatory teaching methods used</td>
              <td style={TDS}><RO val={faculty.innovScore} center /></td>
              <td style={TDS_HOD}><HodInput val={getS("innovHod")} onChange={v => setScalar("innovHod", v)} /></td>
            </tr>
          </tbody>
        </table>
      </SC>

      {/* A4: Projects */}
      <SC title="A4. Projects (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Project Type</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(projects).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDV}><ViewDocsCell docKey={`proj-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("projects", i, "hod")} onChange={v => set("projects", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* A5: Qualification */}
      <SC title="A5. Qualification Enhancement (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Description</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(quals).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDV}><ViewDocsCell docKey={`qual-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("quals", i, "hod")} onChange={v => set("quals", i, "hod", v)} /></td>
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
            <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                <td style={TDS_HOD}><HodInput val={get("feedback", i, "hod")} onChange={v => set("feedback", i, "hod", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(deptActs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.activity} /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`dept-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("deptActs", i, "hod")} onChange={v => set("deptActs", i, "hod", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(uniActs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.activity} /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`uni-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("uniActs", i, "hod")} onChange={v => set("uniActs", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* E: Society */}
      <SC title="E. Contribution to Society (Max 10)" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Activity</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(society).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`soc-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("society", i, "hod")} onChange={v => set("society", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* F: Industry */}
      <SC title="F. Industry Connect (Max 5)" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Industry Name</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(industry).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.name} /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`ind-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("industry", i, "hod")} onChange={v => set("industry", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* G: ACR */}
      <SC title="G. Annual Confidential Report (Max 25)" accent="#ef4444">
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>⚠️ ACR is assessed by HOD only — faculty does not fill scores.</div>
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Parameter</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(acr).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDS_HOD}><HodInput val={get("acr", i, "hod")} onChange={v => set("acr", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* ── PART B ── */}
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#ede9fe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>PART B — Research & Academic Contributions</div>

      {/* B1: Journals */}
      <SC title="B1. Research Papers / Journal Publications (Max 120)" accent="#7c3aed">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Journal</th>
              <th style={TH}>ISSN</th><th style={TH}>Indexing</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                  <td style={TDS_HOD}><HodInput val={get("journals", i, "hod")} onChange={v => set("journals", i, "hod", v)} /></td>
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
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                  <td style={TDS_HOD}><HodInput val={get("books", i, "hod")} onChange={v => set("books", i, "hod", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                <td style={TDS_HOD}><HodInput val={get("ict", i, "hod")} onChange={v => set("ict", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B4: Research Guidance */}
      <SC title="B4(a). Research Guidance — PhD / PG (Max 30)" accent="#059669">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Degree</th><th style={TH}>Student Name</th><th style={TH}>Status</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(research).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TDC}><RO val={r.degree} center /></td>
                <td style={TD}><RO val={r.name} /></td>
                <td style={TD}><RO val={r.thesis} /></td>
                <td style={TDV}><ViewDocsCell docKey={`res-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("research", i, "hod")} onChange={v => set("research", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <SC title="B4(b). Research / Consultancy Internal Projects (Max 45)" accent="#059669">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Funding Agency</th>
              <th style={TH}>Date of Sanction</th><th style={TH}>Grant Amount</th><th style={TH}>Role PI / Co-PI / Consultant</th><th style={TH}>Status</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
            </tr></thead>
            <tbody>
              {rows(projects2).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.agency} /></td>
                  <td style={TDC}><RO val={r.date} center /></td>
                  <td style={TDC}><RO val={r.amount} center /></td>
                  <td style={TD}><RO val={r.role} /></td>
                  <td style={TD}><RO val={r.status} /></td>
                  <td style={TDV}><ViewDocsCell docKey={`project2-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_HOD}><HodInput val={get("projects2", i, "hod")} onChange={v => set("projects2", i, "hod", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      <SC title="B4(c). Research / Consultancy External Projects (Max 45)" accent="#059669">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Funding Agency</th>
              <th style={TH}>Date of Sanction</th><th style={TH}>Grant Amount</th><th style={TH}>Role PI / Co-PI / Consultant</th><th style={TH}>Status</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
            </tr></thead>
            <tbody>
              {rows(externalProjects).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.agency} /></td>
                  <td style={TDC}><RO val={r.date} center /></td>
                  <td style={TDC}><RO val={r.amount} center /></td>
                  <td style={TD}><RO val={r.role} /></td>
                  <td style={TD}><RO val={r.status} /></td>
                  <td style={TDV}><ViewDocsCell docKey={`externalProject-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_HOD}><HodInput val={get("externalProjects", i, "hod")} onChange={v => set("externalProjects", i, "hod", v)} /></td>
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
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                  <td style={TDS_HOD}><HodInput val={get("patents", i, "hod")} onChange={v => set("patents", i, "hod", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                <td style={TDS_HOD}><HodInput val={get("awards", i, "hod")} onChange={v => set("awards", i, "hod", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                <td style={TDS_HOD}><HodInput val={get("confs", i, "hod")} onChange={v => set("confs", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

            {/* B7(a): Proposals */}
      <SC title="B7(a). Submitted Research Proposals (Max 10)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title of Proposal</th><th style={TH}>Duration</th>
            <th style={TH}>Funding Agency</th><th style={TH}>Grant Amount Requested</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
                <td style={TDS_HOD}><HodInput val={get("proposals", i, "hod")} onChange={v => set("proposals", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B7(b): Product Developed */}
      <SC title="B7(b). Product Developed and Used by Students in Lab / Commercialized (Max 10)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Details of Product</th><th style={TH}>Used by Students in Lab / Commercialized</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(products).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TD}><RO val={r.usage} /></td>
                <td style={TDV}><ViewDocsCell docKey={`prod-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("products", i, "hod")} onChange={v => set("products", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B8: Self Dev */}
      <SC title="B8(a). FDP / Workshops Attended (Max 5)" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Program</th><th style={TH}>Duration</th><th style={TH}>Organizer</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(fdps).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.program} /></td>
                <td style={TDC}><RO val={r.duration} center /></td>
                <td style={TD}><RO val={r.org} /></td>
                <td style={TDV}><ViewDocsCell docKey={`fdp-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("fdps", i, "hod")} onChange={v => set("fdps", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <SC title="B8(b). Industrial Training (Max 5)" accent="#10b981">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Company</th><th style={TH}>Duration</th><th style={TH}>Nature</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(training).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.company} /></td>
                <td style={TDC}><RO val={r.duration} center /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`train-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><HodInput val={get("training", i, "hod")} onChange={v => set("training", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>
    </div>
  );
}

// ─── Full Review Panel (opened when HOD clicks Review) ────────────────────────
function ReviewPanel({ faculty, onBack, onSubmit }) {
  const [hodData, setHodData] = useState({});
  const [remarks, setRemarks] = useState(faculty.hodRemarks || "");
  const [tab, setTab] = useState("form");

  // Compute HOD total from hodData
  const calcHodScore = () => {
    const get = (section, idx, field) => {
      if (hodData[section]) {
        const s = hodData[section];
        return idx === null ? n(s[field]) : n(s[idx]?.[field]);
      }
      return idx === null ? n(faculty[section]?.[field]) : n(faculty[section]?.[idx]?.[field]);
    };
    const getS = (key) => n(hodData[key] ?? faculty[key]);

    const lec = (faculty.lectures || []).reduce((a, _, i) => a + get("lectures", i, "hod"), 0);
    const cf = get("courseFile", null, "hod");
    const innov = getS("innovHod");
    const proj = (faculty.projects || []).reduce((a, _, i) => a + get("projects", i, "hod"), 0);
    const qual = (faculty.quals || []).reduce((a, _, i) => a + get("quals", i, "hod"), 0);
    const fb = (faculty.feedback || []).reduce((a, _, i) => a + get("feedback", i, "hod"), 0);
    const dept = (faculty.deptActs || []).reduce((a, _, i) => a + get("deptActs", i, "hod"), 0);
    const uni = (faculty.uniActs || []).reduce((a, _, i) => a + get("uniActs", i, "hod"), 0);
    const soc = (faculty.society || []).reduce((a, _, i) => a + get("society", i, "hod"), 0);
    const ind = (faculty.industry || []).reduce((a, _, i) => a + get("industry", i, "hod"), 0);
    const acrT = (faculty.acr || []).reduce((a, _, i) => a + get("acr", i, "hod"), 0);
    const partA = lec + cf + innov + proj + qual + fb + dept + uni + soc + ind + acrT;

    const jour = (faculty.journals || []).reduce((a, _, i) => a + get("journals", i, "hod"), 0);
    const bk = (faculty.books || []).reduce((a, _, i) => a + get("books", i, "hod"), 0);
    const ictT = (faculty.ict || []).reduce((a, _, i) => a + get("ict", i, "hod"), 0);
    const res = (faculty.research || []).reduce((a, _, i) => a + get("research", i, "hod"), 0);
    const resProjects = (faculty.projects2 || []).reduce((a, _, i) => a + get("projects2", i, "hod"), 0);
    const externalResProjects = (faculty.externalProjects || []).reduce((a, _, i) => a + get("externalProjects", i, "hod"), 0);
    const pat = (faculty.patents || []).reduce((a, _, i) => a + get("patents", i, "hod"), 0);
    const awd = (faculty.awards || []).reduce((a, _, i) => a + get("awards", i, "hod"), 0);
    const conf = (faculty.confs || []).reduce((a, _, i) => a + get("confs", i, "hod"), 0);
    const prop = (faculty.proposals || []).reduce((a, _, i) => a + get("proposals", i, "hod"), 0);
    const prod = (faculty.products || []).reduce((a, _, i) => a + get("products", i, "hod"), 0);
    const fdp = (faculty.fdps || []).reduce((a, _, i) => a + get("fdps", i, "hod"), 0);
    const train = (faculty.training || []).reduce((a, _, i) => a + get("training", i, "hod"), 0);
    const partB = jour + bk + ictT + res + resProjects + externalResProjects + pat + awd + conf + prop + prod + fdp + train;

    return { partA, partB, total: partA + partB };
  };

  const { partA, partB, total } = calcHodScore();
  const g = grade(total, 620);

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
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: "#94a3b8", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>HOD Part A</div>
            <div style={{ color: "#818cf8", fontWeight: 800, fontSize: 16 }}>{partA.toFixed(1)}</div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: "#94a3b8", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>HOD Part B</div>
            <div style={{ color: "#38bdf8", fontWeight: 800, fontSize: 16 }}>{partB.toFixed(1)}</div>
          </div>
          <div style={{ background: g.bg, border: `2px solid ${g.color}40`, borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ color: g.color, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>HOD Total</div>
            <div style={{ color: g.color, fontWeight: 800, fontSize: 16 }}>{total.toFixed(1)}<span style={{ fontSize: 10, color: "#94a3b8" }}>/620</span></div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["form", "📋 Review Form"], ["remarks", "✏️ Remarks & Submit"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: "7px 18px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700, background: tab === id ? "#312e81" : "#e2e8f0", color: tab === id ? "#e0e7ff" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "form" && <FacultyReviewForm faculty={faculty} hodData={hodData} setHodData={setHodData} />}

      {tab === "remarks" && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "22px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: 15 }}>HOD Remarks & Final Submission</h3>

          {/* Score Summary */}
          <table style={{ ...T, marginBottom: 18 }}>
            <thead><tr>
              <th style={TH}>Section</th><th style={TH}>Max</th>
              <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
            </tr></thead>
            <tbody>
              {[
                ["Part A — Teaching & Activities", 200, faculty.lectures?.reduce((a, r) => a + n(r.score), 0) || 0, partA],
                ["Part B — Research & Contributions", 420, faculty.journals?.reduce((a, r) => a + n(r.score), 0) || 0, partB],
              ].map(([label, max, fac, hod]) => (
                <tr key={label}>
                  <td style={TD}>{label}</td>
                  <td style={TDC}>{max}</td>
                  <td style={TDS}>{fac.toFixed(1)}</td>
                  <td style={{ ...TDS_HOD, fontWeight: 700, color: "#312e81" }}>{hod.toFixed(1)}</td>
                </tr>
              ))}
              <tr style={{ background: "#d1fae5", fontWeight: 700 }}>
                <td style={TD}>Grand Total</td>
                <td style={TDC}>620</td>
                <td style={TDS}>—</td>
                <td style={{ ...TDS_HOD, color: "#065f46", fontSize: 14 }}>{total.toFixed(1)}</td>
              </tr>
              <tr style={{ background: g.bg }}>
                <td style={TD} colSpan={3}><strong>Grade</strong></td>
                <td style={{ ...TDC, color: g.color, fontWeight: 800 }}>{g.label}</td>
              </tr>
            </tbody>
          </table>

          <label style={{ fontWeight: 700, fontSize: 13, color: "#334155", display: "block", marginBottom: 6 }}>HOD Remarks</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={4}
            placeholder="Enter your remarks, observations, and recommendations for this faculty member..."
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", fontSize: 12, fontFamily: "Georgia, serif", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }} />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onBack} style={{ padding: "9px 22px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "Georgia, serif" }}>Cancel</button>
            <button onClick={() => onSubmit(faculty.id, total, remarks)}
              style={{ padding: "10px 28px", background: "#059669", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>
              ✔ Submit HOD Review
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const DEAN_REVIEW_PART_A_KEYS = ["lectures", "courseFile", "projects", "quals", "feedback", "deptActs", "uniActs", "society", "industry", "acr"];
const DEAN_REVIEW_PART_B_KEYS = ["journals", "books", "ict", "research", "projects2", "externalProjects", "patents", "awards", "confs", "proposals", "products", "fdps", "training"];
const DEAN_REVIEW_ARRAY_KEYS = [...DEAN_REVIEW_PART_A_KEYS, ...DEAN_REVIEW_PART_B_KEYS];

const deanScorePayload = (approval, deanData) => {
  const payload = {};

  DEAN_REVIEW_ARRAY_KEYS.forEach((key) => {
    const rows = Array.isArray(approval[key]) ? approval[key] : [];
    payload[key] = rows.map((row, index) => ({
      ...row,
      dean: deanData[key]?.[index]?.dean ?? row.dean ?? "",
    }));
  });

  payload.innovativeTeaching = {
    dean: deanData.innovativeTeaching?.dean ?? approval.innovDean ?? "",
  };

  return payload;
};

const sumDeanRows = (payload, keys) =>
  keys.reduce((total, key) => total + (payload[key] || []).reduce((sum, row) => sum + n(row.dean), 0), 0);

const deanScoreTotals = (payload) => {
  const partA = sumDeanRows(payload, DEAN_REVIEW_PART_A_KEYS) + n(payload.innovativeTeaching?.dean);
  const partB = sumDeanRows(payload, DEAN_REVIEW_PART_B_KEYS);
  return { partA, partB, total: partA + partB };
};

function DeanScoreCell({ sectionKey, index, row, deanData, setDeanData }) {
  const value = deanData[sectionKey]?.[index]?.dean ?? row.dean ?? "";

  const update = (nextValue) => {
    setDeanData((prev) => {
      const baseRows = Array.isArray(prev[sectionKey]) ? prev[sectionKey] : [];
      const updatedRows = [...baseRows];
      updatedRows[index] = { ...(updatedRows[index] || row), dean: nextValue };
      return { ...prev, [sectionKey]: updatedRows };
    });
  };

  return <DeanInput val={value} onChange={update} />;
}

function DeanInnovativeScoreCell({ approval, deanData, setDeanData }) {
  const value = deanData.innovativeTeaching?.dean ?? approval.innovDean ?? "";
  return (
    <DeanInput
      val={value}
      onChange={(nextValue) => setDeanData((prev) => ({
        ...prev,
        innovativeTeaching: { ...(prev.innovativeTeaching || {}), dean: nextValue },
      }))}
    />
  );
}

function DeanReviewScoreForm({ approval, deanData, setDeanData }) {
  const docs = approval.docs || {};
  const rows = (key) => Array.isArray(approval[key]) ? approval[key] : [];
  const cell = (value, center = false) => <RO val={value} center={center} />;

  const scoreHeaders = (
    <>
      <th style={TH}>Faculty Score</th>
      <th style={TH_DEAN}>Dean Score</th>
    </>
  );

  const ScoreCells = ({ sectionKey, row, index }) => (
    <>
      <td style={TDS}>{cell(row.score, true)}</td>
      <td style={TDS_DEAN}><DeanScoreCell sectionKey={sectionKey} index={index} row={row} deanData={deanData} setDeanData={setDeanData} /></td>
    </>
  );

  const ReviewTable = ({ title, accent = "#4c1d95", sectionKey, columns, docPrefix, rows: sectionRows }) => {
    const dataRows = sectionRows || rows(sectionKey);
    const hasDocs = Boolean(docPrefix);
    const totalColumns = 1 + columns.length + (hasDocs ? 1 : 0) + 2;

    return (
      <SC title={title} accent={accent}>
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead>
              <tr>
                <th style={TH}>SN</th>
                {columns.map((column) => <th key={column.label} style={TH}>{column.label}</th>)}
                {hasDocs && <th style={TH}>View Docs</th>}
                {scoreHeaders}
              </tr>
            </thead>
            <tbody>
              {dataRows.length ? dataRows.map((row, index) => (
                <tr key={`${sectionKey}-${index}`} style={index % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.label} style={column.center ? TDC : TD}>
                      {cell(column.render(row), column.center)}
                    </td>
                  ))}
                  {hasDocs && <td style={TDV}><ViewDocsCell docKey={`${docPrefix}-${index}`} docs={docs} /></td>}
                  <ScoreCells sectionKey={sectionKey} row={row} index={index} />
                </tr>
              )) : (
                <tr>
                  <td style={{ ...TDC, color: "#94a3b8", fontStyle: "italic" }} colSpan={totalColumns}>
                    No submitted rows for this table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SC>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ background: "linear-gradient(90deg,#4c1d95,#7c3aed)", color: "#ede9fe", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 12 }}>
        <strong>Dean Review Mode</strong> - Faculty self-scores are read-only. Only the Dean score column is editable.
      </div>

      <SC title="Faculty Information" accent="#4c1d95">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[["Name", approval.info?.name || approval.name], ["Qualification", approval.info?.qual], ["Designation", approval.info?.desig || approval.designation], ["Academic Year", approval.academicYear || approval.info?.ay]].map(([label, value]) => (
              <tr key={label}>
                <td style={{ padding: "6px 10px", background: "#f8fafc", fontWeight: 600, border: "1px solid #e2e8f0", width: "35%" }}>{label}</td>
                <td style={{ padding: "5px 10px", border: "1px solid #e2e8f0", color: "#334155" }}>{value || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#dbeafe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>
        Part A - Teaching & Academic Activities
      </div>

      <ReviewTable
        title="A1. Lectures / Tutorials / Practicals"
        accent="#6366f1"
        sectionKey="lectures"
        docPrefix="lec"
        columns={[
          { label: "Semester", render: (r) => r.sem },
          { label: "Course Code / Name", render: (r) => r.code },
          { label: "Classes (as per course structure)", render: (r) => r.planned, center: true },
          { label: "Classes Actually Conducted", render: (r) => r.conducted, center: true },
        ]}
      />

      <ReviewTable
        title="A2. Course File"
        accent="#6366f1"
        sectionKey="courseFile"
        docPrefix="courseFile"
        columns={[
          { label: "Course / Paper", render: (r) => r.course },
          { label: "Title", render: (r) => r.title },
          { label: "Details", render: (r) => r.details },
        ]}
      />

      <SC title="A3. Innovative Teaching-Learning" accent="#8b5cf6">
        <table style={T}>
          <thead>
            <tr>
              <th style={TH}>Details</th>
              <th style={TH}>View Docs</th>
              <th style={TH}>Self Score</th>
              <th style={TH_DEAN}>Dean</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={TD}><RO val={approval.innovDetails || "Innovative / participatory teaching methods"} /></td>
              <td style={TDV}><ViewDocsCell docKey="innov" docs={docs} /></td>
              <td style={TDS}><RO val={approval.innovScore} center /></td>
              <td style={TDS_DEAN}><DeanInnovativeScoreCell approval={approval} deanData={deanData} setDeanData={setDeanData} /></td>
            </tr>
          </tbody>
        </table>
      </SC>

      <ReviewTable
        title="A4. Projects Guided"
        accent="#8b5cf6"
        sectionKey="projects"
        docPrefix="proj"
        columns={[{ label: "Project Type / Description", render: (r) => r.label }]}
      />

      <ReviewTable
        title="A5. Qualification Enhancement"
        accent="#8b5cf6"
        sectionKey="quals"
        docPrefix="qual"
        columns={[{ label: "Description", render: (r) => r.label }]}
      />

      <ReviewTable
        title="A6. Student Feedback"
        accent="#0ea5e9"
        sectionKey="feedback"
        columns={[
          { label: "Course", render: (r) => r.code },
          { label: "First Feedback", render: (r) => r.fb1, center: true },
          { label: "Second Feedback", render: (r) => r.fb2, center: true },
          { label: "Average", render: (r) => r.fb1 && r.fb2 ? ((n(r.fb1) + n(r.fb2)) / 2).toFixed(2) : "", center: true },
        ]}
      />

      <ReviewTable
        title="A7. Department Activities"
        accent="#f59e0b"
        sectionKey="deptActs"
        docPrefix="dept"
        columns={[
          { label: "Activity", render: (r) => r.activity },
          { label: "Nature", render: (r) => r.nature },
        ]}
      />

      <ReviewTable
        title="A8. University Activities"
        accent="#f59e0b"
        sectionKey="uniActs"
        docPrefix="uni"
        columns={[
          { label: "Activity", render: (r) => r.activity },
          { label: "Nature", render: (r) => r.nature },
        ]}
      />

      <ReviewTable
        title="A9. Contribution to Society"
        accent="#10b981"
        sectionKey="society"
        docPrefix="soc"
        columns={[
          { label: "Activity", render: (r) => r.label },
          { label: "Details", render: (r) => r.details },
        ]}
      />

      <ReviewTable
        title="A10. Industry Connect"
        accent="#10b981"
        sectionKey="industry"
        docPrefix="ind"
        columns={[
          { label: "Industry Name", render: (r) => r.name },
          { label: "Details", render: (r) => r.details },
        ]}
      />

      <ReviewTable
        title="A11. Annual Confidential Report (ACR)"
        accent="#ef4444"
        sectionKey="acr"
        columns={[{ label: "Parameter", render: (r) => r.label }]}
      />

      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#ede9fe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>
        Part B - Research & Academic Contributions
      </div>

      <ReviewTable
        title="B1. Research Papers / Journal Publications"
        accent="#7c3aed"
        sectionKey="journals"
        docPrefix="jour"
        columns={[
          { label: "Title", render: (r) => r.title },
          { label: "Journal", render: (r) => r.journal },
          { label: "ISSN", render: (r) => r.issn, center: true },
          { label: "Indexing", render: (r) => r.index, center: true },
        ]}
      />

      <ReviewTable
        title="B2. Books / Book Chapters"
        accent="#7c3aed"
        sectionKey="books"
        docPrefix="book"
        columns={[
          { label: "Title with Page Nos.", render: (r) => r.title },
          { label: "Book Title, Editor & Publisher", render: (r) => r.book },
          { label: "ISSN / ISBN No.", render: (r) => r.issn, center: true },
          { label: "Type of Publisher", render: (r) => r.pub },
          { label: "Co-authors (from DYPIU)", render: (r) => r.coauth },
          { label: "First Author", render: (r) => r.first, center: true },
        ]}
      />

      <ReviewTable
        title="B3. ICT / E-Content / Pedagogy"
        accent="#0ea5e9"
        sectionKey="ict"
        docPrefix="ict"
        columns={[
          { label: "Title", render: (r) => r.title },
          { label: "Description", render: (r) => r.desc },
          { label: "Type", render: (r) => r.type },
          { label: "Quadrants", render: (r) => r.quad, center: true },
        ]}
      />

      <ReviewTable
        title="B4(a). Research Guidance"
        accent="#059669"
        sectionKey="research"
        docPrefix="res"
        columns={[
          { label: "Degree", render: (r) => r.degree, center: true },
          { label: "Student Name", render: (r) => r.name },
          { label: "Thesis Title / Status", render: (r) => r.thesis },
        ]}
      />

      <ReviewTable
        title="B4(b). Research / Consultancy Internal Projects"
        accent="#059669"
        sectionKey="projects2"
        docPrefix="project2"
        columns={[
          { label: "Title", render: (r) => r.title },
          { label: "Funding Agency", render: (r) => r.agency },
          { label: "Date of Sanction", render: (r) => r.date, center: true },
          { label: "Grant Amount", render: (r) => r.amount, center: true },
          { label: "Role PI / Co-PI / Consultant", render: (r) => r.role },
          { label: "Status", render: (r) => r.status },
        ]}
      />

      <ReviewTable
        title="B4(c). Research / Consultancy External Projects"
        accent="#059669"
        sectionKey="externalProjects"
        docPrefix="externalProject"
        columns={[
          { label: "Title", render: (r) => r.title },
          { label: "Funding Agency", render: (r) => r.agency },
          { label: "Date of Sanction", render: (r) => r.date, center: true },
          { label: "Grant Amount", render: (r) => r.amount, center: true },
          { label: "Role PI / Co-PI / Consultant", render: (r) => r.role },
          { label: "Status", render: (r) => r.status },
        ]}
      />

      <ReviewTable
        title="B5(a). Patents (IPR)"
        accent="#f97316"
        sectionKey="patents"
        docPrefix="pat"
        columns={[
          { label: "Title", render: (r) => r.title },
          { label: "National / International", render: (r) => r.type, center: true },
          { label: "Date", render: (r) => r.date, center: true },
          { label: "Status", render: (r) => r.status, center: true },
          { label: "File No.", render: (r) => r.fileNo, center: true },
        ]}
      />

      <ReviewTable
        title="B5(b). Awards"
        accent="#f97316"
        sectionKey="awards"
        docPrefix="awd"
        columns={[
          { label: "Award Title", render: (r) => r.title },
          { label: "Date", render: (r) => r.date, center: true },
          { label: "Agency", render: (r) => r.agency },
          { label: "Level", render: (r) => r.level },
        ]}
      />

      <ReviewTable
        title="B6. Invited Lectures / Resource Person / Paper Presentations"
        accent="#6366f1"
        sectionKey="confs"
        docPrefix="conf"
        columns={[
          { label: "Title / Session", render: (r) => r.title },
          { label: "Type", render: (r) => r.type },
          { label: "Organizer", render: (r) => r.org },
          { label: "Level", render: (r) => r.level },
        ]}
      />

      <ReviewTable
        title="B7(a). Submitted Research Proposals"
        accent="#0ea5e9"
        sectionKey="proposals"
        docPrefix="prop"
        columns={[
          { label: "Title of Proposal", render: (r) => r.title },
          { label: "Duration", render: (r) => r.duration, center: true },
          { label: "Funding Agency", render: (r) => r.agency },
          { label: "Grant Amount Requested", render: (r) => r.amount, center: true },
        ]}
      />

      <ReviewTable
        title="B7(b). Product Developed and Used by Students in Lab / Commercialized"
        accent="#0ea5e9"
        sectionKey="products"
        docPrefix="prod"
        columns={[
          { label: "Details of Product", render: (r) => r.details },
          { label: "Used by Students in Lab / Commercialized", render: (r) => r.usage },
        ]}
      />

      <ReviewTable
        title="B8(a). Self Development - FDP / Workshops"
        accent="#10b981"
        sectionKey="fdps"
        docPrefix="fdp"
        columns={[
          { label: "Program", render: (r) => r.program },
          { label: "Duration", render: (r) => r.duration, center: true },
          { label: "Organizer", render: (r) => r.org },
        ]}
      />

      <ReviewTable
        title="B8(b). Industrial Training"
        accent="#10b981"
        sectionKey="training"
        docPrefix="train"
        columns={[
          { label: "Company", render: (r) => r.company },
          { label: "Duration", render: (r) => r.duration, center: true },
          { label: "Nature", render: (r) => r.nature },
        ]}
      />
    </div>
  );
}

function ApprovalReviewPanel({ approval, approvalType, onBack, onSubmit, readOnly = false }) {
  const [remarks, setRemarks] = useState(approval?.deanRemarks || "");
  const [deanData, setDeanData] = useState({});
  const [tab, setTab] = useState("form");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const reviewLocked = readOnly || /Reviewed|Approved|Rejected/.test(approval?.status || "");
  const sectionScores = deanScorePayload(approval, deanData);
  const deanScores = deanScoreTotals(sectionScores);
  const selfTotal = n(approval?.declaration?.grand_total || approval?.grandTotal || approval?.total);
  const titleMap = {
    directorApprovals: "Director Approval Review",
    facultyApprovals: "Faculty Approval Review",
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "24px", boxShadow: "0 18px 45px rgba(15,23,42,0.18)", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <button onClick={onBack} style={{ border: "none", background: "#e2e8f0", color: "#0f172a", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>← Back</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{titleMap[approvalType]}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{approval.name} · {approval.designation}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Employee ID", value: approval.employeeId },
          { label: "Submitted", value: approval.submittedOn },
          { label: "Self Total", value: selfTotal.toFixed(1) },
          { label: "Dean Total", value: deanScores.total.toFixed(1) },
        ].map((item) => (
          <div key={item.label} style={{ background: "#f8fafc", borderRadius: 12, padding: "18px 16px" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>{item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["form", "Dean Score Columns"], ["remarks", "Remarks & Submit"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: "7px 18px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700, background: tab === id ? "#4c1d95" : "#e2e8f0", color: tab === id ? "#ede9fe" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "form" && (
        <fieldset disabled={reviewLocked} style={{ border: "none", padding: 0, margin: 0 }}>
          <DeanReviewScoreForm approval={approval} deanData={deanData} setDeanData={setDeanData} />
        </fieldset>
      )}

      {tab === "remarks" && (
        <>
          <div style={{ background: "#faf5ff", border: "1px solid #ddd6fe", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: "#6d28d9", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>Dean Score Summary</div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, color: "#4c1d95", fontWeight: 900 }}>
              <span>Part A: {deanScores.partA.toFixed(1)} / 200</span>
              <span>Part B: {deanScores.partB.toFixed(1)} / 420</span>
              <span>Total: {deanScores.total.toFixed(1)} / 620</span>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Dean Remarks</div>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={7} readOnly={reviewLocked}
              style={{ width: "100%", borderRadius: 12, border: "1px solid #cbd5e1", padding: "14px", fontFamily: "Georgia, serif", fontSize: 13, color: "#1f2937", resize: "vertical", background: reviewLocked ? "#f8fafc" : "#fff" }}
            />
          </div>
        </>
      )}

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

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer" }}>{reviewLocked ? "Close" : "Cancel"}</button>
        {!reviewLocked && (
          <button onClick={() => onSubmit(approval.id, deanScores, remarks, sectionScores, reviewConfirmed)} disabled={!reviewConfirmed} style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "none", background: reviewConfirmed ? "#0f172a" : "#64748b", color: "#f8fafc", fontWeight: 700, cursor: reviewConfirmed ? "pointer" : "not-allowed" }}>Approve & Forward</button>
        )}
      </div>
    </div>
  );
}

// ─── Main Dean Dashboard ───────────────────────────────────────────────────────
export default function NonEngineeringDeanDashboard() {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState("myAppraisal");
  const [hodAppraisalTab, setHodAppraisalTab] = useState("partA");
  const [reviewingApproval, setReviewingApproval] = useState(null);

  const [facultyList, setFacultyList] = useState([]);
  const [directorList, setDirectorList] = useState([]);

  useEffect(() => {
    const loadReviewQueue = async () => {
      try {
        const items = await fetchReviewQueueForRole({
          reviewerRole: "dean",
          reviewerProfile: { ...profileFromsessionStorage(), school: NON_ENGINEERING_SCHOOLS[0]?.label || "" },
          schoolValues: NON_ENGINEERING_SCHOOL_VALUES,
        });
        const scopedItems = items.filter((item) => NON_ENGINEERING_SCHOOL_CODES.includes(getSchoolKey(item.school)));
        setFacultyList(scopedItems.filter((item) => item.appraisalRole === "faculty"));
        setDirectorList(scopedItems.filter((item) => item.appraisalRole === "director"));
      } catch (err) {
        console.error("Could not load Non-Engineering Dean review queue:", err);
        setFacultyList([]);
        setDirectorList([]);
      }
    };

    loadReviewQueue();
  }, []);

  const [filterStatus, setFilterStatus] = useState("All");
  const [selectedSchoolCode, setSelectedSchoolCode] = useState("all");
  const [showLogoutModal, setShowLogoutModal] = useState(false);


  // ── Dean's own appraisal form state ──
  const [info, setInfo] = useState({
    name: sessionStorage.getItem("name") || "",
    qual: "",
    desig: sessionStorage.getItem("role") === "dean" ? "Dean" : "",
    school: sessionStorage.getItem("school") || sessionStorage.getItem("department") || "",
    expDyp: "",
    expPrev: "",
    expTotal: "",
    ay: sessionStorage.getItem("academicYear") || "2025-2026"
  });
  const inf = (k) => (v) => setInfo((p) => ({ ...p, [k]: v }));

  const [lectures, setLectures] = useState([
    { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" },
    { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" },
    { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" },
  ]);
  const setLec = (i, k, v) => setLectures((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [courseFile, setCourseFile] = useState([{ course: "", title: "", details: "", score: "", hod: "", director: "" }]);
  const setCF = (i, k, v) => setCourseFile((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const [innovScore, setInnovScore] = useState("");
  const [innovDetails, setInnovDetails] = useState("");
  const [projects, setProjects] = useState([
    { label: "Project guided (3/batch)", score: "", hod: "", director: "" },
    { label: "Industrial collaboration / Sponsorship (Max 5)", score: "", hod: "", director: "" },
    { label: "Award received (Max 5 marks)", score: "", hod: "", director: "" },
    { label: "Project outcome: events/publications (Max 5)", score: "", hod: "", director: "" },
  ]);
  const setProj = (i, k, v) => setProjects((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [quals, setQuals] = useState([
    { label: "Higher Qualification achieved (5 Marks)", score: "", hod: "", director: "" },
    { label: "Add-on Qualification / Certification (Max 5)", score: "", hod: "", director: "" },
  ]);
  const setQual = (i, k, v) => setQuals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [feedback, setFeedback] = useState([
    { code: "", fb1: "", fb2: "", score: "", hod: "", director: "" },
    { code: "", fb1: "", fb2: "", score: "", hod: "", director: "" },
    { code: "", fb1: "", fb2: "", score: "", hod: "", director: "" },
  ]);
  const setFb = (i, k, v) => setFeedback((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [deptActs, setDeptActs] = useState([
    { activity: "", nature: "", score: "", hod: "", director: "" },
    { activity: "", nature: "", score: "", hod: "", director: "" },
    { activity: "", nature: "", score: "", hod: "", director: "" },
  ]);
  const setDept = (i, k, v) => setDeptActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [uniActs, setUniActs] = useState([
    { activity: "", nature: "", score: "", hod: "", director: "" },
    { activity: "", nature: "", score: "", hod: "", director: "" },
    { activity: "", nature: "", score: "", hod: "", director: "" },
  ]);
  const setUni = (i, k, v) => setUniActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const societyLabels = ["Induction Program", "Unnat Bharat Abhiyan", "Yoga Classes", "Blood Donation", "Techno Social activities", "NSS", "Social visits", "Project of Social Impact", "Any other activity"];
  const [society, setSociety] = useState(societyLabels.map((l) => ({ label: l, details: "", score: "", hod: "", director: "" })));
  const setSoc = (i, k, v) => setSociety((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [industry, setIndustry] = useState([
    { name: "", details: "", score: "", hod: "", director: "" },
    { name: "", details: "", score: "", hod: "", director: "" },
  ]);
  const setInd = (i, k, v) => setIndustry((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const acrLabels = ["Self-motivation and Proactiveness", "Punctuality", "Target based work", "Effectiveness", "Obedience"];
  const [acr, setAcr] = useState(acrLabels.map((l) => ({ label: l, hod: "", director: "" })));
  const setAcrRow = (i, k, v) => setAcr((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [journals, setJournals] = useState([
    { title: "", journal: "", issn: "", index: "", score: "", hod: "", director: "" },
    { title: "", journal: "", issn: "", index: "", score: "", hod: "", director: "" },
    { title: "", journal: "", issn: "", index: "", score: "", hod: "", director: "" },
  ]);
  const setJour = (i, k, v) => setJournals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [books, setBooks] = useState([
    { title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "", hod: "", director: "" },
    { title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "", hod: "", director: "" },
  ]);
  const setBook = (i, k, v) => setBooks((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [ict, setIct] = useState([
    { title: "", desc: "", type: "", quad: "", score: "", hod: "", director: "" },
    { title: "", desc: "", type: "", quad: "", score: "", hod: "", director: "" },
  ]);
  const setIctRow = (i, k, v) => setIct((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [research, setResearch] = useState([
    { degree: "PhD", name: "", thesis: "", score: "", hod: "", director: "" },
    { degree: "PhD", name: "", thesis: "", score: "", hod: "", director: "" },
  ]);
  const setRes = (i, k, v) => setResearch((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [projects2, setProjects2] = useState([
    { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" },
    { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" },
  ]);
  const setPrj2 = (i, k, v) => setProjects2((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [externalProjects, setExternalProjects] = useState([
    { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" },
    { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" },
  ]);
  const setExtPrj = (i, k, v) => setExternalProjects((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [patents, setPatents] = useState([
    { title: "", type: "", date: "", status: "", fileNo: "", score: "", hod: "", director: "" },
    { title: "", type: "", date: "", status: "", fileNo: "", score: "", hod: "", director: "" },
  ]);
  const setPat = (i, k, v) => setPatents((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [awards, setAwards] = useState([
    { title: "", date: "", agency: "", level: "", score: "", hod: "", director: "" },
    { title: "", date: "", agency: "", level: "", score: "", hod: "", director: "" },
  ]);
  const setAwd = (i, k, v) => setAwards((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [confs, setConfs] = useState([
    { title: "", type: "", org: "", level: "", score: "", hod: "", director: "" },
    { title: "", type: "", org: "", level: "", score: "", hod: "", director: "" },
    { title: "", type: "", org: "", level: "", score: "", hod: "", director: "" },
  ]);
  const setConf = (i, k, v) => setConfs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [proposals, setProposals] = useState([
    { title: "", duration: "", agency: "", amount: "", score: "", hod: "", director: "" },
    { title: "", duration: "", agency: "", amount: "", score: "", hod: "", director: "" },
  ]);
  const setProp = (i, k, v) => setProposals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [products, setProducts] = useState([
    { details: "", usage: "", score: "", hod: "", director: "" },
    { details: "", usage: "", score: "", hod: "", director: "" },
  ]);
  const setProd = (i, k, v) => setProducts((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [fdps, setFdps] = useState([
    { program: "", duration: "", org: "", score: "", hod: "", director: "" },
    { program: "", duration: "", org: "", score: "", hod: "", director: "" },
  ]);
  const setFdp = (i, k, v) => setFdps((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [training, setTraining] = useState([
    { company: "", duration: "", nature: "", score: "", hod: "", director: "" },
    { company: "", duration: "", nature: "", score: "", hod: "", director: "" },
  ]);
  const setTrain = (i, k, v) => setTraining((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [docs, setDocs] = useState({});
  const [sectionApplicability, setSectionApplicability] = useState({ projects: "applicable", research: "applicable" });
  const [appraisalLocked, setAppraisalLocked] = useState(false);
  const [sectionSaveStatus, setSectionSaveStatus] = useState({ partA: true, partB: true });

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
              setLectures,
              setCourseFile,
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
        console.error("Could not load saved dean appraisal:", err);
      }
    };

    loadOwnAppraisal();
  }, [info.ay]);

  // ── Computed scores for HOD appraisal ──
  const totalLecScore = sumSectionScore(lectures, 50);
  const courseFileScore = sumSectionScore(courseFile, 20);
  const innovTotal = clampScore(innovScore, 10);
  const projectTotal = sectionApplicability.projects === "notApplicable" ? 0 : sumSectionScore(projects, 10);
  const qualTotal = sumSectionScore(quals, 10);
  const teachingRaw = totalLecScore + courseFileScore + innovTotal + projectTotal + qualTotal;
  const stuFeedbackScore = feedbackSectionScore(feedback, 10);
  const deptScore = sumSectionScore(deptActs, 20);
  const uniScore = sumSectionScore(uniActs, 30);
  const societyScore = sumSectionScore(society, 10);
  const industryScore = sumSectionScore(industry, 5);
  const acrScore = sumSectionScore(acr, 25);
  const effectivePartAMax = effectiveMaxScore(200, sectionApplicability, [{ key: "projects", max: 10 }]);
  const partATotal = clampScore(teachingRaw + stuFeedbackScore + deptScore + uniScore + societyScore + industryScore + acrScore, effectivePartAMax);

  const journalScore = sumSectionScore(journals, 120);
  const bookScore = sumSectionScore(books, 50);
  const ictScore = sumSectionScore(ict, 20);
  const researchScore = sectionApplicability.research === "notApplicable" ? 0 : sumSectionScore(research, 30);
  const projectBScore = sumSectionScore(projects2, 45);
  const externalProjectScore = sumSectionScore(externalProjects, 45);
  const patentScore = sumSectionScore(patents, 40);
  const awardScore = sumSectionScore(awards, 10);
  const confScore = sumSectionScore(confs, 30);
  const proposalScore = sumSectionScore(proposals, 10);
  const productScore = sumSectionScore(products, 10);
  const fdpScore = sumSectionScore(fdps, 10);
  const trainScore = sumSectionScore(training, 10);
  const effectivePartBMax = effectiveMaxScore(420, sectionApplicability, [{ key: "research", max: 30 }]);
  const effectiveGrandMax = effectivePartAMax + effectivePartBMax;
  const partBTotal = clampScore(journalScore + bookScore + ictScore + researchScore + projectBScore + externalProjectScore + patentScore + awardScore + confScore + proposalScore + productScore + fdpScore + trainScore, effectivePartBMax);
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

  const facultyPendingCount = facultyList.filter(f => f.status === "Pending Review").length;
  const facultyReviewedCount = facultyList.filter(f => f.status === "Reviewed").length;
  const directorPendingCount = directorList.filter(d => d.status === "Pending Review").length;
  const directorReviewedCount = directorList.filter(d => d.status === "Reviewed").length;

  const activeApprovalList = activeMainTab === "directorApprovals"
      ? directorList
      : activeMainTab === "facultyApprovals"
        ? facultyList
        : [];

  const activeSchoolApprovalList = selectedSchoolCode === "all"
    ? activeApprovalList
    : activeApprovalList.filter((item) => getSchoolKey(item.school) === selectedSchoolCode);

  const pendingCount = activeSchoolApprovalList.filter(f => f.status === "Pending Review").length;

  const reviewedCount = activeSchoolApprovalList.filter(f => f.status === "Reviewed").length;

  const filtered = filterStatus === "All"
    ? activeSchoolApprovalList
    : (filterStatus === "Pending Review"
      ? activeSchoolApprovalList.filter(f => f.status === "Pending Review")
      : activeSchoolApprovalList.filter(f => f.status === "Reviewed"));

  const schoolTabs = [
    { code: "all", label: "All Schools", count: activeApprovalList.length, icon: "All", color: "#0f172a", bg: "#e2e8f0" },
    ...NON_ENGINEERING_SCHOOLS.map((school) => ({
      code: school.code,
      label: school.code,
      count: activeApprovalList.filter((item) => getSchoolKey(item.school) === school.code).length,
      icon: SCHOOL_VISUALS[school.code]?.icon || school.code.slice(0, 2),
      color: SCHOOL_VISUALS[school.code]?.color || "#334155",
      bg: SCHOOL_VISUALS[school.code]?.bg || "#f1f5f9",
    })),
  ];

  const navItems = [
    { id: "myAppraisal", icon: "👤", label: "My Appraisal", sub: "Self-assessment form" },
    { id: "directorApprovals", icon: "🏛", label: "Director Reviews", sub: `${directorPendingCount} awaiting review`, badge: directorPendingCount },
    { id: "facultyApprovals", icon: "📋", label: "Faculty Reviews", sub: `${facultyPendingCount} awaiting review`, badge: facultyPendingCount },
  ];
  const generateReport = () => {
  const win = window.open('', '_blank');

  const html = `
  <html>
  <head>
    <title>Faculty Appraisal</title>

    <style>
      @page { size: A4; margin: 18mm; }

      body {
        font-family: "Times New Roman", serif;
        font-size: 12px;
        color: #000;
      }

      h1 { text-align: center; }
      h2 { margin-top: 25px; border-bottom: 2px solid #000; }
      h3 { margin-top: 15px; }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        table-layout: fixed;
      }

      th, td {
        border: 1px solid #000;
        padding: 6px;
        word-wrap: break-word;
      }

      th {
        background: #f2f2f2;
        text-align: center;
      }

      .center { text-align: center; }
      .total { font-weight: bold; font-size: 13px; }
      .page-break { page-break-before: always; }

      .info td {
        border: none;
        padding: 4px;
      }
    </style>
  </head>

  <body>

    <h1>Faculty Appraisal Report</h1>

    <!-- PERSONAL INFO -->
    <table class="info">
      <tr><td><b>Name:</b></td><td>${info.name || "&nbsp;"}</td></tr>
      <tr><td><b>Qualification:</b></td><td>${info.qual || "&nbsp;"}</td></tr>
      <tr><td><b>Designation:</b></td><td>${info.desig || "&nbsp;"}</td></tr>
      <tr><td><b>Academic Year:</b></td><td>${info.ay || "&nbsp;"}</td></tr>
    </table>

    <!-- ================= PART A ================= -->
    <h2>PART A — Teaching & Academic Activities</h2>

    <!-- A1 -->
    <h3>A1: Lectures / Tutorials / Practicals</h3>
    <table>
      <tr>
        <th>Semester</th><th>Course</th>
        <th>Classes (as per course structure)</th><th>Classes Actually Conducted</th><th>Score</th>
      </tr>
      ${lectures.map(l => `
        <tr>
          <td>${l.sem || "&nbsp;"}</td>
          <td>${l.code || "&nbsp;"}</td>
          <td class="center">${l.planned || "&nbsp;"}</td>
          <td class="center">${l.conducted || "&nbsp;"}</td>
          <td class="center">${l.score || "&nbsp;"}</td>
        </tr>
      `).join('')}
    </table>

    <!-- A2 -->
    <h3>A2: Course File</h3>
    <table>
      <tr><th>Course</th><th>Title</th><th>Details</th><th>Score</th></tr>
      ${courseFile.map(c => `
        <tr>
          <td>${c.course || "&nbsp;"}</td>
          <td>${c.title || "&nbsp;"}</td>
          <td>${c.details || "&nbsp;"}</td>
          <td class="center">${c.score || "&nbsp;"}</td>
        </tr>
      `).join('')}
    </table>

    <!-- A3 -->
    <h3>A3: Innovative Teaching</h3>
    <table>
      <tr><th>Description</th><th>Score</th></tr>
      <tr>
        <td>Innovative Teaching Methods</td>
        <td class="center">${innovScore || "&nbsp;"}</td>
      </tr>
    </table>

    <!-- A4 -->
    <h3>A4: Projects</h3>
    <table>
      <tr><th>Project Type</th><th>Score</th></tr>
      ${projects.map(p => `<tr><td>${p.label || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <!-- A5 -->
    <h3>A5: Qualification Enhancement</h3>
    <table>
      <tr><th>Description</th><th>Score</th></tr>
      ${quals.map(q => `<tr><td>${q.label || "&nbsp;"}</td><td class="center">${q.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <!-- Feedback -->
    <h3>B: Student Feedback</h3>
    <table>
      <tr><th>Course</th><th>FB1</th><th>FB2</th><th>Score</th></tr>
      ${feedback.map(f => `
        <tr>
          <td>${f.code || "&nbsp;"}</td>
          <td class="center">${f.fb1 || "&nbsp;"}</td>
          <td class="center">${f.fb2 || "&nbsp;"}</td>
          <td class="center">${f.score || "&nbsp;"}</td>
        </tr>
      `).join('')}
    </table>

    <!-- Department -->
    <h3>C: Departmental Activities</h3>
    <table>
      <tr><th>Activity</th><th>Nature</th><th>Score</th></tr>
      ${deptActs.map(d => `<tr><td>${d.activity || "&nbsp;"}</td><td>${d.nature || "&nbsp;"}</td><td class="center">${d.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <!-- University -->
    <h3>D: University Activities</h3>
    <table>
      <tr><th>Activity</th><th>Nature</th><th>Score</th></tr>
      ${uniActs.map(u => `<tr><td>${u.activity || "&nbsp;"}</td><td>${u.nature || "&nbsp;"}</td><td class="center">${u.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <!-- Society -->
    <h3>E: Contribution to Society</h3>
    <table>
      <tr><th>Activity</th><th>Details</th><th>Score</th></tr>
      ${society.map(s => `<tr><td>${s.label || "&nbsp;"}</td><td>${s.details || "&nbsp;"}</td><td class="center">${s.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <!-- Industry -->
    <h3>F: Industry Interaction</h3>
    <table>
      <tr><th>Company</th><th>Details</th><th>Score</th></tr>
      ${industry.map(i => `<tr><td>${i.name || "&nbsp;"}</td><td>${i.details || "&nbsp;"}</td><td class="center">${i.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <!-- ACR -->
    <h3>G: ACR (Performance Indicators)</h3>
    <table>
      <tr><th>Criteria</th><th>Score</th></tr>
      ${acr.map(a => `<tr><td>${a.label}</td><td class="center">${a.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <p class="total">Part A Total: ${partATotal} / ${effectivePartAMax}</p>

    <div class="page-break"></div>

    <!-- ================= PART B ================= -->
    <h2>PART B — Research & Development</h2>

    <h3>Journals</h3>
    <table>
      <tr><th>Title</th><th>Journal</th><th>Index</th><th>Score</th></tr>
      ${journals.map(j => `<tr><td>${j.title || "&nbsp;"}</td><td>${j.journal || "&nbsp;"}</td><td>${j.index || "&nbsp;"}</td><td class="center">${j.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B2. Books / Book Chapters</h3>
    <table>
      <tr><th>Title with Page Nos.</th><th>Book Title, Editor & Publisher</th><th>ISSN / ISBN No.</th><th>Type of Publisher</th><th>Co-authors (from DYPIU)</th><th>First Author</th><th>Score</th></tr>
      ${books.map(b => `<tr><td>${b.title || "&nbsp;"}</td><td>${b.book || "&nbsp;"}</td><td>${b.issn || "&nbsp;"}</td><td>${b.pub || "&nbsp;"}</td><td>${b.coauth || "&nbsp;"}</td><td>${b.first || "&nbsp;"}</td><td class="center">${b.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>ICT</h3>
    <table>
      <tr><th>Title</th><th>Description</th><th>Score</th></tr>
      ${ict.map(i => `<tr><td>${i.title || "&nbsp;"}</td><td>${i.desc || "&nbsp;"}</td><td class="center">${i.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B4(a). Research Guidance</h3>
    <table>
      <tr><th>Degree</th><th>Name</th><th>Thesis</th><th>Score</th></tr>
      ${research.map(r => `<tr><td>${r.degree || "&nbsp;"}</td><td>${r.name || "&nbsp;"}</td><td>${r.thesis || "&nbsp;"}</td><td class="center">${r.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B4(b). Ongoing & Completed Research / Consultancy Internal Projects</h3>
    <table>
      <tr><th>Title</th><th>Funding Agency</th><th>Date of Sanction</th><th>Grant Amount</th><th>Role</th><th>Status</th><th>Score</th></tr>
      ${projects2.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.agency || "&nbsp;"}</td><td>${p.date || "&nbsp;"}</td><td>${p.amount || "&nbsp;"}</td><td>${p.role || "&nbsp;"}</td><td>${p.status || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B4(c). Ongoing & Completed Research / Consultancy External Projects</h3>
    <table>
      <tr><th>Title</th><th>Funding Agency</th><th>Date of Sanction</th><th>Grant Amount</th><th>Role</th><th>Status</th><th>Score</th></tr>
      ${externalProjects.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.agency || "&nbsp;"}</td><td>${p.date || "&nbsp;"}</td><td>${p.amount || "&nbsp;"}</td><td>${p.role || "&nbsp;"}</td><td>${p.status || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B5(a). Patents (IPR)</h3>
    <table>
      <tr><th>Title</th><th>National / International</th><th>Date</th><th>Score</th></tr>
      ${patents.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.type || "&nbsp;"}</td><td>${p.date || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B5(b). Awards</h3>
    <table>
      <tr><th>Title</th><th>Date</th><th>Agency</th><th>Score</th></tr>
      ${awards.map(a => `<tr><td>${a.title || "&nbsp;"}</td><td>${a.date || "&nbsp;"}</td><td>${a.agency || "&nbsp;"}</td><td class="center">${a.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B6. Invited Lectures / Resource Person / Paper Presentations</h3>
    <table>
      <tr><th>Title</th><th>Type</th><th>Organizer</th><th>Score</th></tr>
      ${confs.map(c => `<tr><td>${c.title || "&nbsp;"}</td><td>${c.type || "&nbsp;"}</td><td>${c.org || "&nbsp;"}</td><td class="center">${c.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B7(a). Submitted Research Proposals</h3>
    <table>
      <tr><th>Title of Proposal</th><th>Duration</th><th>Funding Agency</th><th>Grant Amount Requested</th><th>Score</th></tr>
      ${proposals.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.duration || "&nbsp;"}</td><td>${p.agency || "&nbsp;"}</td><td>${p.amount || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>
    <h3>B7(b). Product Developed and Used by Students in Lab / Commercialized</h3>
    <table>
      <tr><th>Details of Product</th><th>Used by Students in Lab / Commercialized</th><th>Score</th></tr>
      ${products.map(p => `<tr><td>${p.details || "&nbsp;"}</td><td>${p.usage || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>



    <h3>B8(a). FDP / Training</h3>
    <table>
      <tr><th>Program</th><th>Duration</th><th>Organization</th><th>Score</th></tr>
      ${fdps.map(f => `<tr><td>${f.program || "&nbsp;"}</td><td>${f.duration || "&nbsp;"}</td><td>${f.org || "&nbsp;"}</td><td class="center">${f.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>B8(b). Industrial Training</h3>
    <table>
      <tr><th>Company</th><th>Duration</th><th>Nature</th><th>Score</th></tr>
      ${training.map(t => `<tr><td>${t.company || "&nbsp;"}</td><td>${t.duration || "&nbsp;"}</td><td>${t.nature || "&nbsp;"}</td><td class="center">${t.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <p class="total">Part B Total: ${partBTotal} / ${effectivePartBMax}</p>
    <p class="total">Grand Total: ${grandTotal} / ${effectiveGrandMax}</p>
    <p class="total">Grade: ${g.label}</p>

  </body>
  </html>
  `;

  win.document.write(html);
  win.document.close();
  win.print();
};

  const [submitting, setSubmitting] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);

  const validateSelfAppraisalRows = () => {
    const sections = [
      { label: "A(i). Lectures", rows: lectures, fields: ["sem", "code", "planned", "conducted", "score"] },
      { label: "A(ii). Course File", rows: courseFile, fields: ["course", "title", "details", "score"] },
      { label: "A(iv). Projects", rows: projects, fields: ["label", "score"], skip: sectionApplicability.projects === "notApplicable" },
      { label: "A(v). Qualifications", rows: quals, fields: ["label", "score"] },
      { label: "A(vi). Student Feedback", rows: feedback, fields: ["code", "fb1", "fb2"] },
      { label: "A(vii). Department Activities", rows: deptActs, fields: ["activity", "nature", "score"] },
      { label: "A(viii). University Activities", rows: uniActs, fields: ["activity", "nature", "score"] },
      { label: "A(ix). Contribution to Society", rows: society, fields: ["label", "details", "score"] },
      { label: "A(x). Industry Connect", rows: industry, fields: ["name", "details", "score"] },
      { label: "B1. Journals", rows: journals, fields: ["title", "journal", "issn", "index", "score"] },
      { label: "B2. Books / Chapters", rows: books, fields: ["title", "book", "issn", "pub", "coauth", "first", "score"] },
      { label: "B3. ICT Pedagogy", rows: ict, fields: ["title", "desc", "type", "quad", "score"] },
      { label: "B4(a). Research Guidance", rows: research, fields: ["degree", "name", "thesis", "score"], skip: sectionApplicability.research === "notApplicable" },
      { label: "B4(b). Internal Projects", rows: projects2, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B4(c). External Projects", rows: externalProjects, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B5(a). Patents (IPR)", rows: patents, fields: ["title", "type", "date", "status", "fileNo", "score"] },
      { label: "B5(b). Awards", rows: awards, fields: ["title", "date", "agency", "level", "score"] },
      { label: "B6. Conferences", rows: confs, fields: ["title", "type", "org", "level", "score"] },
      { label: "B7(a). Proposals", rows: proposals, fields: ["title", "duration", "agency", "amount", "score"] },
      { label: "B7(b). Products", rows: products, fields: ["details", "usage", "score"] },
      { label: "B8(a). FDP / Workshops", rows: fdps, fields: ["program", "duration", "org", "score"] },
      { label: "B8(b). Industrial Training", rows: training, fields: ["company", "duration", "nature", "score"] },
    ];
    const errors = validateCompleteRows(sections);
    [...projects2, ...externalProjects].forEach((row, index) => {
      if (row.date && !isValidDDMMYYYY(row.date)) {
        errors.push(`B4 project row ${index + 1}: date must be DD/MM/YYYY.`);
      }
    });
    if (innovDetails && !innovScore) errors.push("A(iii). Innovative Teaching Methods: score is required.");
    if (innovScore && !innovDetails) errors.push("A(iii). Innovative Teaching Methods: details are required.");
    if (errors.length) {
      alert(errors.join("\n"));
      return false;
    }
    return true;
  };
  const validateSelfAppraisalSectionRows = (section) => {
    const partASections = [
      { label: "A(i). Lectures", rows: lectures, fields: ["sem", "code", "planned", "conducted", "score"] },
      { label: "A(ii). Course File", rows: courseFile, fields: ["course", "title", "details", "score"] },
      { label: "A(iv). Projects", rows: projects, fields: ["label", "score"], skip: sectionApplicability.projects === "notApplicable" },
      { label: "A(v). Qualifications", rows: quals, fields: ["label", "score"] },
      { label: "A(vi). Student Feedback", rows: feedback, fields: ["code", "fb1", "fb2"] },
      { label: "A(vii). Department Activities", rows: deptActs, fields: ["activity", "nature", "score"] },
      { label: "A(viii). University Activities", rows: uniActs, fields: ["activity", "nature", "score"] },
      { label: "A(ix). Contribution to Society", rows: society, fields: ["label", "details", "score"] },
      { label: "A(x). Industry Connect", rows: industry, fields: ["name", "details", "score"] },
    ];
    const partBSections = [
      { label: "B1. Journals", rows: journals, fields: ["title", "journal", "issn", "index", "score"] },
      { label: "B2. Books / Chapters", rows: books, fields: ["title", "book", "issn", "pub", "coauth", "first", "score"] },
      { label: "B3. ICT Pedagogy", rows: ict, fields: ["title", "desc", "type", "quad", "score"] },
      { label: "B4(a). Research Guidance", rows: research, fields: ["degree", "name", "thesis", "score"], skip: sectionApplicability.research === "notApplicable" },
      { label: "B4(b). Internal Projects", rows: projects2, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B4(c). External Projects", rows: externalProjects, fields: ["title", "agency", "date", "amount", "role", "status", "score"] },
      { label: "B5(a). Patents (IPR)", rows: patents, fields: ["title", "type", "date", "status", "fileNo", "score"] },
      { label: "B5(b). Awards", rows: awards, fields: ["title", "date", "agency", "level", "score"] },
      { label: "B6. Conferences", rows: confs, fields: ["title", "type", "org", "level", "score"] },
      { label: "B7(a). Proposals", rows: proposals, fields: ["title", "duration", "agency", "amount", "score"] },
      { label: "B7(b). Products", rows: products, fields: ["details", "usage", "score"] },
      { label: "B8(a). FDP / Workshops", rows: fdps, fields: ["program", "duration", "org", "score"] },
      { label: "B8(b). Industrial Training", rows: training, fields: ["company", "duration", "nature", "score"] },
    ];
    const errors = validateCompleteRows(section === "partA" ? partASections : partBSections);
    if (section === "partA") {
      if (innovDetails && !innovScore) errors.push("A(iii). Innovative Teaching Methods: score is required.");
      if (innovScore && !innovDetails) errors.push("A(iii). Innovative Teaching Methods: details are required.");
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
    if (hodAppraisalTab === "partA" && section !== "partA" && !validateSelfAppraisalSectionRows("partA")) return;
    if (hodAppraisalTab === "partB" && section === "summary" && !validateSelfAppraisalSectionRows("partB")) return;
    setHodAppraisalTab(section);
  };

  const selfDraftKey = draftKeyFor({ family: "standard-teaching", email: sessionStorage.getItem("username") || "", academicYear: info.ay });
  const buildSelfDraftForm = () => ({
    info, lectures, courseFile, innovDetails, innovScore, projects, quals, feedback,
    deptActs, uniActs, society, industry, acr, journals, books, ict, research,
    projects2, externalProjects, patents, awards, confs, proposals, products, fdps,
    training, sectionApplicability, sectionSaveStatus,
  });

  useEffect(() => {
    if (appraisalLocked) return;
    const draft = loadDraft(selfDraftKey);
    if (!draft?.form) return;
    const form = draft.form;
    if (form.info) setInfo((current) => ({ ...current, ...form.info }));
    if (Array.isArray(form.lectures)) setLectures(form.lectures);
    if (Array.isArray(form.courseFile)) setCourseFile(form.courseFile);
    if (typeof form.innovDetails === "string") setInnovDetails(form.innovDetails);
    if (form.innovScore !== undefined) setInnovScore(form.innovScore);
    if (Array.isArray(form.projects)) setProjects(form.projects);
    if (Array.isArray(form.quals)) setQuals(form.quals);
    if (Array.isArray(form.feedback)) setFeedback(form.feedback);
    if (Array.isArray(form.deptActs)) setDeptActs(form.deptActs);
    if (Array.isArray(form.uniActs)) setUniActs(form.uniActs);
    if (Array.isArray(form.society)) setSociety(form.society);
    if (Array.isArray(form.industry)) setIndustry(form.industry);
    if (Array.isArray(form.acr)) setAcr(form.acr);
    if (Array.isArray(form.journals)) setJournals(form.journals);
    if (Array.isArray(form.books)) setBooks(form.books);
    if (Array.isArray(form.ict)) setIct(form.ict);
    if (Array.isArray(form.research)) setResearch(form.research);
    if (Array.isArray(form.projects2)) setProjects2(form.projects2);
    if (Array.isArray(form.externalProjects)) setExternalProjects(form.externalProjects);
    if (Array.isArray(form.patents)) setPatents(form.patents);
    if (Array.isArray(form.awards)) setAwards(form.awards);
    if (Array.isArray(form.confs)) setConfs(form.confs);
    if (Array.isArray(form.proposals)) setProposals(form.proposals);
    if (Array.isArray(form.products)) setProducts(form.products);
    if (Array.isArray(form.fdps)) setFdps(form.fdps);
    if (Array.isArray(form.training)) setTraining(form.training);
    if (form.sectionApplicability) setSectionApplicability((current) => ({ ...current, ...form.sectionApplicability }));
    if (form.sectionSaveStatus) setSectionSaveStatus((current) => ({ ...current, ...form.sectionSaveStatus }));
    if (draft.docs) setDocs(draft.docs);
  }, [selfDraftKey, appraisalLocked]);

  useEffect(() => {
    if (appraisalLocked) return undefined;
    const timer = window.setTimeout(() => {
      saveDraft(selfDraftKey, { form: buildSelfDraftForm(), docs });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [selfDraftKey, appraisalLocked, info, lectures, courseFile, innovDetails, innovScore, projects, quals, feedback, deptActs, uniActs, society, industry, acr, journals, books, ict, research, projects2, externalProjects, patents, awards, confs, proposals, products, fdps, training, sectionApplicability, sectionSaveStatus, docs]);
  const handleSubmitAppraisal = async () => {
    if (appraisalLocked) {
      alert("This appraisal has already been submitted and is locked for review.");
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

    const confirmSubmit = window.confirm("Are you sure you want to submit your appraisal? This will save your data to the database.");
    if (!confirmSubmit) return;

    setSubmitting(true);
    try {
      await saveAppraisal({
        facultyEmail: userEmail,
        academicYear: info.ay,
        totals: { partATotal, partBTotal, grandTotal },
        form: {
          lectures,
          courseFile,
          innovDetails,
          innovScore,
          projects,
          quals,
          feedback,
          deptActs,
          uniActs,
          society,
          industry,
          acr,
          journals,
          books,
          ict,
          research,
          projects2,
          externalProjects,
          patents,
          awards,
          confs,
          proposals,
          products,
          fdps,
          training,
        },
        docs,
      });

      setAppraisalLocked(true);
      clearDraft(selfDraftKey);
      alert("Appraisal submitted successfully!");
    } catch (err) {
      console.error("Submission error:", err);
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
    const sourceList = activeMainTab === "facultyApprovals"
      ? facultyList
      : directorList;
    const item = sourceList.find((entry) => entry.id === id);
    if (!item) return;

    try {
      await submitWorkflowReview({
        subjectEmail: item.email,
        academicYear: item.academicYear || item.info?.ay,
        reviewerRole: "dean",
        partAScore: scores.partA,
        partBScore: scores.partB,
        totalScore: scores.total,
        remarks,
        sectionScores,
      });

      const markReviewed = (entry) => entry.id === id
        ? { ...entry, ...sectionScores, innovDean: sectionScores?.innovativeTeaching?.dean ?? entry.innovDean, status: "Reviewed", workflowStatus: reviewedStatusFor("dean"), deanPartA: scores.partA, deanPartB: scores.partB, deanTotal: scores.total, deanRemarks: remarks }
        : entry;

      if (activeMainTab === "facultyApprovals") {
        setFacultyList(prev => prev.map(markReviewed));
      }
      if (activeMainTab === "directorApprovals") {
        setDirectorList(prev => prev.map(markReviewed));
      }
      setReviewingApproval(null);
      alert("Dean review approved and forwarded to VC.");
    } catch (err) {
      console.error("Could not submit Dean review:", err);
      alert(`Unable to submit Dean review.\n\n${err.message}`);
    }
  };

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
          <div key={tab.id} style={{ display: "grid", gap: 10 }}>
            <button onClick={() => { setActiveMainTab(tab.id); setReviewingApproval(null); setSelectedSchoolCode("all"); }}
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
            {tab.id === "myAppraisal" && (
              <div style={{ background: "#1e293b", borderRadius: 9, padding: "12px 13px", display: "grid", gap: 8 }}>
                <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.9 }}>Schools Overseen</div>
                {NON_ENGINEERING_SCHOOLS.map((school) => {
                  const visual = SCHOOL_VISUALS[school.code] || {};
                  return (
                    <div key={school.code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#cbd5e1" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: visual.color || "#64748b", display: "inline-block" }} />
                      <span style={{ color: visual.color || "#cbd5e1", fontWeight: 800 }}>{visual.icon || "•"}</span>
                      <span>{school.code}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
            <div style={{ color: "#475569", fontSize: 9 }}>Dean · {sessionStorage.getItem("department")?.split(" ")[0] || ""}</div>
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

            {appraisalLocked && (
              <div style={{ padding: "12px 16px", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, color: "#312e81", fontSize: 12, fontWeight: 700 }}>
                Submitted and locked for review. This submission can no longer be edited or resubmitted.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ flex: 1, pointerEvents: appraisalLocked && hodAppraisalTab !== "summary" ? "none" : "auto", opacity: appraisalLocked && hodAppraisalTab !== "summary" ? 0.78 : 1 }}>

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
                        <th style={TH}>Title</th>
                        <th style={TH}>Details</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                    {courseFile.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                    <td style={TDC}>{i + 1}</td>
                    <td style={TD}><TI val={r.course} onChange={(v) => setCF(i, "course", v)} /></td>
                    <td style={TD}><TI val={r.title} onChange={(v) => setCF(i, "title", v)} textOnly /></td>
                    <td style={TD}><TI val={r.details} onChange={(v) => setCF(i, "details", v)} /></td>
                    <td style={TD}><DocCell id={`courseFile-${i}`} docs={docs} setDocs={setDocs} /></td>
                    <td style={TD}><ViewCell id={`courseFile-${i}`} docs={docs} /></td>
                    <td style={TDS}><TI val={r.score} numeric onChange={(v) => setCF(i, "score", v)} center /></td>
                   </tr>
                 ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold", color: "#1e3a5f" }}>{courseFileScore.toFixed(1)}</td>
                      </tr>
                  </tbody>
                  </table>
                  <RowBtns onAdd={() =>setCourseFile((p) => [ ...p, { course: "", title: "", details: "", score: "" }])}onDel={() =>setCourseFile((p) => (p.length > 1 ? p.slice(0, -1) : p))}canDel={courseFile.length > 1}/>
                </div>

                {/* A3. Innovative Teaching */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(iii) Innovative Teaching-Learning Methodologies — Max 10 marks</div>
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
                      <tr>
                        <td style={TDC}>1</td>
                        <td style={{ ...TD, fontSize: 10, color: "#555" }}>Blended learning, Virtual Lab, LMS, Project Based Learning, Flip classroom, Any other</td>
                        <td style={TD}><TI val={innovDetails} onChange={setInnovDetails} /></td>
                        <td style={TD}><DocCell id="innov" docs={docs} setDocs={setDocs} /></td>
                        <td style={TD}><ViewCell id="innov" docs={docs} /></td>
                        <td style={TDS}><TI val={innovScore} onChange={setInnovScore} center /></td>
                      </tr>
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{n(innovScore).toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
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
                          <td style={TDS}><TI val={r.score} numeric readOnly={sectionApplicability.projects === "notApplicable"} onChange={(v) => setProj(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Total Score (Max {sectionApplicability.projects === "notApplicable" ? 0 : 10})</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{projectTotal.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {sectionApplicability.projects !== "notApplicable" && <RowBtns onAdd={() => setProjects((p) => [...p, { label: "", score: "" }])} onDel={() => setProjects((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={projects.length > 1} />}
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
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setQual(i, "score", v)} center /></td>
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
                          <td style={TDC}><TI val={r.fb1} numeric onChange={(v) => setFb(i, "fb1", v)} center /></td>
                          <td style={TDC}><TI val={r.fb2} numeric onChange={(v) => setFb(i, "fb2", v)} center /></td>
                          <td style={{ ...TDC, fontWeight: 700, color: "#0ea5e9" }}>{r.fb1 || r.fb2 ? ((n(r.fb1) + n(r.fb2)) / ((r.fb1 ? 1 : 0) + (r.fb2 ? 1 : 0) || 1)).toFixed(2) : ""}</td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(ix) Contribution to Society — Max 10 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Activity</th>
                        <th style={TH}>Details</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {society.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.label} onChange={(v) => setSoc(i, "label", v)} /></td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setSoc(i, "details", v)} /></td>
                          <td style={TD}><DocCell id={`soc-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`soc-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setSoc(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{societyScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setSociety((p) => [...p, { label: "", details: "", score: "" }])} onDel={() => setSociety((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={society.length > 1} />
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
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setAcrRow(i, "score", v)} center /></td>

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
              <SC title="Part B — Research & Academic Contributions (Max 420)" accent="#7c3aed">
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
                        <th style={TH}>Index</th>
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
                          <td style={TD}><TI val={r.degree} readOnly={sectionApplicability.research === "notApplicable"} onChange={(v) => setRes(i, "degree", v)} textOnly /></td>
                          <td style={TD}><TI val={r.name} readOnly={sectionApplicability.research === "notApplicable"} onChange={(v) => setRes(i, "name", v)} textOnly /></td>
                          <td style={TD}><TI val={r.thesis} readOnly={sectionApplicability.research === "notApplicable"} onChange={(v) => setRes(i, "thesis", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`res-${i}`} docs={docs} setDocs={setDocs} readOnly={sectionApplicability.research === "notApplicable"} /></td>
                          <td style={TD}><ViewCell id={`res-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} numeric readOnly={sectionApplicability.research === "notApplicable"} onChange={(v) => setRes(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Score (Max {sectionApplicability.research === "notApplicable" ? 0 : 30})</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{researchScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {sectionApplicability.research !== "notApplicable" && <RowBtns onAdd={() => setResearch((p) => [...p, { degree: "PhD", name: "", thesis: "", score: "" }])} onDel={() => setResearch((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={research.length > 1} />}
                </div>

                {/* B4(b). Research / Consultancy Internal Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B4(b). Ongoing & Completed Research / Consultancy Internal Projects - Max 45 marks (Ongoing: 15, Completed: 30)</div>
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
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setPrj2(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={9}>Total Score (Max 45)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{projectBScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProjects2((p) => [...p, { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "" }])} onDel={() => setProjects2((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={projects2.length > 1} />
                </div>

                {/* B4(c). Research / Consultancy External Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B4(c). Ongoing & Completed Research / Consultancy External Projects - Max 45 marks (Ongoing: 15, Completed: 30)</div>
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
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setExtPrj(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={9}>Total Score (Max 45)</td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B8(a). FDP / Workshops Attended — Max 5 marks</div>
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
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setFdp(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total FDP Score (Max 5)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{fdpScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setFdps((p) => [...p, { program: "", duration: "", org: "", score: "" }])} onDel={() => setFdps((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={fdps.length > 1} />
                </div>

                {/* B8(b). Industrial Training */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B8(b). Industrial Training — Max 5 marks</div>
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
                          <td style={TDS}><TI val={r.score} numeric onChange={(v) => setTrain(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Training Score (Max 5)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{trainScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setTraining((p) => [...p, { company: "", duration: "", nature: "", score: "" }])} onDel={() => setTraining((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={training.length > 1} />
                </div>
              </SC>
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

                <div style={{ padding: "12px", background: g.bg + "40", border: `2px solid ${g.color}60`, borderRadius: 8, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Overall Grade</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: g.color, marginTop: 4 }}>{g.label}</div>
                </div>

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
                    style={{ padding: "10px 28px", background: appraisalLocked || !accuracyConfirmed ? "#64748b" : "#059669", color: "#fff", border: "none", borderRadius: 7, cursor: appraisalLocked || !accuracyConfirmed ? "not-allowed" : submitting ? "wait" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif", opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? "Submitting..." : "✔ Submit Appraisal"}
                  </button>
                </div>
              </SC>
            )}
          </div>
            </div>
          </div>
        )}

        {/* APPROVALS TAB */}
        {(activeMainTab === "directorApprovals" || activeMainTab === "facultyApprovals") && !reviewingApproval && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#0f172a", letterSpacing: -0.5 }}>
                  {activeMainTab === "directorApprovals" ? "Director Reviews" : "Faculty Reviews"}
                </h1>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>{NON_ENGINEERING_SCHOOLS.length} Non-Engineering Schools · AY {info.ay}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: "#fef3c7", color: "#92400e" }}>⏳ {pendingCount} Pending</div>
                <div style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: "#d1fae5", color: "#065f46" }}>✔ {reviewedCount} Reviewed</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {schoolTabs.map((school) => {
                const active = selectedSchoolCode === school.code;
                return (
                  <button
                    key={school.code}
                    onClick={() => setSelectedSchoolCode(school.code)}
                    style={{
                      minWidth: school.code === "all" ? 132 : 112,
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 14px",
                      cursor: "pointer",
                      fontFamily: "Georgia, serif",
                      background: active ? school.color : school.bg,
                      color: active ? "#fff" : "#334155",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 900,
                      boxShadow: active ? "0 8px 18px rgba(15,23,42,0.16)" : "none",
                    }}
                  >
                    <span>{school.icon}</span>
                    <span>{school.label}</span>
                    <span style={{ minWidth: 22, borderRadius: 12, padding: "2px 6px", background: active ? "rgba(255,255,255,0.2)" : "#cbd5e1", color: active ? "#fff" : "#475569", fontSize: 10 }}>
                      {school.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#fff", borderRadius: 9, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Filter:</span>
              {[
                ["All", "All"],
                ["Pending Review", "Pending Dean Review"],
                ["Reviewed", "Dean Reviewed"],
              ].map(([value, label]) => (
                <button key={value} onClick={() => setFilterStatus(value)}
                  style={{ fontSize: 11, padding: "4px 12px", border: "1px solid #e2e8f0", borderRadius: 20, cursor: "pointer", fontFamily: "Georgia, serif", background: filterStatus === value ? "#0f172a" : "none", color: filterStatus === value ? "#f1f5f9" : "#475569" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Faculty Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
              {filtered.map(faculty => {
                const facPartA = [
                  ...(faculty.lectures || []).map(r => n(r.score)),
                  n(faculty.courseFile?.score), n(faculty.innovScore),
                  ...(faculty.projects || []).map(r => n(r.score)),
                  ...(faculty.quals || []).map(r => n(r.score)),
                  ...(faculty.feedback || []).map(r => n(r.score)),
                  ...(faculty.deptActs || []).map(r => n(r.score)),
                  ...(faculty.uniActs || []).map(r => n(r.score)),
                  ...(faculty.society || []).map(r => n(r.score)),
                  ...(faculty.industry || []).map(r => n(r.score)),
                ].reduce((a, b) => a + b, 0);

                const facPartB = [
                  ...(faculty.journals || []).map(r => n(r.score)),
                  ...(faculty.books || []).map(r => n(r.score)),
                  ...(faculty.confs || []).map(r => n(r.score)),
                  ...(faculty.patents || []).map(r => n(r.score)),
                ].reduce((a, b) => a + b, 0);

                const docCount = Object.values(faculty.docs || {}).reduce((a, arr) => a + arr.length, 0);

                return (
                  <div key={faculty.id} style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 6px rgba(0,0,0,.07)", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Avatar initials={faculty.avatar} color={faculty.avatarColor} size={46} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{faculty.name}</div>
                        <div style={{ fontSize: 11, color: "#475569", marginBottom: 2 }}>{faculty.designation}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{faculty.employeeId}</div>
                      </div>
                      <StatusBadge status={faculty.status} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, background: "#f8fafc", borderRadius: 8, padding: "12px 14px" }}>
                      {[
                        { label: "Part A", val: facPartA, max: 200, color: "#6366f1" },
                        { label: "Part B", val: facPartB, max: 420, color: "#0ea5e9" },
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
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>Submitted: {faculty.submittedOn}</div>
                      <button onClick={() => setReviewingApproval(faculty)}
                        style={{ fontSize: 11, padding: "7px 18px", background: /Reviewed|Approved|Rejected/.test(faculty.status) ? "#1e293b" : "#312e81", color: "#f1f5f9", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontFamily: "Georgia, serif" }}>
                        {/Reviewed|Approved|Rejected/.test(faculty.status) ? "View Review" : "Review Form"}
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
                <div style={{ color: "#64748b", fontSize: 12 }}>No records match the selected school / status filter.</div>
              </div>
            )}
          </>
        )}

        {/* REVIEW PANEL */}
        {(activeMainTab === "directorApprovals" || activeMainTab === "facultyApprovals") && reviewingApproval && (
          formTypeForSchool(getSchoolKey(reviewingApproval.school)) === FORM_TYPES.MEDIA_COMM ? (
            <MediaCommAuthorityReviewPanel
              person={reviewingApproval}
              reviewerRole="dean"
              onBack={() => setReviewingApproval(null)}
              onSubmit={handleSubmitReview}
              readOnly={/Reviewed|Approved|Rejected/.test(reviewingApproval.status || "")}
            />
          ) : formTypeForSchool(getSchoolKey(reviewingApproval.school)) === FORM_TYPES.DESIGN_ARTS ? (
            <DesignArtsAuthorityReviewPanel
              person={reviewingApproval}
              reviewerRole="dean"
              onBack={() => setReviewingApproval(null)}
              onSubmit={handleSubmitReview}
              readOnly={/Reviewed|Approved|Rejected/.test(reviewingApproval.status || "")}
            />
          ) : (
            <ApprovalReviewPanel
              approval={reviewingApproval}
              approvalType={activeMainTab}
              onBack={() => setReviewingApproval(null)}
              onSubmit={handleSubmitReview}
              readOnly={/Reviewed|Approved|Rejected/.test(reviewingApproval.status || "")}
            />
          )
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

