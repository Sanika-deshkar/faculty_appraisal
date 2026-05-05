import { useState, useRef, useEffect } from "react";
import { HodInput } from "../components/Inputs";
import { useNavigate } from "react-router-dom";
import { SOCIETY_LABELS, ACR_LABELS, MAX_SCORES, APP_INFO } from "../constants/formConfig";
import { DIRECTOR_USER, HOD_LIST, FACULTY_LIST, DIRECTOR_SELF_DATA } from "../data/mockData";
import { loadAppraisalDocuments, loadSavedAppraisal, saveAppraisal } from "../services/appraisalPersistence";
import { uploadToCloudinary } from "../services/cloudinary";
import { fetchReviewQueueForRole, submitWorkflowReview } from "../services/reviewWorkflow";
import { reviewedStatusFor, profileFromLocalStorage } from "../utils/hierarchy";

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
function TI({ val, onChange, center, placeholder }) {
  return (
    <input
      value={val ?? ""} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || ""}
      style={center
        ? { width: "100%", maxWidth: "100%", height: 30, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, lineHeight: 1.25, fontFamily: "Georgia, serif", outline: "none", textAlign: "center" }
        : { width: "100%", maxWidth: "100%", height: 30, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, lineHeight: 1.25, fontFamily: "Georgia, serif", outline: "none" }}
    />
  );
}

function DocCell({ id, docs, setDocs }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const handleFiles = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    setUploading(true);
    try {
      const uploadedFiles = [];
      for (const file of selectedFiles) {
        uploadedFiles.push(await uploadToCloudinary(file, { folder: `faculty-appraisal/${id}` }));
      }
      setDocs((p) => ({ ...p, [id]: [...(p[id] || []), ...uploadedFiles] }));
    } catch (err) {
      console.error("Cloudinary upload error:", err);
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
          <button onClick={() => removeFile(idx)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 10, cursor: "pointer" }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "4px 6px", border: "1px dashed #cbd5e1", borderRadius: 4, background: "#f8fafc" }} onClick={() => ref.current.click()}>
        <span style={{ fontSize: 10, color: "#64748b" }}>📎 Attach</span>
        <input ref={ref} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
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

function DirInput({ val, onChange }) {
  return (
    <input type="number" min="0" step="0.5" value={val ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{ width: 58, textAlign: "center", border: "1.5px solid #0ea5e9", borderRadius: 5, padding: "3px 5px", fontSize: 11, fontFamily: "Georgia, serif", outline: "none", background: "#f0fbff" }}
    />
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

const REVIEW_ARRAY_KEYS = ["lectures", "courseFile", "projects", "quals", "feedback", "deptActs", "uniActs", "society", "industry", "acr", "journals", "books", "ict", "research", "projects2", "patents", "awards", "confs", "proposals", "fdps", "training"];
const buildDirectorSectionScores = (faculty, dirData) => {
  const payload = {};
  REVIEW_ARRAY_KEYS.forEach((key) => {
    const rows = Array.isArray(faculty[key]) ? faculty[key] : [];
    payload[key] = rows.map((row, index) => ({
      ...row,
      director: dirData[key]?.[index]?.dir ?? row.director ?? "",
    }));
  });
  payload.innovativeTeaching = {
    director: dirData.innovDir ?? faculty.innovDirector ?? "",
  };
  return payload;
};

// ─── Faculty Form in HOD Review Mode ─────────────────────────────────────────
function FacultyReviewForm({ faculty, hodData, setHodData, dirData, setDirData }) {
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

  const { info, lectures, courseFile, projects, quals, feedback, deptActs, uniActs, society, industry, acr, journals, books, ict, research, patents, awards, confs, proposals, fdps, training, docs } = faculty;
  const courseFileRow = Array.isArray(courseFile) ? (courseFile[0] || {}) : (courseFile || {});

  const rows = (arr) => arr && arr.length > 0 ? arr : [{}];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* HOD Review Banner */}
      <div style={{ background: "linear-gradient(90deg,#065f46,#059669)", color: "#d1fae5", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
        <span style={{ fontSize: 18 }}>🔍</span>
        <div>
          <strong>Director Review Mode</strong> — Faculty data and <span style={{ color: "#6ee7b7", fontWeight: 700 }}>HOD Scores</span> are read-only. Only <span style={{ color: "#6ee7b7", fontWeight: 700 }}>Director Score</span> columns are editable. Click <span style={{ color: "#6ee7b7" }}>📄 View Doc</span> links to open uploaded files.
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
              <th style={TH}>Planned</th><th style={TH}>Conducted</th>
              <th style={TH}>View Docs</th>
              <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                  <td style={TDS_HOD}><RO val={get("lectures", i, "hod")} center /></td>
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
            <th style={TH}>Course</th><th style={TH}>Title</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={TD}><RO val={courseFileRow.course} /></td>
              <td style={TD}><RO val={courseFileRow.title} /></td>
              <td style={TDC}><RO val={courseFileRow.details} center /></td>
              <td style={TDV}><ViewDocsCell docKey="cf-0" docs={docs} /></td>
              <td style={TDS}><RO val={courseFileRow.score} center /></td>
              <td style={TDS_HOD}><RO val={get("courseFile", null, "hod")} center /></td>
              <td style={TDS_DIR}><DirInput val={getDir("courseFile", null, "dir")} onChange={v => setDir("courseFile", null, "dir", v)} /></td>
            </tr>
          </tbody>
        </table>
      </SC>

      {/* A3: Innovative Teaching */}
      <SC title="A3. Innovative Teaching-Learning (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>Method</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            <tr>
              <td style={TD}>Innovative / participatory teaching methods used</td>
              <td style={TDS}><RO val={faculty.innovScore} center /></td>
              <td style={TDS_HOD}><RO val={getS("innovHod")} center /></td>
              <td style={TDS_DIR}><DirInput val={getDirS("innovDir")} onChange={v => setDirScalar("innovDir", v)} /></td>
            </tr>
          </tbody>
        </table>
      </SC>

      {/* A4: Projects */}
      <SC title="A4. Projects (Max 10)" accent="#8b5cf6">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Project Type</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(projects).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDV}><ViewDocsCell docKey={`proj-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><RO val={get("projects", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("projects", i, "dir")} onChange={v => setDir("projects", i, "dir", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(quals).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDV}><ViewDocsCell docKey={`qual-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><RO val={get("quals", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("quals", i, "dir")} onChange={v => setDir("quals", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B: Student Feedback */}
      <SC title="B. Student Feedback (Max 10)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Course</th><th style={TH}>Feedback 1</th>
            <th style={TH}>Feedback 2</th><th style={TH}>Average</th>
            <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("feedback", i, "hod")} center /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(deptActs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.activity} /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`dept-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><RO val={get("deptActs", i, "hod")} center /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(uniActs).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.activity} /></td>
                <td style={TD}><RO val={r.nature} /></td>
                <td style={TDV}><ViewDocsCell docKey={`uni-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><RO val={get("uniActs", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("uniActs", i, "dir")} onChange={v => setDir("uniActs", i, "dir", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(society).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`soc-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><RO val={get("society", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("society", i, "dir")} onChange={v => setDir("society", i, "dir", v)} /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(industry).map((r, i) => (
              <tr key={i}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.name} /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`ind-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={r.score} center /></td>
                <td style={TDS_HOD}><RO val={get("industry", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("industry", i, "dir")} onChange={v => setDir("industry", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* G: ACR */}
      <SC title="G. Annual Confidential Report (Max 25)" accent="#ef4444">
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>⚠️ ACR is assessed by HOD only — faculty does not fill scores. Director can add override scores.</div>
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Parameter</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
          </tr></thead>
          <tbody>
            {rows(acr).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDS_HOD}><RO val={get("acr", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("acr", i, "dir")} onChange={v => setDir("acr", i, "dir", v)} /></td>
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
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                  <td style={TDS_HOD}><RO val={get("journals", i, "hod")} center /></td>
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
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Book & Publisher</th>
              <th style={TH}>ISBN</th><th style={TH}>First Author?</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {rows(books).map((r, i) => (
                <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                  <td style={TDC}>{i + 1}</td>
                  <td style={TD}><RO val={r.title} /></td>
                  <td style={TD}><RO val={r.book} /></td>
                  <td style={TDC}><RO val={r.issn} center /></td>
                  <td style={TDC}><RO val={r.first} center /></td>
                  <td style={TDV}><ViewDocsCell docKey={`book-${i}`} docs={docs} /></td>
                  <td style={TDS}><RO val={r.score} center /></td>
                  <td style={TDS_HOD}><RO val={get("books", i, "hod")} center /></td>
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
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("ict", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("ict", i, "dir")} onChange={v => setDir("ict", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B4: Research Guidance */}
      <SC title="B4. Research Guidance — PhD / PG (Max 30)" accent="#059669">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Degree</th><th style={TH}>Student Name</th><th style={TH}>Status</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("research", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("research", i, "dir")} onChange={v => setDir("research", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <SC title="B4b. Research Projects (Max 45)" accent="#059669">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Agency</th>
              <th style={TH}>Sanction Date</th><th style={TH}>Amount</th><th style={TH}>Role</th><th style={TH}>Status</th>
              <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                  <td style={TDS_HOD}><RO val={get("projects2", i, "hod")} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("projects2", i, "dir")} onChange={v => setDir("projects2", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* B5: Patents */}
      <SC title="B5a. Patents / IPR (Max 40)" accent="#f97316">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Type</th>
              <th style={TH}>Filed</th><th style={TH}>Status</th><th style={TH}>File No.</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                  <td style={TDS_HOD}><RO val={get("patents", i, "hod")} center /></td>
                  <td style={TDS_DIR}><DirInput val={getDir("patents", i, "dir")} onChange={v => setDir("patents", i, "dir", v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SC>

      {/* B5b: Awards */}
      <SC title="B5b. Awards / Fellowships (Max 10)" accent="#f97316">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Award Title</th><th style={TH}>Date</th>
            <th style={TH}>Agency</th><th style={TH}>Level</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("awards", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("awards", i, "dir")} onChange={v => setDir("awards", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B6: Conferences */}
      <SC title="B6. Conferences / Papers Presented (Max 30)" accent="#6366f1">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title / Session</th><th style={TH}>Type</th>
            <th style={TH}>Organizer</th><th style={TH}>Level</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("confs", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("confs", i, "dir")} onChange={v => setDir("confs", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B7: Proposals */}
      <SC title="B7. Research Proposals / Products (Max 20)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Duration</th>
            <th style={TH}>Funding Agency</th><th style={TH}>Amount</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("proposals", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("proposals", i, "dir")} onChange={v => setDir("proposals", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B8: Self Dev */}
      <SC title="B8. Self Development — FDP / Training (Max 10)" accent="#10b981">
        <div style={{ fontWeight: 600, fontSize: 11, color: "#475569", marginBottom: 6 }}>FDP / Workshops</div>
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Program</th><th style={TH}>Duration</th><th style={TH}>Organizer</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("fdps", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("fdps", i, "dir")} onChange={v => setDir("fdps", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontWeight: 600, fontSize: 11, color: "#475569", margin: "12px 0 6px" }}>Industrial Training</div>
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Company</th><th style={TH}>Duration</th><th style={TH}>Nature</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
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
                <td style={TDS_HOD}><RO val={get("training", i, "hod")} center /></td>
                <td style={TDS_DIR}><DirInput val={getDir("training", i, "dir")} onChange={v => setDir("training", i, "dir", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>
    </div>
  );
}

// ─── Full Review Panel (opened when HOD clicks Review) ────────────────────────
function ReviewPanel({ faculty, onBack, onSubmit, readOnly = false }) {
  const [hodData, setHodData] = useState({});
  const [dirData, setDirData] = useState({});
  const [hodRemarks] = useState(faculty.hodRemarks || "");
  const [dirRemarks, setDirRemarks] = useState(faculty.directorRemarks || "");
  const [tab, setTab] = useState("form");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const reviewLocked = readOnly || /Reviewed|Rejected/.test(faculty.status || "");

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
    const pat = (faculty.patents || []).reduce((a, _, i) => a + get("patents", i, "hod"), 0);
    const awd = (faculty.awards || []).reduce((a, _, i) => a + get("awards", i, "hod"), 0);
    const conf = (faculty.confs || []).reduce((a, _, i) => a + get("confs", i, "hod"), 0);
    const prop = (faculty.proposals || []).reduce((a, _, i) => a + get("proposals", i, "hod"), 0);
    const fdp = (faculty.fdps || []).reduce((a, _, i) => a + get("fdps", i, "hod"), 0);
    const train = (faculty.training || []).reduce((a, _, i) => a + get("training", i, "hod"), 0);
    const partB = jour + bk + ictT + res + resProjects + pat + awd + conf + prop + fdp + train;

    return { partA, partB, total: partA + partB };
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

    const lec = (faculty.lectures || []).reduce((a, _, i) => a + getD("lectures", i, "dir"), 0);
    const cf = getD("courseFile", null, "dir");
    const innov = getDirS("innovDir");
    const proj = (faculty.projects || []).reduce((a, _, i) => a + getD("projects", i, "dir"), 0);
    const qual = (faculty.quals || []).reduce((a, _, i) => a + getD("quals", i, "dir"), 0);
    const fb = (faculty.feedback || []).reduce((a, _, i) => a + getD("feedback", i, "dir"), 0);
    const dept = (faculty.deptActs || []).reduce((a, _, i) => a + getD("deptActs", i, "dir"), 0);
    const uni = (faculty.uniActs || []).reduce((a, _, i) => a + getD("uniActs", i, "dir"), 0);
    const soc = (faculty.society || []).reduce((a, _, i) => a + getD("society", i, "dir"), 0);
    const ind = (faculty.industry || []).reduce((a, _, i) => a + getD("industry", i, "dir"), 0);
    const acrT = (faculty.acr || []).reduce((a, _, i) => a + getD("acr", i, "dir"), 0);
    const partA = lec + cf + innov + proj + qual + fb + dept + uni + soc + ind + acrT;

    const jour = (faculty.journals || []).reduce((a, _, i) => a + getD("journals", i, "dir"), 0);
    const bk = (faculty.books || []).reduce((a, _, i) => a + getD("books", i, "dir"), 0);
    const ictT = (faculty.ict || []).reduce((a, _, i) => a + getD("ict", i, "dir"), 0);
    const res = (faculty.research || []).reduce((a, _, i) => a + getD("research", i, "dir"), 0);
    const resProjects = (faculty.projects2 || []).reduce((a, _, i) => a + getD("projects2", i, "dir"), 0);
    const pat = (faculty.patents || []).reduce((a, _, i) => a + getD("patents", i, "dir"), 0);
    const awd = (faculty.awards || []).reduce((a, _, i) => a + getD("awards", i, "dir"), 0);
    const conf = (faculty.confs || []).reduce((a, _, i) => a + getD("confs", i, "dir"), 0);
    const prop = (faculty.proposals || []).reduce((a, _, i) => a + getD("proposals", i, "dir"), 0);
    const fdp = (faculty.fdps || []).reduce((a, _, i) => a + getD("fdps", i, "dir"), 0);
    const train = (faculty.training || []).reduce((a, _, i) => a + getD("training", i, "dir"), 0);
    const partB = jour + bk + ictT + res + resProjects + pat + awd + conf + prop + fdp + train;

    return { partA, partB, total: partA + partB };
  };

  const { partA, partB, total } = calcHodScore();
  const { partA: dirPartA, partB: dirPartB, total: dirTotal } = calcDirScore();
  const g = grade(dirTotal > 0 ? dirTotal : total, 575);

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
            <div style={{ color: g.color, fontWeight: 800, fontSize: 16 }}>{(dirTotal > 0 ? dirTotal : total).toFixed(1)}<span style={{ fontSize: 10, color: "#94a3b8" }}>/575</span></div>
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

      {tab === "form" && (
        <fieldset disabled={reviewLocked} style={{ border: "none", padding: 0, margin: 0 }}>
          <FacultyReviewForm faculty={faculty} hodData={hodData} setHodData={setHodData} dirData={dirData} setDirData={setDirData} />
        </fieldset>
      )}

      {tab === "remarks" && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "22px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: 15 }}>{reviewLocked ? "Director Submitted Review" : "Director Remarks & Final Submission"}</h3>

          {/* Score Summary */}
          <table style={{ ...T, marginBottom: 18 }}>
            <thead><tr>
              <th style={TH}>Section</th><th style={TH}>Max</th>
              <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th><th style={TH_DIR}>Director Score</th>
            </tr></thead>
            <tbody>
              {[
                ["Part A — Teaching & Activities", 200, faculty.lectures?.reduce((a, r) => a + n(r.score), 0) || 0, partA, dirPartA],
                ["Part B — Research & Contributions", 375, faculty.journals?.reduce((a, r) => a + n(r.score), 0) || 0, partB, dirPartB],
              ].map(([label, max, fac, hod, dir]) => (
                <tr key={label}>
                  <td style={TD}>{label}</td>
                  <td style={TDC}>{max}</td>
                  <td style={TDS}>{fac.toFixed(1)}</td>
                  <td style={{ ...TDS_HOD, fontWeight: 700, color: "#312e81" }}>{hod.toFixed(1)}</td>
                  <td style={{ ...TDS_DIR, fontWeight: 700, color: "#065f46" }}>{dir.toFixed(1)}</td>
                </tr>
              ))}
              <tr style={{ background: "#d1fae5", fontWeight: 700 }}>
                <td style={TD}>Grand Total</td>
                <td style={TDC}>575</td>
                <td style={TDS}>—</td>
                <td style={{ ...TDS_HOD, color: "#312e81", fontSize: 14 }}>{total.toFixed(1)}</td>
                <td style={{ ...TDS_DIR, color: "#065f46", fontSize: 14 }}>{dirTotal.toFixed(1)}</td>
              </tr>
              <tr style={{ background: g.bg }}>
                <td style={TD} colSpan={4}><strong>Grade (based on Director Score)</strong></td>
                <td style={{ ...TDC, color: g.color, fontWeight: 800 }}>{g.label}</td>
              </tr>
            </tbody>
          </table>

          {/* HOD Remarks — pre-filled, read-only */}
          <label style={{ fontWeight: 700, fontSize: 13, color: "#312e81", display: "block", marginBottom: 6 }}>HOD Remarks <span style={{ fontWeight: 400, fontSize: 11, color: "#64748b" }}>(read-only)</span></label>
          <div style={{ width: "100%", border: "1px solid #c7d2fe", borderRadius: 7, padding: "10px 12px", fontSize: 12, fontFamily: "Georgia, serif", background: "#f0f4ff", color: "#334155", marginBottom: 16, minHeight: 60, whiteSpace: "pre-wrap", boxSizing: "border-box" }}>
            {hodRemarks || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>No HOD remarks provided.</span>}
          </div>

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
            <button onClick={() => onSubmit(faculty.id, { partA: dirPartA, partB: dirPartB, total: dirTotal || total }, dirRemarks, buildDirectorSectionScores(faculty, dirData), reviewConfirmed)}
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
  const [reviewingFaculty, setReviewingFaculty] = useState(null);
  const [reviewingHod, setReviewingHod] = useState(null);
  
  const dirSchool = localStorage.getItem("school");
  const hasHOD = localStorage.getItem("hasHod") === "true";
  
  const [facultyList, setFacultyList] = useState([]);
  const [hodList, setHodList] = useState([]);

  useEffect(() => {
    const loadReviewQueue = async () => {
      try {
        const items = await fetchReviewQueueForRole({
          reviewerRole: "director",
          reviewerProfile: { ...profileFromLocalStorage(), school: dirSchool },
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
    name: localStorage.getItem("name") || "", 
    qual: "", 
    desig: localStorage.getItem("role") === "director" ? "Director" : "", 
    ay: "2025-2026" 
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

  useEffect(() => {
    const userEmail = localStorage.getItem("username");
    if (!userEmail || !info.ay) return;

    const loadOwnAppraisal = async () => {
      try {
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
              setPatents,
              setAwards,
              setConfs,
              setProposals,
              setFdps,
              setTraining,
            },
          }),
          loadAppraisalDocuments({
            facultyEmail: userEmail,
            academicYear: info.ay,
            setDocs,
          }),
        ]);
      } catch (err) {
        console.error("Could not load saved director appraisal:", err);
      }
    };

    loadOwnAppraisal();
  }, [info.ay]);

  // ── Computed scores for HOD appraisal ──
  const totalLecScore = lectures.reduce((a, r) => a + n(r.score), 0);
  const courseFileScore = courseFile.reduce((a, r) => a + n(r.score), 0);
  const innovTotal = n(innovScore);
  const projectTotal = projects.reduce((a, r) => a + n(r.score), 0);
  const qualTotal = quals.reduce((a, r) => a + n(r.score), 0);
  const teachingRaw = totalLecScore + courseFileScore + innovTotal + projectTotal + qualTotal;
  const stuFeedbackScore = feedback.reduce((a, r) => a + n(r.score), 0);
  const deptScore = deptActs.reduce((a, r) => a + n(r.score), 0);
  const uniScore = uniActs.reduce((a, r) => a + n(r.score), 0);
  const societyScore = society.reduce((a, r) => a + n(r.score), 0);
  const industryScore = industry.reduce((a, r) => a + n(r.score), 0);
  const acrScore = acr.reduce((a, r) => a + n(r.score), 0);
  const partATotal = Math.min(200, teachingRaw + stuFeedbackScore + deptScore + uniScore + societyScore + industryScore + acrScore);

  const journalScore = journals.reduce((a, r) => a + n(r.score), 0);
  const bookScore = books.reduce((a, r) => a + n(r.score), 0);
  const ictScore = ict.reduce((a, r) => a + n(r.score), 0);
  const researchScore = research.reduce((a, r) => a + n(r.score), 0);
  const projectBScore = projects2.reduce((a, r) => a + n(r.score), 0);
  const patentScore = patents.reduce((a, r) => a + n(r.score), 0);
  const awardScore = awards.reduce((a, r) => a + n(r.score), 0);
  const confScore = confs.reduce((a, r) => a + n(r.score), 0);
  const proposalScore = proposals.reduce((a, r) => a + n(r.score), 0);
  const fdpScore = fdps.reduce((a, r) => a + n(r.score), 0);
  const trainScore = training.reduce((a, r) => a + n(r.score), 0);
  const partBTotal = journalScore + bookScore + ictScore + researchScore + projectBScore + patentScore + awardScore + confScore + proposalScore + fdpScore + trainScore;
  const grandTotal = partATotal + partBTotal;

  const gradeFunc = () => {
    const p = pct(grandTotal, 575);
    if (p >= 85) return { label: "Outstanding", color: "#10b981" };
    if (p >= 70) return { label: "Very Good", color: "#3b82f6" };
    if (p >= 55) return { label: "Good", color: "#f59e0b" };
    if (p >= 40) return { label: "Satisfactory", color: "#f97316" };
    return { label: "Needs Improvement", color: "#ef4444" };
  };
  const g = gradeFunc();

  const facultyPendingCount = facultyList.filter(f => f.status === "Pending Review").length;
  const facultyReviewedCount = facultyList.filter(f => f.status === "Reviewed").length;
  const hodPendingCount = hodList.filter(h => h.status === "Pending Review").length;
  const hodReviewedCount = hodList.filter(h => h.status === "Reviewed").length;

  const navItems = [
    { id: "myAppraisal", icon: "👤", label: "My Appraisal", sub: "View your self-appraisal form" },
    { id: "facultyApprovals", icon: "🎓", label: "Faculty Approvals", sub: `${facultyPendingCount} awaiting review`, badge: facultyPendingCount },
    { id: "hodApprovals", icon: "👥", label: "HOD Approvals", sub: `${hodPendingCount} awaiting review`, badge: hodPendingCount },
  ];
  const [submitting, setSubmitting] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);

  const handleSubmitAppraisal = async () => {
    if (!accuracyConfirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting.");
      return;
    }
    if (!info.name || !info.ay) {
      alert("Please fill in basic faculty information (Name, Academic Year).");
      setHodAppraisalTab("partA");
      return;
    }

    const userEmail = localStorage.getItem("username");
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
          patents,
          awards,
          confs,
          proposals,
          fdps,
          training,
        },
        docs,
      });

      alert("Appraisal submitted successfully!");
    } catch (err) {
      console.error("Submission error:", err);
      alert(`Unable to submit appraisal.\n\n${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

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
        <th>Planned</th><th>Conducted</th><th>Score</th>
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

    <p class="total">Part A Total: ${partATotal}</p>

    <div class="page-break"></div>

    <!-- ================= PART B ================= -->
    <h2>PART B — Research & Development</h2>

    <h3>Journals</h3>
    <table>
      <tr><th>Title</th><th>Journal</th><th>Index</th><th>Score</th></tr>
      ${journals.map(j => `<tr><td>${j.title || "&nbsp;"}</td><td>${j.journal || "&nbsp;"}</td><td>${j.index || "&nbsp;"}</td><td class="center">${j.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Books</h3>
    <table>
      <tr><th>Title</th><th>Publisher</th><th>Score</th></tr>
      ${books.map(b => `<tr><td>${b.title || "&nbsp;"}</td><td>${b.book || "&nbsp;"}</td><td class="center">${b.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>ICT</h3>
    <table>
      <tr><th>Title</th><th>Description</th><th>Score</th></tr>
      ${ict.map(i => `<tr><td>${i.title || "&nbsp;"}</td><td>${i.desc || "&nbsp;"}</td><td class="center">${i.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Research Guidance</h3>
    <table>
      <tr><th>Degree</th><th>Name</th><th>Thesis</th><th>Score</th></tr>
      ${research.map(r => `<tr><td>${r.degree || "&nbsp;"}</td><td>${r.name || "&nbsp;"}</td><td>${r.thesis || "&nbsp;"}</td><td class="center">${r.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Research Projects</h3>
    <table>
      <tr><th>Title</th><th>Agency</th><th>Amount</th><th>Score</th></tr>
      ${projects2.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.agency || "&nbsp;"}</td><td>${p.amount || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Patents</h3>
    <table>
      <tr><th>Title</th><th>Type</th><th>Date</th><th>Score</th></tr>
      ${patents.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.type || "&nbsp;"}</td><td>${p.date || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Awards</h3>
    <table>
      <tr><th>Title</th><th>Date</th><th>Agency</th><th>Score</th></tr>
      ${awards.map(a => `<tr><td>${a.title || "&nbsp;"}</td><td>${a.date || "&nbsp;"}</td><td>${a.agency || "&nbsp;"}</td><td class="center">${a.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Conferences</h3>
    <table>
      <tr><th>Title</th><th>Type</th><th>Organizer</th><th>Score</th></tr>
      ${confs.map(c => `<tr><td>${c.title || "&nbsp;"}</td><td>${c.type || "&nbsp;"}</td><td>${c.org || "&nbsp;"}</td><td class="center">${c.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Proposals</h3>
    <table>
      <tr><th>Title</th><th>Duration</th><th>Agency</th><th>Score</th></tr>
      ${proposals.map(p => `<tr><td>${p.title || "&nbsp;"}</td><td>${p.duration || "&nbsp;"}</td><td>${p.agency || "&nbsp;"}</td><td class="center">${p.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>FDP / Training</h3>
    <table>
      <tr><th>Program</th><th>Duration</th><th>Organization</th><th>Score</th></tr>
      ${fdps.map(f => `<tr><td>${f.program || "&nbsp;"}</td><td>${f.duration || "&nbsp;"}</td><td>${f.org || "&nbsp;"}</td><td class="center">${f.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <h3>Industrial Training</h3>
    <table>
      <tr><th>Company</th><th>Duration</th><th>Nature</th><th>Score</th></tr>
      ${training.map(t => `<tr><td>${t.company || "&nbsp;"}</td><td>${t.duration || "&nbsp;"}</td><td>${t.nature || "&nbsp;"}</td><td class="center">${t.score || "&nbsp;"}</td></tr>`).join('')}
    </table>

    <p class="total">Part B Total: ${partBTotal}</p>
    <p class="total">Grand Total: ${grandTotal}</p>
    <p class="total">Grade: ${g.label}</p>

  </body>
  </html>
  `;

  win.document.write(html);
  win.document.close();
  win.print();
};

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
        academicYear: item.academicYear || item.info?.ay,
        reviewerRole: "director",
        partAScore: scores.partA,
        partBScore: scores.partB,
        totalScore: scores.total,
        remarks,
        sectionScores,
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
    ? (filterStatus === "All" ? hodList : (filterStatus === "Pending Review" ? hodList.filter(h => h.status === "Pending Review") : hodList.filter(h => h.status === "Reviewed")))
    : (filterStatus === "All" ? facultyList : (filterStatus === "Pending Review" ? facultyList.filter(f => f.status === "Pending Review") : facultyList.filter(f => f.status === "Reviewed")));

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
              onChange={(e) => setHodAppraisalTab(e.target.value)}
              style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "7px 8px", fontSize: 12, fontFamily: "Georgia, serif", color: "#e2e8f0", background: "#0f172a", outline: "none" }}
            >
              <option value="partA">Part A</option>
              <option value="partB">Part B</option>
              <option value="summary">Summary</option>
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
          <Avatar initials={(localStorage.getItem("name") || "U").split(" ").map(n => n[0]).join("").toUpperCase()} color="#6366f1" size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 700 }}>{(localStorage.getItem("name") || "User").split(" ").slice(0, 2).join(" ")}</div>
            <div style={{ color: "#475569", fontSize: 9 }}>Director · {localStorage.getItem("department")?.split(" ")[0] || ""}</div>
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
                  📊 Total Part A Score: {partATotal.toFixed(1)}/200
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
                        <th style={TH}>Planned</th>
                        <th style={TH}>Conducted</th>
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
                          <td style={TD}><TI val={r.code} onChange={(v) => setLec(i, "code", v)} /></td>
                          <td style={TDC}><TI val={r.planned} onChange={(v) => setLec(i, "planned", v)} center /></td>
                          <td style={TDC}><TI val={r.conducted} onChange={(v) => setLec(i, "conducted", v)} center /></td>
                          <td style={TD}><DocCell id={`lec-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`lec-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setLec(i, "score", v)} center /></td>
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
                    <td style={TD}><TI val={r.title} onChange={(v) => setCF(i, "title", v)} /></td>
                    <td style={TD}><TI val={r.details} onChange={(v) => setCF(i, "details", v)} /></td>
                    <td style={TD}><DocCell id={`courseFile-${i}`} docs={docs} setDocs={setDocs} /></td>
                    <td style={TD}><ViewCell id={`courseFile-${i}`} docs={docs} /></td>
                    <td style={TDS}><TI val={r.score} onChange={(v) => setCF(i, "score", v)} center /></td>
                   </tr>
                 ))}
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(iv) Projects — Max 10 marks</div>
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
                          <td style={TD}><TI val={r.label} onChange={(v) => setProj(i, "label", v)} /></td>
                          <td style={TD}><DocCell id={`proj-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`proj-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setProj(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{projectTotal.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProjects((p) => [...p, { label: "", score: "" }])} onDel={() => setProjects((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={projects.length > 1} />
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setQual(i, "score", v)} center /></td>
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
                        <th style={TH}>Course Code</th>
                        <th style={TH}>Feedback 1</th>
                        <th style={TH}>Feedback 2</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.code} onChange={(v) => setFb(i, "code", v)} /></td>
                          <td style={TDC}><TI val={r.fb1} onChange={(v) => setFb(i, "fb1", v)} center /></td>
                          <td style={TDC}><TI val={r.fb2} onChange={(v) => setFb(i, "fb2", v)} center /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setFb(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Total Score (Max 10)</td>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setDept(i, "score", v)} center /></td>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setUni(i, "score", v)} center /></td>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setSoc(i, "score", v)} center /></td>
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
                          <td style={TD}><TI val={r.name} onChange={(v) => setInd(i, "name", v)} /></td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setInd(i, "details", v)} /></td>
                          <td style={TD}><DocCell id={`ind-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`ind-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setInd(i, "score", v)} center /></td>
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
                          <td style={TD}>{r.label}</td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setAcrRow(i, "score", v)} center /></td>

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
                  📊 Total Part B Score: {partBTotal.toFixed(1)}/375
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
                          <td style={TD}><TI val={r.title} onChange={(v) => setJour(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.journal} onChange={(v) => setJour(i, "journal", v)} /></td>
                          <td style={TD}><TI val={r.issn} onChange={(v) => setJour(i, "issn", v)} /></td>
                          <td style={TD}><TI val={r.index} onChange={(v) => setJour(i, "index", v)} /></td>
                          <td style={TD}><DocCell id={`jour-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`jour-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setJour(i, "score", v)} center /></td>
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
                        <th style={TH}>Title</th>
                        <th style={TH}>Book</th>
                        <th style={TH}>ISBN</th>
                        <th style={TH}>Publisher</th>
                        <th style={TH}>Co-authors</th>
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
                          <td style={TD}><TI val={r.title} onChange={(v) => setBook(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.book} onChange={(v) => setBook(i, "book", v)} /></td>
                          <td style={TD}><TI val={r.isbn} onChange={(v) => setBook(i, "isbn", v)} /></td>
                          <td style={TD}><TI val={r.pub} onChange={(v) => setBook(i, "pub", v)} /></td>
                          <td style={TD}><TI val={r.coauth} onChange={(v) => setBook(i, "coauth", v)} /></td>
                          <td style={TD}><TI val={r.first} onChange={(v) => setBook(i, "first", v)} /></td>
                          <td style={TD}><DocCell id={`book-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`book-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setBook(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={9}>Total Score (Max 50)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{bookScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setBooks((p) => [...p, { title: "", book: "", isbn: "", pub: "", coauth: "", first: "", score: "" }])} onDel={() => setBooks((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={books.length > 1} />
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
                          <td style={TD}><TI val={r.title} onChange={(v) => setIctRow(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.desc} onChange={(v) => setIctRow(i, "desc", v)} /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setIctRow(i, "type", v)} /></td>
                          <td style={TD}><TI val={r.quad} onChange={(v) => setIctRow(i, "quad", v)} /></td>
                          <td style={TD}><DocCell id={`ict-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`ict-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setIctRow(i, "score", v)} center /></td>
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

                {/* B4. Research Guidance + Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B4. Research Guidance + Projects — Max 75 marks</div>
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
                          <td style={TD}><TI val={r.degree} onChange={(v) => setRes(i, "degree", v)} /></td>
                          <td style={TD}><TI val={r.name} onChange={(v) => setRes(i, "name", v)} /></td>
                          <td style={TD}><TI val={r.thesis} onChange={(v) => setRes(i, "thesis", v)} /></td>
                          <td style={TD}><DocCell id={`res-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`res-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setRes(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Score (Max 75)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{researchScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setResearch((p) => [...p, { degree: "PhD", name: "", thesis: "", score: "" }])} onDel={() => setResearch((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={research.length > 1} />
                </div>

                {/* B5. Patents & Awards */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B5. Patents & Awards — Max 50 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Type</th>
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
                          <td style={TD}><TI val={r.title} onChange={(v) => setPat(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setPat(i, "type", v)} /></td>
                          <td style={TD}><TI val={r.date} onChange={(v) => setPat(i, "date", v)} /></td>
                          <td style={TD}><TI val={r.status} onChange={(v) => setPat(i, "status", v)} /></td>
                          <td style={TD}><TI val={r.fileNo} onChange={(v) => setPat(i, "fileNo", v)} /></td>
                          <td style={TD}><DocCell id={`pat-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`pat-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setPat(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={8}>Total Patents Score (Max 30)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{patentScore.toFixed(1)}</td>
                      </tr>
                      {awards.map((r, i) => (
                        <tr key={`award-${i}`} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{patents.length + i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setAwd(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setAwd(i, "type", v)} /></td>
                          <td style={TD}><TI val={r.date} onChange={(v) => setAwd(i, "date", v)} /></td>
                          <td style={TD}><TI val={r.agency} onChange={(v) => setAwd(i, "agency", v)} /></td>
                          <td style={TD}><TI val={r.level} onChange={(v) => setAwd(i, "level", v)} /></td>
                          <td style={TD}><DocCell id={`awd-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`awd-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setAwd(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={8}>Total Awards Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{awardScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setPatents((p) => [...p, { title: "", type: "", date: "", status: "", fileNo: "", score: "" }])}>+ Add Patent</button>
                    <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setPatents((p) => p.length > 1 ? p.slice(0, -1) : p)} disabled={patents.length <= 1}>− Delete Patent</button>
                    <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setAwards((p) => [...p, { title: "", type: "", date: "", agency: "", level: "", score: "" }])}>+ Add Award</button>
                    <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setAwards((p) => p.length > 1 ? p.slice(0, -1) : p)} disabled={awards.length <= 1}>− Delete Award</button>
                  </div>
                </div>

                {/* B6. Conferences / FDP */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B6. Conferences / FDP — Max 30 marks</div>
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
                          <td style={TD}><TI val={r.title} onChange={(v) => setConf(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.type} onChange={(v) => setConf(i, "type", v)} /></td>
                          <td style={TD}><TI val={r.org} onChange={(v) => setConf(i, "org", v)} /></td>
                          <td style={TD}><TI val={r.level} onChange={(v) => setConf(i, "level", v)} /></td>
                          <td style={TD}><DocCell id={`conf-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`conf-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setConf(i, "score", v)} center /></td>
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

                {/* B7. Research Proposals */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B7. Research Proposals — Max 20 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Duration</th>
                        <th style={TH}>Agency</th>
                        <th style={TH}>Amount</th>
                        <th style={TH}>Attachment</th>
                        <th style={TH}>View Docs</th>
                        <th style={TH}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposals.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.title} onChange={(v) => setProp(i, "title", v)} /></td>
                          <td style={TD}><TI val={r.duration} onChange={(v) => setProp(i, "duration", v)} /></td>
                          <td style={TD}><TI val={r.agency} onChange={(v) => setProp(i, "agency", v)} /></td>
                          <td style={TD}><TI val={r.amount} onChange={(v) => setProp(i, "amount", v)} /></td>
                          <td style={TD}><DocCell id={`prop-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`prop-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setProp(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Total Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{proposalScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setProposals((p) => [...p, { title: "", duration: "", agency: "", amount: "", score: "" }])} onDel={() => setProposals((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={proposals.length > 1} />
                </div>

                {/* B8. Self Development */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B8. Self Development — Max 10 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setFdp(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total FDP Score (Max 5)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{fdpScore.toFixed(1)}</td>
                      </tr>
                      {training.map((r, i) => (
                        <tr key={`train-${i}`} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{fdps.length + i + 1}</td>
                          <td style={TD}><TI val={r.company} onChange={(v) => setTrain(i, "company", v)} /></td>
                          <td style={TD}><TI val={r.duration} onChange={(v) => setTrain(i, "duration", v)} /></td>
                          <td style={TD}><TI val={r.nature} onChange={(v) => setTrain(i, "nature", v)} /></td>
                          <td style={TD}><DocCell id={`train-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`train-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setTrain(i, "score", v)} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f3e8ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={6}>Total Training Score (Max 5)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{trainScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setFdps((p) => [...p, { program: "", duration: "", org: "", score: "" }])}>+ Add FDP</button>
                    <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setFdps((p) => p.length > 1 ? p.slice(0, -1) : p)} disabled={fdps.length <= 1}>− Delete FDP</button>
                    <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setTraining((p) => [...p, { company: "", duration: "", nature: "", score: "" }])}>+ Add Training</button>
                    <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={() => setTraining((p) => p.length > 1 ? p.slice(0, -1) : p)} disabled={training.length <= 1}>− Delete Training</button>
                  </div>
                </div>
              </SC>
            )}

            {/* Summary Tab */}
            {hodAppraisalTab === "summary" && (
              <SC title="Appraisal Summary & Submission" accent="#10b981">
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
                  <tbody>
                    {[
                      ["Part A — Teaching & Activities", partATotal, 200, "#6366f1"],
                      ["Part B — Research & Contributions", partBTotal, 375, "#7c3aed"],
                      ["Grand Total", grandTotal, 575, g.color],
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

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14, color: "#334155", fontSize: 12, lineHeight: 1.5, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={accuracyConfirmed}
                    onChange={(e) => setAccuracyConfirmed(e.target.checked)}
                    disabled={submitting}
                    style={{ marginTop: 3 }}
                  />
                  <span>I have verified all the details and confirm that the information provided is correct. I am responsible for the accuracy of this data.</span>
                </label>

                <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                  <button 
                    onClick={handleSubmitAppraisal}
                    disabled={submitting || !accuracyConfirmed}
                    style={{ padding: "10px 28px", background: accuracyConfirmed ? "#059669" : "#64748b", color: "#fff", border: "none", borderRadius: 7, cursor: accuracyConfirmed ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif", opacity: submitting ? 0.7 : 1 }}
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
        {(activeMainTab === "facultyApprovals" || activeMainTab === "hodApprovals") && !reviewingFaculty && !reviewingHod && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.5 }}>
                  {activeMainTab === "facultyApprovals" ? "Faculty Approvals" : "HOD Approvals"}
                </h1>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>{DIRECTOR_USER.department} · AY {DIRECTOR_USER.ay}</p>
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
                const g = grade(item.grandTotal || 350, 575);
                const partA = [
                  ...(item.lectures || []).map(r => n(r.score)),
                  n(item.courseFile?.score), n(item.innovScore),
                  ...(item.projects || []).map(r => n(r.score)),
                  ...(item.quals || []).map(r => n(r.score)),
                  ...(item.feedback || []).map(r => n(r.score)),
                  ...(item.deptActs || []).map(r => n(r.score)),
                  ...(item.uniActs || []).map(r => n(r.score)),
                  ...(item.society || []).map(r => n(r.score)),
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
                        { label: "Part A", val: partA, max: 200, color: "#6366f1" },
                        { label: "Part B", val: partB, max: 375, color: "#0ea5e9" },
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
                      <button onClick={() => activeMainTab === "facultyApprovals" ? setReviewingFaculty(item) : setReviewingHod(item)}
                        style={{ fontSize: 11, padding: "7px 18px", background: /Reviewed|Rejected/.test(item.status) ? "#1e293b" : "#312e81", color: "#f1f5f9", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontFamily: "Georgia, serif" }}>
                        {/Reviewed|Rejected/.test(item.status) ? "View Review" : "Review Form"}
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
            readOnly={/Reviewed|Rejected/.test(reviewingFaculty.status || "")}
          />
        )}
        {activeMainTab === "hodApprovals" && reviewingHod && (
          <ReviewPanel
            faculty={reviewingHod}
            onBack={() => setReviewingHod(null)}
            onSubmit={(id, total, remarks, sectionScores, reviewConfirmed) => handleSubmitReview("hod", id, total, remarks, sectionScores, reviewConfirmed)}
            readOnly={/Reviewed|Rejected/.test(reviewingHod.status || "")}
          />
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
    localStorage.removeItem("user");
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

