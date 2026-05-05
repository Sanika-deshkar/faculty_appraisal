import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { APP_INFO } from "../constants/formConfig";
import { supabase } from "../services/supabase";
import { uploadToCloudinary } from "../services/cloudinary";
import {
  getReviewChain,
  isRejectedStatus,
  pendingStatusFor,
  profileFromLocalStorage,
  roleLabel,
  workflowValidationError,
} from "../utils/hierarchy";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0;
const hasAnyValue = (row, keys) => keys.some((key) => String(row[key] ?? "").trim() !== "");
const requireSupabase = (error, action) => {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
};
const docSectionFromKey = (docKey) => docKey.replace(/-\d+$/, "").replace(/\d+$/, "");
const docRowFromKey = (docKey) => {
  const match = docKey.match(/(\d+)$/);
  return match ? Number(match[1]) + 1 : null;
};
const docsToRows = (docs, facultyEmail, academicYear) =>
  Object.entries(docs).flatMap(([docKey, files]) =>
    (files || []).map((file) => ({
      faculty_email: facultyEmail,
      academic_year: academicYear,
      section: docSectionFromKey(docKey),
      row_no: docRowFromKey(docKey),
      doc_key: docKey,
      file_name: file.name,
      file_type: file.type,
      file_url: file.url,
      storage_path: file.publicId || null,
    }))
  );
const dbText = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};
const dbDate = (value) => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};
const dbNumber = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : n(text);
};
const inputValue = (value) => value ?? "";
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
function Avatar({ initials, color = "#6366f1", size = 40 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg,${color},${color}99)`, color: "#fff", fontWeight: 800, fontSize: size * 0.32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, letterSpacing: 0.5 }}>
      {initials}
    </div>
  );
}

function ScoreBar({ score, max, color = "#6366f1" }) {
  return (
    <div style={{ width: "100%", background: "#f1f5f9", borderRadius: 4, height: 5, overflow: "hidden" }}>
      <div style={{ width: `${pct(score, max)}%`, height: "100%", background: color, borderRadius: 4, transition: "width .5s" }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    "Pending Review": { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    Reviewed: { bg: "#d1fae5", color: "#065f46", dot: "#10b981" },
    Rejected: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
  };
  const s = map[status] || map["Pending Review"];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

function WorkflowStatusTracker({ declaration, reviews, profile }) {
  const chain = getReviewChain(profile);
  const status = declaration?.status || "";
  const reviewByRole = new Map((reviews || []).map((review) => [review.reviewer_role, review]));
  const rejected = isRejectedStatus(status) || (reviews || []).some((review) => isRejectedStatus(review.status));
  const nextRole = rejected
    ? null
    : chain.find((role) => !reviewByRole.has(role));

  const stepState = (role) => {
    const review = reviewByRole.get(role);
    if (review) {
      return isRejectedStatus(review.status) ? "Rejected" : "Approved";
    }
    if (status === pendingStatusFor(role)) return "Pending";
    return rejected ? "Stopped" : "Waiting";
  };

  const stateStyle = {
    Submitted: { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" },
    Pending: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
    Approved: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
    Rejected: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
    Waiting: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
    Stopped: { bg: "#f1f5f9", color: "#94a3b8", border: "#e2e8f0" },
  };

  if (!declaration) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "12px 14px", fontSize: 12, color: "#475569" }}>
        Submit the appraisal to see the approval route and live authority status here.
      </div>
    );
  }

  const submittedStep = {
    label: "Faculty Submission",
    state: "Submitted",
    timestamp: declaration.submitted_at,
    comment: status,
  };

  const authoritySteps = chain.map((role) => {
    const review = reviewByRole.get(role);
    return {
      label: roleLabel(role),
      state: stepState(role),
      timestamp: review?.reviewed_at,
      comment: review?.remarks,
    };
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #dbeafe", borderRadius: 9, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Approval Status Tracker</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {rejected ? "The approval chain has stopped because this submission was rejected." : nextRole ? `Next: ${roleLabel(nextRole)}` : "All approval stages are complete."}
          </div>
        </div>
        <StatusBadge status={rejected ? "Rejected" : nextRole ? "Pending Review" : "Reviewed"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${authoritySteps.length + 1}, minmax(130px, 1fr))`, gap: 8, overflowX: "auto" }}>
        {[submittedStep, ...authoritySteps].map((step) => {
          const colors = stateStyle[step.state] || stateStyle.Waiting;
          return (
            <div key={step.label} style={{ border: `1px solid ${colors.border}`, background: colors.bg, borderRadius: 8, padding: "10px 11px", minHeight: 88 }}>
              <div style={{ fontSize: 10, color: colors.color, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.6 }}>{step.state}</div>
              <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{step.label}</div>
              <div style={{ marginTop: 5, fontSize: 10, color: "#64748b" }}>
                {step.timestamp ? new Date(step.timestamp).toLocaleString() : "No timestamp yet"}
              </div>
              {step.comment && (
                <div style={{ marginTop: 6, fontSize: 10, lineHeight: 1.4, color: "#334155", maxHeight: 42, overflow: "auto" }}>{step.comment}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Read-only cell: shows faculty text as plain text ─────────────────────────
function RO({ val, center }) {
  return <span style={{ fontSize: 11, fontFamily: "Georgia, serif", color: "#1e293b", display: "block", textAlign: center ? "center" : "left" }}>{val || <span style={{ color: "#cbd5e1" }}>—</span>}</span>;
}

// ─── HOD-editable score input ─────────────────────────────────────────────────
function HodInput({ val, onChange }) {
  return (
    <input
      type="number" min="0" step="0.5" value={val ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{ width: 58, height: 30, boxSizing: "border-box", textAlign: "center", border: "1.5px solid #6366f1", borderRadius: 5, padding: "5px 6px", fontSize: 11, fontFamily: "Georgia, serif", outline: "none", background: "#f0f4ff" }}
    />
  );
}

// ─── Text Input ───────────────────────────────────────────────────────────────
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

// ─── DocCell: file upload component ───────────────────────────────────────────
function DocCell({ id, docs, setDocs }) {
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFiles = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    setUploading(true);
    setUploadError("");

    try {
      const uploadedFiles = [];

      for (const file of selectedFiles) {
        const uploaded = await uploadToCloudinary(file, {
          folder: `faculty-appraisal/${id}`,
        });
        uploadedFiles.push(uploaded);
      }

      setDocs((p) => ({ ...p, [id]: [...(p[id] || []), ...uploadedFiles] }));
    } catch (err) {
      console.error("Cloudinary upload error:", err);
      setUploadError(err.message);
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
          <span style={{ color: "#0ea5e9", fontSize: 10 }}>✔</span>
          <span style={{ fontSize: 10, color: "#1e293b", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={f.name}>{f.name}</span>
          <button onClick={() => removeFile(idx)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 10, cursor: "pointer" }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: uploading ? "wait" : "pointer", padding: "4px 6px", border: "1px dashed #cbd5e1", borderRadius: 4, background: "#f8fafc", opacity: uploading ? 0.7 : 1 }} onClick={() => !uploading && ref.current.click()}>
        <span style={{ fontSize: 10, color: "#64748b" }}>{uploading ? "Uploading..." : "📎 Attach"}</span>
        <input
          ref={ref} type="file" multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx"
          style={{ display: "none" }}
          disabled={uploading}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {uploadError && <span style={{ color: "#dc2626", fontSize: 9 }}>{uploadError}</span>}
    </div>
  );
}

// ─── ViewCell: shows links to uploaded docs ───────────────────────────────────
function ViewCell({ id, docs }) {
  const files = docs[id] || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((f, idx) => (
        <a key={idx} href={f.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#3b82f6", fontSize: 10, textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }} title={f.name}>
          {f.type?.startsWith("image/") && (
            <img src={f.url} alt="" style={{ width: 22, height: 22, objectFit: "cover", borderRadius: 3 }} />
          )}
          👁 {f.name.length > 14 ? f.name.slice(0, 14) + "…" : f.name}
        </a>
      ))}
    </div>
  );
}

// ─── Row Buttons ──────────────────────────────────────────────────────────────
function RowBtns({ onAdd, onDel, canDel = true }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={onAdd}>+ Add Row</button>
      {canDel && <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={onDel}>− Delete Last</button>}
    </div>
  );
}

// ─── View Docs cell (read-only, opens uploaded files) ─────────────────────────
function ViewDocsCell({ docKey, docs }) {
  const files = docs[docKey] || [];
  if (!files.length) return <span style={{ color: "#cbd5e1", fontSize: 10 }}>No docs</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {files.map((f, i) => (
        <a key={i} href={f.url} target="_blank" rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#3b82f6", fontSize: 10, textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}
          title={f.name}
        >
          {f.type === "application/pdf" ? "📄" : "🖼"} {f.name.length > 16 ? f.name.slice(0, 16) + "…" : f.name}
        </a>
      ))}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SC({ title, subtitle, accent = "#6366f1", children }) {
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

// ─── Shared table styles ──────────────────────────────────────────────────────
const T = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const TH = { border: "1px solid #cbd5e1", padding: "7px 8px", background: "#0f172a", color: "#cbd5e1", fontWeight: 700, textAlign: "center", fontSize: 10 };
const TH_HOD = { ...TH, background: "#312e81", color: "#c7d2fe" };
const TD = { border: "1px solid #e2e8f0", padding: "4px 6px", verticalAlign: "middle" };
const TDC = { ...TD, textAlign: "center" };
const TDS = { ...TD, textAlign: "center", background: "#f8fafc", minWidth: 52 };
const TDS_HOD = { ...TDS, background: "#f0f4ff" };
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

  const { info, lectures, courseFile, projects, quals, feedback, deptActs, uniActs, society, industry, acr, journals, books, ict, research, patents, awards, confs, proposals, fdps, training, docs } = faculty;

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
              <th style={TH}>Planned</th><th style={TH}>Conducted</th>
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
            <th style={TH}>SN</th><th style={TH}>Course</th><th style={TH}>Feedback 1</th>
            <th style={TH}>Feedback 2</th><th style={TH}>Average</th>
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
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Book & Publisher</th>
              <th style={TH}>ISBN</th><th style={TH}>First Author?</th>
              <th style={TH}>View Docs</th><th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
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
      <SC title="B4. Research Guidance — PhD / PG (Max 30)" accent="#059669">
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

      {/* B5: Patents */}
      <SC title="B5a. Patents / IPR (Max 40)" accent="#f97316">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Type</th>
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
      <SC title="B5b. Awards / Fellowships (Max 10)" accent="#f97316">
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
      <SC title="B6. Conferences / Papers Presented (Max 30)" accent="#6366f1">
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

      {/* B7: Proposals */}
      <SC title="B7. Research Proposals / Products (Max 20)" accent="#0ea5e9">
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Duration</th>
            <th style={TH}>Funding Agency</th><th style={TH}>Amount</th>
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

      {/* B8: Self Dev */}
      <SC title="B8. Self Development — FDP / Training (Max 10)" accent="#10b981">
        <div style={{ fontWeight: 600, fontSize: 11, color: "#475569", marginBottom: 6 }}>FDP / Workshops</div>
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
        <div style={{ fontWeight: 600, fontSize: 11, color: "#475569", margin: "12px 0 6px" }}>Industrial Training</div>
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
    const pat = (faculty.patents || []).reduce((a, _, i) => a + get("patents", i, "hod"), 0);
    const awd = (faculty.awards || []).reduce((a, _, i) => a + get("awards", i, "hod"), 0);
    const conf = (faculty.confs || []).reduce((a, _, i) => a + get("confs", i, "hod"), 0);
    const prop = (faculty.proposals || []).reduce((a, _, i) => a + get("proposals", i, "hod"), 0);
    const fdp = (faculty.fdps || []).reduce((a, _, i) => a + get("fdps", i, "hod"), 0);
    const train = (faculty.training || []).reduce((a, _, i) => a + get("training", i, "hod"), 0);
    const partB = jour + bk + ictT + res + pat + awd + conf + prop + fdp + train;

    return { partA, partB, total: partA + partB };
  };

  const { partA, partB, total } = calcHodScore();
  const g = grade(total, 575);

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
            <div style={{ color: g.color, fontWeight: 800, fontSize: 16 }}>{total.toFixed(1)}<span style={{ fontSize: 10, color: "#94a3b8" }}>/575</span></div>
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
                ["Part B — Research & Contributions", 375, faculty.journals?.reduce((a, r) => a + n(r.score), 0) || 0, partB],
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
                <td style={TDC}>575</td>
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

// ─── Main HOD Dashboard ───────────────────────────────────────────────────────
export default function HODDashboard() {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState("myAppraisal");
  const [hodAppraisalTab, setHodAppraisalTab] = useState("partA");
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // ── HOD's own appraisal form state ──
  const [info, setInfo] = useState({ 
    name: localStorage.getItem("name") || "", 
    qual: "", 
    desig: localStorage.getItem("role") === "faculty" ? "Assistant Professor" : "", 
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
  const [acr, setAcr] = useState(acrLabels.map((l) => ({ label: l, score: "", hod: "", director: "" })));
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
  const [appraisalLocked, setAppraisalLocked] = useState(false);
  const [workflowDeclaration, setWorkflowDeclaration] = useState(null);
  const [workflowReviews, setWorkflowReviews] = useState([]);

  useEffect(() => {
    const userEmail = localStorage.getItem("username");
    if (!userEmail || !info.ay) return undefined;

    const loadWorkflowStatus = async () => {
      try {
        const [{ data: declaration, error: declarationError }, { data: reviews, error: reviewsError }] = await Promise.all([
          supabase
            .from("declarations")
            .select("status,submitted_at,updated_at")
            .eq("faculty_email", userEmail)
            .eq("academic_year", info.ay)
            .maybeSingle(),
          supabase
            .from("appraisal_reviews")
            .select("reviewer_role,status,remarks,reviewed_at")
            .eq("faculty_email", userEmail)
            .eq("academic_year", info.ay)
            .order("reviewed_at", { ascending: true }),
        ]);

        requireSupabase(declarationError, "Could not load workflow status");
        requireSupabase(reviewsError, "Could not load review history");
        setWorkflowDeclaration(declaration || null);
        setWorkflowReviews(reviews || []);
        setAppraisalLocked(Boolean(declaration));
      } catch (err) {
        console.error("Could not load workflow status:", err);
      }
    };

    loadWorkflowStatus();

    const channel = supabase
      .channel(`workflow-status-${userEmail}-${info.ay}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "declarations", filter: `faculty_email=eq.${userEmail}` }, loadWorkflowStatus)
      .on("postgres_changes", { event: "*", schema: "public", table: "appraisal_reviews", filter: `faculty_email=eq.${userEmail}` }, loadWorkflowStatus)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [info.ay]);

  useEffect(() => {
    const loadDocuments = async () => {
      const userEmail = localStorage.getItem("username");
      if (!userEmail || !info.ay) return;

      const { data, error } = await supabase
        .from("appraisal_documents")
        .select("*")
        .eq("faculty_email", userEmail)
        .eq("academic_year", info.ay)
        .order("uploaded_at", { ascending: true });

      if (error) {
        console.error("Could not load Cloudinary documents:", error.message);
        return;
      }

      const groupedDocs = (data || []).reduce((acc, row) => {
        const key = row.doc_key || row.section;
        if (!key) return acc;

        acc[key] = [
          ...(acc[key] || []),
          {
            name: row.file_name,
            type: row.file_type,
            url: row.file_url,
            publicId: row.storage_path,
          },
        ];

        return acc;
      }, {});

      setDocs(groupedDocs);
    };

    loadDocuments();
  }, [info.ay]);

  useEffect(() => {
    const loadExistingAppraisal = async () => {
      const userEmail = localStorage.getItem("username");
      if (!userEmail || !info.ay) return;

      const fetchRows = async (table, shouldOrder = true) => {
        let query = supabase
          .from(table)
          .select("*")
          .eq("faculty_email", userEmail)
          .eq("academic_year", info.ay);

        if (shouldOrder) {
          query = query.order("row_no", { ascending: true });
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`${table}: ${error.message}`);
        }

        return data || [];
      };

      const fetchDeclaration = async () => {
        const { data, error } = await supabase
          .from("declarations")
          .select("status")
          .eq("faculty_email", userEmail)
          .eq("academic_year", info.ay)
          .maybeSingle();

        if (error) {
          throw new Error(`declarations: ${error.message}`);
        }

        return data;
      };

      try {
        const [
          declarationRow,
          teachingRows,
          courseRows,
          innovativeRows,
          projectRows,
          qualificationRows,
          feedbackRows,
          departmentRows,
          universityRows,
          societyRows,
          industryRows,
          acrRows,
          journalRows,
          bookRows,
          ictRows,
          researchRows,
          researchProjectRows,
          patentRows,
          awardRows,
          conferenceRows,
          proposalRows,
          selfDevelopmentRows,
          trainingRows,
        ] = await Promise.all([
          fetchDeclaration(),
          fetchRows("teaching_process"),
          fetchRows("course_files"),
          fetchRows("innovative_teaching", false),
          fetchRows("projects_guided"),
          fetchRows("qualification_enhancement"),
          fetchRows("student_feedback"),
          fetchRows("department_activities"),
          fetchRows("university_activities"),
          fetchRows("social_contributions"),
          fetchRows("industry_connect"),
          fetchRows("acr_scores"),
          fetchRows("journal_publications"),
          fetchRows("book_publications"),
          fetchRows("ict_pedagogy"),
          fetchRows("research_guidance"),
          fetchRows("research_projects"),
          fetchRows("patents"),
          fetchRows("awards"),
          fetchRows("conferences"),
          fetchRows("research_proposals"),
          fetchRows("self_development"),
          fetchRows("industrial_training"),
        ]);

        setAppraisalLocked(Boolean(declarationRow));

        if (teachingRows.length) {
          setLectures(teachingRows.map((row) => ({
            sem: inputValue(row.semester),
            code: inputValue(row.course_code),
            planned: inputValue(row.planned_classes),
            conducted: inputValue(row.conducted_classes),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (courseRows.length) {
          setCourseFile(courseRows.map((row) => ({
            course: inputValue(row.course),
            title: inputValue(row.title),
            details: inputValue(row.details),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (innovativeRows.length) {
          setInnovDetails(inputValue(innovativeRows[0].details));
          setInnovScore(inputValue(innovativeRows[0].score));
        }

        if (projectRows.length) {
          setProjects(projectRows.map((row) => ({
            label: inputValue(row.label),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (qualificationRows.length) {
          setQuals(qualificationRows.map((row) => ({
            label: inputValue(row.label),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (feedbackRows.length) {
          setFeedback(feedbackRows.map((row) => ({
            code: inputValue(row.course_code),
            fb1: inputValue(row.feedback_1),
            fb2: inputValue(row.feedback_2),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (departmentRows.length) {
          setDeptActs(departmentRows.map((row) => ({
            activity: inputValue(row.activity),
            nature: inputValue(row.nature),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (universityRows.length) {
          setUniActs(universityRows.map((row) => ({
            activity: inputValue(row.activity),
            nature: inputValue(row.nature),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (societyRows.length) {
          setSociety(societyRows.map((row) => ({
            label: inputValue(row.label),
            details: inputValue(row.details),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (industryRows.length) {
          setIndustry(industryRows.map((row) => ({
            name: inputValue(row.name),
            details: inputValue(row.details),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (acrRows.length) {
          setAcr(acrRows.map((row) => ({
            label: inputValue(row.label),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (journalRows.length) {
          setJournals(journalRows.map((row) => ({
            title: inputValue(row.title),
            journal: inputValue(row.journal),
            issn: inputValue(row.issn),
            index: inputValue(row.indexing),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (bookRows.length) {
          setBooks(bookRows.map((row) => ({
            title: inputValue(row.title),
            book: inputValue(row.book),
            issn: inputValue(row.issn),
            pub: inputValue(row.publisher),
            coauth: inputValue(row.coauthor),
            first: inputValue(row.first_author),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (ictRows.length) {
          setIct(ictRows.map((row) => ({
            title: inputValue(row.title),
            desc: inputValue(row.description),
            type: inputValue(row.type),
            quad: inputValue(row.quadrant),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (researchRows.length) {
          setResearch(researchRows.map((row) => ({
            degree: inputValue(row.degree),
            name: inputValue(row.student_name),
            thesis: inputValue(row.thesis),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (researchProjectRows.length) {
          setProjects2(researchProjectRows.map((row) => ({
            title: inputValue(row.title),
            agency: inputValue(row.agency),
            date: inputValue(row.sanction_date),
            amount: inputValue(row.amount),
            role: inputValue(row.role),
            status: inputValue(row.project_status),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
          })));
        }

        if (patentRows.length) {
          setPatents(patentRows.map((row) => ({
            title: inputValue(row.title),
            type: inputValue(row.type),
            date: inputValue(row.patent_date),
            status: inputValue(row.patent_status),
            fileNo: inputValue(row.file_no),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (awardRows.length) {
          setAwards(awardRows.map((row) => ({
            title: inputValue(row.title),
            date: inputValue(row.award_date),
            agency: inputValue(row.agency),
            level: inputValue(row.level),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (conferenceRows.length) {
          setConfs(conferenceRows.map((row) => ({
            title: inputValue(row.title),
            type: inputValue(row.type),
            org: inputValue(row.organization),
            level: inputValue(row.level),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (proposalRows.length) {
          setProposals(proposalRows.map((row) => ({
            title: inputValue(row.title),
            duration: inputValue(row.duration),
            agency: inputValue(row.agency),
            amount: inputValue(row.amount),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (selfDevelopmentRows.length) {
          setFdps(selfDevelopmentRows.map((row) => ({
            program: inputValue(row.program),
            duration: inputValue(row.duration),
            org: inputValue(row.organization),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }

        if (trainingRows.length) {
          setTraining(trainingRows.map((row) => ({
            company: inputValue(row.company),
            duration: inputValue(row.duration),
            nature: inputValue(row.nature),
            score: inputValue(row.score),
            hod: inputValue(row.hod_score),
            director: inputValue(row.director_score),
          })));
        }
      } catch (err) {
        console.error("Could not load saved appraisal:", err);
      }
    };

    loadExistingAppraisal();
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

  const [submitting, setSubmitting] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);

  const handleSubmitAppraisal = async () => {
    if (appraisalLocked) {
      alert("This appraisal has already been submitted and is locked for review.");
      return;
    }
    if (!accuracyConfirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting.");
      return;
    }

    // 1. Basic Validation
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

    const workflowError = workflowValidationError(profileFromLocalStorage());
    if (workflowError) {
      alert(workflowError);
      return;
    }

    const confirmSubmit = window.confirm("Are you sure you want to submit your appraisal? This will save your data to the database.");
    if (!confirmSubmit) return;

    setSubmitting(true);
    try {
      const reviewChain = getReviewChain(profileFromLocalStorage());
      const nextReviewer = reviewChain[0];
      const workflowStatus = nextReviewer ? pendingStatusFor(nextReviewer) : "Submitted";

      // 2. Prepare payload for declaration/main submission
      const declarationData = {
        faculty_email: userEmail,
        academic_year: info.ay,
        part_a_total: partATotal,
        part_b_total: partBTotal,
        grand_total: grandTotal,
        status: workflowStatus,
        submitted_at: new Date().toISOString()
      };

      // Save Declaration
      const { error: declError } = await supabase
        .from('declarations')
        .upsert(declarationData, { onConflict: 'faculty_email,academic_year' });
      requireSupabase(declError, "Could not save declaration");

      const baseRow = (index) => ({
        faculty_email: userEmail,
        academic_year: info.ay,
        row_no: index + 1,
      });

      const replaceRows = async (table, rows, label) => {
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .match({ faculty_email: userEmail, academic_year: info.ay });
        requireSupabase(deleteError, `Could not clear old ${label} rows`);

        if (rows.length > 0) {
          const { error: insertError } = await supabase.from(table).insert(rows);
          requireSupabase(insertError, `Could not save ${label} rows`);
        }
      };

      await replaceRows(
        'teaching_process',
        lectures
          .filter((row) => hasAnyValue(row, ["sem", "code", "planned", "conducted", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            semester: dbText(row.sem),
            course_code: dbText(row.code),
            planned_classes: n(row.planned),
            conducted_classes: n(row.conducted),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'teaching process'
      );

      await replaceRows(
        'course_files',
        courseFile
          .filter((row) => hasAnyValue(row, ["course", "title", "details", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            course: dbText(row.course),
            title: dbText(row.title),
            details: dbText(row.details),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'course file'
      );

      const { error: innovativeDeleteError } = await supabase
        .from('innovative_teaching')
        .delete()
        .match({ faculty_email: userEmail, academic_year: info.ay });
      requireSupabase(innovativeDeleteError, "Could not clear old innovative teaching row");

      if (hasAnyValue({ details: innovDetails, score: innovScore }, ["details", "score"])) {
        const { error: innovativeInsertError } = await supabase
          .from('innovative_teaching')
          .insert([{
            faculty_email: userEmail,
            academic_year: info.ay,
            details: dbText(innovDetails),
            score: n(innovScore),
          }]);
        requireSupabase(innovativeInsertError, "Could not save innovative teaching row");
      }

      await replaceRows(
        'projects_guided',
        projects
          .filter((row) => hasAnyValue(row, ["label", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            label: dbText(row.label),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'projects'
      );

      await replaceRows(
        'qualification_enhancement',
        quals
          .filter((row) => hasAnyValue(row, ["label", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            label: dbText(row.label),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'qualification enhancement'
      );

      await replaceRows(
        'student_feedback',
        feedback
          .filter((row) => hasAnyValue(row, ["code", "fb1", "fb2", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            course_code: dbText(row.code),
            feedback_1: n(row.fb1),
            feedback_2: n(row.fb2),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'student feedback'
      );

      await replaceRows(
        'department_activities',
        deptActs
          .filter((row) => hasAnyValue(row, ["activity", "nature", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            activity: dbText(row.activity),
            nature: dbText(row.nature),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'department activities'
      );

      await replaceRows(
        'university_activities',
        uniActs
          .filter((row) => hasAnyValue(row, ["activity", "nature", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            activity: dbText(row.activity),
            nature: dbText(row.nature),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'university activities'
      );

      await replaceRows(
        'social_contributions',
        society
          .filter((row) => hasAnyValue(row, ["label", "details", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            label: dbText(row.label),
            details: dbText(row.details),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'social contribution'
      );

      await replaceRows(
        'industry_connect',
        industry
          .filter((row) => hasAnyValue(row, ["name", "details", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            name: dbText(row.name),
            details: dbText(row.details),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'industry connect'
      );

      await replaceRows(
        'acr_scores',
        acr
          .filter((row) => hasAnyValue(row, ["label", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            label: dbText(row.label),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'ACR'
      );

      await replaceRows(
        'journal_publications',
        journals
          .filter((row) => hasAnyValue(row, ["title", "journal", "issn", "index", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            journal: dbText(row.journal),
            issn: dbText(row.issn),
            indexing: dbText(row.index),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'journal publications'
      );

      await replaceRows(
        'book_publications',
        books
          .filter((row) => hasAnyValue(row, ["title", "book", "issn", "pub", "coauth", "first", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            book: dbText(row.book),
            issn: dbText(row.issn),
            publisher: dbText(row.pub),
            coauthor: dbText(row.coauth),
            first_author: dbText(row.first),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'book publications'
      );

      await replaceRows(
        'ict_pedagogy',
        ict
          .filter((row) => hasAnyValue(row, ["title", "desc", "type", "quad", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            description: dbText(row.desc),
            type: dbText(row.type),
            quadrant: dbText(row.quad),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'ICT pedagogy'
      );

      await replaceRows(
        'research_guidance',
        research
          .filter((row) => hasAnyValue(row, ["degree", "name", "thesis", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            degree: dbText(row.degree),
            student_name: dbText(row.name),
            thesis: dbText(row.thesis),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'research guidance'
      );

      await replaceRows(
        'research_projects',
        projects2
          .filter((row) => hasAnyValue(row, ["title", "agency", "date", "amount", "role", "status", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            agency: dbText(row.agency),
            sanction_date: dbDate(row.date),
            amount: dbNumber(row.amount),
            role: dbText(row.role),
            project_status: dbText(row.status),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
          })),
        'research projects'
      );

      await replaceRows(
        'patents',
        patents
          .filter((row) => hasAnyValue(row, ["title", "type", "date", "status", "fileNo", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            type: dbText(row.type),
            patent_date: dbDate(row.date),
            patent_status: dbText(row.status),
            file_no: dbText(row.fileNo),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'patents'
      );

      await replaceRows(
        'awards',
        awards
          .filter((row) => hasAnyValue(row, ["title", "date", "agency", "level", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            award_date: dbDate(row.date),
            agency: dbText(row.agency),
            level: dbText(row.level),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'awards'
      );

      await replaceRows(
        'conferences',
        confs
          .filter((row) => hasAnyValue(row, ["title", "type", "org", "level", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            type: dbText(row.type),
            organization: dbText(row.org),
            level: dbText(row.level),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'conferences'
      );

      await replaceRows(
        'research_proposals',
        proposals
          .filter((row) => hasAnyValue(row, ["title", "duration", "agency", "amount", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            title: dbText(row.title),
            duration: dbText(row.duration),
            agency: dbText(row.agency),
            amount: dbNumber(row.amount),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'research proposals'
      );

      await replaceRows(
        'self_development',
        fdps
          .filter((row) => hasAnyValue(row, ["program", "duration", "org", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            program: dbText(row.program),
            duration: dbText(row.duration),
            organization: dbText(row.org),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'self development'
      );

      await replaceRows(
        'industrial_training',
        training
          .filter((row) => hasAnyValue(row, ["company", "duration", "nature", "score"]))
          .map((row, index) => ({
            ...baseRow(index),
            company: dbText(row.company),
            duration: dbText(row.duration),
            nature: dbText(row.nature),
            score: n(row.score),
            hod_score: dbNumber(row.hod),
            director_score: dbNumber(row.director),
          })),
        'industrial training'
      );

      const documentRows = docsToRows(docs, userEmail, info.ay);
      const { error: documentDeleteError } = await supabase
        .from('appraisal_documents')
        .delete()
        .match({ faculty_email: userEmail, academic_year: info.ay });
      requireSupabase(documentDeleteError, "Could not clear old Cloudinary document rows");

      if (documentRows.length > 0) {
        const { error: documentInsertError } = await supabase
          .from('appraisal_documents')
          .insert(documentRows);
        requireSupabase(documentInsertError, "Could not save Cloudinary document rows");
      }

      alert("Appraisal submitted successfully!");
      setAppraisalLocked(true);
      setWorkflowDeclaration({
        status: workflowStatus,
        submitted_at: declarationData.submitted_at,
        updated_at: declarationData.submitted_at,
      });
      setWorkflowReviews([]);
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
  const navItems = [
    { id: "myAppraisal", icon: "👤", label: "My Appraisal", sub: "View your self-appraisal form" },
  ];
  const workflowRejected = isRejectedStatus(workflowDeclaration?.status) ||
    workflowReviews.some((review) => isRejectedStatus(review.status));

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
          <button key={tab.id} onClick={() => { setActiveMainTab(tab.id); }}
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
            <div style={{ color: "#475569", fontSize: 9 }}>{localStorage.getItem("role") || "Faculty"} {localStorage.getItem("department")?.split(" ")[0] || ""}</div>
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
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{info.name || "Faculty"}.{info.ay}</p>
            </div>
            <WorkflowStatusTracker
              declaration={workflowDeclaration}
              reviews={workflowReviews}
              profile={profileFromLocalStorage()}
            />
            {appraisalLocked && (
              <div style={{ background: workflowRejected ? "#fef2f2" : "#ecfdf5", border: `1px solid ${workflowRejected ? "#fecaca" : "#bbf7d0"}`, color: workflowRejected ? "#991b1b" : "#166534", borderRadius: 9, padding: "10px 14px", fontSize: 12, fontWeight: 700 }}>
                {workflowRejected
                  ? "This appraisal was rejected. Review the authority comments in the tracker above."
                  : "Submitted and locked for review. Your saved data is visible here, but editing is disabled while authorities review it."}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ flex: 1, pointerEvents: appraisalLocked && hodAppraisalTab !== "summary" ? "none" : "auto", opacity: appraisalLocked && hodAppraisalTab !== "summary" ? 0.78 : 1 }}>

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
                  <RowBtns onAdd={() => setLectures((p) => [...p, { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" }])} onDel={() => setLectures((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={lectures.length > 1} />
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
                  <RowBtns onAdd={() =>setCourseFile((p) => [ ...p, { course: "", title: "", details: "", score: "", hod: "", director: "" }])}onDel={() =>setCourseFile((p) => (p.length > 1 ? p.slice(0, -1) : p))}canDel={courseFile.length > 1}/>
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

