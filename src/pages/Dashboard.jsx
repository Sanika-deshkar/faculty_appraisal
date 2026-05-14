import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ACR_DETAIL_POINTS, APP_INFO, createAcrRows } from "../constants/formConfig";
import { saveAppraisalDraftSection, submitAppraisal, loadSavedAppraisal, loadAppraisalDocuments } from "../services/appraisalPersistence";
import { api } from "../services/api";
import { INNOVATIVE_METHODS, SCORE_LIMITS, averageSectionScore, clampScore, courseFileAverageScore, courseFileRowScore, effectiveMaxScore, feedbackAverage, feedbackRowScore, feedbackSectionScore, innovativeSelectionsFromDetails, innovativeTeachingScore, isAllowedAttachmentFile, isValidDDMMYYYY, maskDateDDMMYYYY, normalizeAutoScores, projectGuidanceRowMax, researchGuidanceRowMax, researchGuidanceScore, scoreRemaining, societyRowLocked, societyRowScore, sumSectionScore, toggleInnovativeMethod, validateCompleteRows } from "../utils/appraisalFormUtils";
import {
  getReviewChain,
  isRejectedStatus,
  pendingStatusFor,
  profileFromsessionStorage,
  roleLabel,
  workflowValidationError,
} from "../utils/hierarchy";
import { standardSubmittedScoreSummary } from "../utils/reviewSummaryTotals";
import AppraisalHeaderImage from "../components/AppraisalHeaderImage";

// --- Helpers ------------------------------------------------------------------
const n = (v) => parseFloat(v) || 0;
const hasAnyValue = (row, keys) => keys.some((key) => String(row[key] ?? "").trim() !== "");
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

// --- Sub-components -----------------------------------------------------------
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
  };

  const authoritySteps = chain.map((role) => {
    const review = reviewByRole.get(role);
    return {
      label: roleLabel(role),
      state: stepState(role),
      timestamp: review?.reviewed_at,
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Read-only cell: shows faculty text as plain text -------------------------
function RO({ val, center }) {
  return <span style={{ fontSize: 11, fontFamily: "inherit", color: "#1e293b", display: "block", textAlign: center ? "center" : "left" }}>{val || <span style={{ color: "#cbd5e1" }}>-</span>}</span>;
}

// --- HOD-editable score input -------------------------------------------------
function HodInput({ val, onChange, max, disabled = false }) {
  return (
    <input
      type="number" min="0" step="0.5" value={val ?? ""}
      max={max}
      disabled={disabled}
      onChange={e => onChange(e.target.value === "" || max === undefined ? e.target.value : String(clampScore(e.target.value, max)))}
      style={{ width: 58, height: 30, boxSizing: "border-box", textAlign: "center", border: "1.5px solid #6366f1", borderRadius: 5, padding: "5px 6px", fontSize: 11, fontFamily: "inherit", outline: "none", background: disabled ? "#f1f5f9" : "#f0f4ff", cursor: disabled ? "not-allowed" : "text" }}
    />
  );
}

// --- Text Input ---------------------------------------------------------------
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
          ? { width: "100%", maxWidth: "100%", height: 30, boxSizing: "border-box", border: textErr ? "1.5px solid #ef4444" : "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, lineHeight: 1.25, fontFamily: "inherit", outline: "none", textAlign: "center" }
          : { width: "100%", maxWidth: "100%", height: 30, boxSizing: "border-box", border: textErr ? "1.5px solid #ef4444" : "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, lineHeight: 1.25, fontFamily: "inherit", outline: "none" }}
      />
      {textErr && (
        <span style={{ position: "absolute", left: 0, top: "100%", fontSize: 9, color: "#ef4444", whiteSpace: "nowrap", lineHeight: 1.2 }}>
          Text expected
        </span>
      )}
    </div>
  );
}

// --- DocCell: file upload component -------------------------------------------
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
    setUploadError("");

    try {
      const uploadedFiles = [];

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", `faculty-appraisal/${id}`);
        const uploaded = await api.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploadedFiles.push(uploaded);
      }

      setDocs((p) => ({ ...p, [id]: [...(p[id] ?? []), ...uploadedFiles] }));
    } catch (err) {
      console.error("Upload error:", err);
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
          <span style={{ color: "#0ea5e9", fontSize: 10 }}>File</span>
          <span style={{ fontSize: 10, color: "#1e293b", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={f.name}>{f.name}</span>
          {!readOnly && <button onClick={() => removeFile(idx)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 10, cursor: "pointer" }}>Remove</button>}
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: uploading ? "wait" : "pointer", padding: "4px 6px", border: "1px dashed #cbd5e1", borderRadius: 4, background: "#f8fafc", opacity: uploading ? 0.7 : 1 }} onClick={() => !uploading && !readOnly && ref.current.click()}>
        <span style={{ fontSize: 10, color: "#64748b" }}>{uploading ? "Uploading..." : "Attach"}</span>
        <input
          ref={ref} type="file"
          accept="image/*,.pdf,application/pdf"
          style={{ display: "none" }}
          disabled={uploading || readOnly}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {uploadError && <span style={{ color: "#dc2626", fontSize: 9 }}>{uploadError}</span>}
    </div>
  );
}

// --- ViewCell: shows links to uploaded docs -----------------------------------
function ViewCell({ id, docs }) {
  const files = docs[id] || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((f, idx) => (
        <a key={idx} href={f.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#3b82f6", fontSize: 10, textDecoration: "none", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }} title={f.name}>
          {f.type?.startsWith("image/") && (
            <img src={f.url} alt="" style={{ width: 22, height: 22, objectFit: "cover", borderRadius: 3 }} />
          )}
          View {f.name.length > 14 ? f.name.slice(0, 14) + "..." : f.name}
        </a>
      ))}
    </div>
  );
}

// --- Row Buttons --------------------------------------------------------------
function RowBtns({ onAdd, onDel, canDel = true }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button style={{ padding: "6px 12px", background: "#10b981", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={onAdd}>+ Add Row</button>
      {canDel && <button style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }} onClick={onDel}>- Delete Last</button>}
    </div>
  );
}

// --- View Docs cell (read-only, opens uploaded files) -------------------------
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
        style={{ padding: "9px 22px", background: locked ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: 7, cursor: locked || saving ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit", opacity: saving ? 0.75 : 1 }}
      >
        {saving ? "Saving..." : `Save ${label}`}
      </button>
    </div>
  );
}

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
          View {f.name.length > 16 ? f.name.slice(0, 16) + "..." : f.name}
        </a>
      ))}
    </div>
  );
}

// --- Section Card -------------------------------------------------------------
function SC({ title, subtitle, accent = "#6366f1", children }) {
  return (
    <div className="fa-section-card" style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(15,23,42,0.07)", marginBottom: 14, overflow: "hidden", border: "1px solid #e8ecf0", borderTop: `3px solid ${accent}` }}>
      <div style={{ padding: "10px 15px", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: accent }}>{title}</div>
        {subtitle && <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: "13px 15px" }}>{children}</div>
    </div>
  );
}

// --- Shared table styles ------------------------------------------------------
const T = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const TH = { border: "1px solid #334155", padding: "7px 8px", background: "#1e293b", color: "#e2e8f0", fontWeight: 700, textAlign: "center", fontSize: 10, letterSpacing: "0.3px" };
const TH_HOD = { ...TH, background: "#312e81", color: "#c7d2fe" };
const TD = { border: "1px solid #e2e8f0", padding: "4px 6px", verticalAlign: "middle" };
const TDC = { ...TD, textAlign: "center" };
const TDS = { ...TD, textAlign: "center", background: "#f8fafc", minWidth: 52 };
const TDS_HOD = { ...TDS, background: "#f0f4ff" };
const TDV = { ...TD, background: "#fafbff", minWidth: 110 };

// --- Faculty Form in HOD Review Mode -----------------------------------------
function FacultyReviewForm({ faculty, hodData, setHodData, sectionView = "partA" }) {
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
        <span style={{ fontSize: 12, fontWeight: 800 }}>Review</span>
        <div>
          <strong>HOD Review Mode</strong> - Faculty data is read-only. Only <span style={{ color: "#c7d2fe", fontWeight: 700 }}>HOD Score</span> columns are editable. Click <span style={{ color: "#c7d2fe" }}>View Doc</span> links to open uploaded files.
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
      {/* -- PART A -- */}
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#dbeafe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>PART A - Teaching & Academic Activities</div>

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
            <th style={{ ...TH, width: 30 }}>SN</th>
            <th style={TH}>Course</th><th style={TH}>Program & Semester</th><th style={TH}>Availability as per IQAC format</th>
            <th style={TH}>Faculty Score</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(courseFile).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.course} /></td>
                <td style={TD}><RO val={r.title} /></td>
                <td style={TDC}><RO val={r.details} center /></td>
                <td style={TDS}><RO val={courseFileRowScore(r) ? String(courseFileRowScore(r)) : ""} center /></td>
                <td style={TDS_HOD}><HodInput val={get("courseFile", i, "hod")} onChange={v => set("courseFile", i, "hod", v)} max={SCORE_LIMITS.courseFileRow} /></td>
              </tr>
            ))}
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
      {faculty.sectionApplicability?.projects !== "notApplicable" && <SC title="A4. Projects (Max 10)" accent="#8b5cf6">
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
                <td style={TDS}><RO val={clampScore(r.score, projectGuidanceRowMax(r))} center /></td>
                <td style={TDS_HOD}><HodInput val={get("projects", i, "hod")} max={projectGuidanceRowMax(r)} onChange={v => set("projects", i, "hod", v)} /></td>
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
                  {r.fb1 && r.fb2 ? ((n(r.fb1) + n(r.fb2)) / 2).toFixed(2) : "-"}
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
            <th style={TH}>SN</th><th style={TH}>Activity</th><th style={TH}>Details</th>
            <th style={TH}>View Docs</th><th style={TH}>Faculty Score (Max 5)</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(society).map((r, i) => (
              <tr key={i} style={societyRowLocked(r) ? { background: "#f1f5f9", opacity: 0.65 } : i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TD}><RO val={r.details} /></td>
                <td style={TDV}><ViewDocsCell docKey={`soc-${i}`} docs={docs} /></td>
                <td style={TDS}><RO val={societyRowScore(r)} center /></td>
                <td style={TDS_HOD}><HodInput val={societyRowLocked(r) ? "0" : get("society", i, "hod")} max={SCORE_LIMITS.societyRow} disabled={societyRowLocked(r)} onChange={v => set("society", i, "hod", v)} /></td>
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
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>ACR is assessed by HOD only - faculty does not fill scores.</div>
        <table style={T}>
          <thead><tr>
            <th style={TH}>SN</th><th style={TH}>Parameter</th><th style={TH_HOD}>HOD Score</th>
          </tr></thead>
          <tbody>
            {rows(acr).map((r, i) => (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}><RO val={r.label} /></td>
                <td style={TDS_HOD}><HodInput val={String(get("acr", i, "hod") ?? "").trim() ? clampScore(get("acr", i, "hod"), SCORE_LIMITS.acrRow) : ""} max={SCORE_LIMITS.acrRow} onChange={v => set("acr", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      </>)}

      {sectionView === "partB" && (<>
      {/* -- PART B -- */}
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#ede9fe", padding: "8px 14px", borderRadius: 6, marginBottom: 10, letterSpacing: 0.3 }}>PART B - Research & Academic Contributions</div>

      {/* B1: Journals */}
      <SC title="B1. Research Papers / Journal Publications (Max 120)" accent="#7c3aed">
        <div style={{ overflowX: "auto" }}>
          <table style={T}>
            <thead><tr>
              <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Journal</th>
              <th style={TH}>ISSN</th><th style={TH}>Journal Indexing</th>
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
      {faculty.sectionApplicability?.research !== "notApplicable" && <SC title="B4(a). Research Guidance - PhD / PG (Max 30)" accent="#059669">
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
                <td style={TDS}><RO val={researchGuidanceScore(r).toFixed(1)} center /></td>
                <td style={TDS_HOD}><HodInput val={get("research", i, "hod")} onChange={v => set("research", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>}

      <SC title="B4(b). Research / Consultancy Internal Projects (Max 15)" accent="#059669">
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
                  <td style={TDS_HOD}><HodInput val={get("projects2", i, "hod")} max={SCORE_LIMITS.researchInternalProjects} onChange={v => set("projects2", i, "hod", v)} /></td>
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
                  <td style={TDS_HOD}><HodInput val={get("externalProjects", i, "hod")} max={SCORE_LIMITS.researchExternalProjects} onChange={v => set("externalProjects", i, "hod", v)} /></td>
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

      {/* B8a: FDP / Workshops */}
      <SC title="B8(a). FDP / Workshops Attended (Max 10)" accent="#10b981">
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
                <td style={TDS}><RO val={clampScore(r.score, SCORE_LIMITS.fdpRow)} center /></td>
                <td style={TDS_HOD}><HodInput val={get("fdps", i, "hod")} max={SCORE_LIMITS.fdpRow} onChange={v => set("fdps", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      {/* B8b: Industrial Training */}
      <SC title="B8(b). Industrial Training" accent="#10b981">
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
                <td style={TDS}><RO val={clampScore(r.score, SCORE_LIMITS.fdpRow)} center /></td>
                <td style={TDS_HOD}><HodInput val={get("training", i, "hod")} max={SCORE_LIMITS.fdpRow} onChange={v => set("training", i, "hod", v)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>
      </>)}
    </div>
  );
}

// --- Full Review Panel (opened when HOD clicks Review) ------------------------
function ReviewPanel({ faculty, onBack, onSubmit }) {
  const [hodData, setHodData] = useState({});
  const [remarks, setRemarks] = useState(faculty.hodRemarks || "");
  const [sectionView, setSectionView] = useState("partA");

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
    const cfRows = Array.isArray(faculty.courseFile) ? faculty.courseFile : (faculty.courseFile ? [faculty.courseFile] : []);
    const filledCfRows = cfRows.filter((row, i) => get("courseFile", i, "hod") > 0 || row?.course || row?.title || row?.details);
    const cf = filledCfRows.length
      ? clampScore(cfRows.reduce((a, _, i) => a + clampScore(get("courseFile", i, "hod"), SCORE_LIMITS.courseFileRow), 0) / filledCfRows.length, 20)
      : 0;
    const innov = getS("innovHod");
    const proj = faculty.sectionApplicability?.projects === "notApplicable" ? 0 : (faculty.projects || []).reduce((a, _, i) => a + get("projects", i, "hod"), 0);
    const qual = (faculty.quals || []).reduce((a, _, i) => a + get("quals", i, "hod"), 0);
    const fb = (faculty.feedback || []).reduce((a, _, i) => a + get("feedback", i, "hod"), 0);
    const dept = (faculty.deptActs || []).reduce((a, _, i) => a + get("deptActs", i, "hod"), 0);
    const uni = (faculty.uniActs || []).reduce((a, _, i) => a + get("uniActs", i, "hod"), 0);
    const soc = faculty.sectionApplicability?.society === "notApplicable" ? 0 : (faculty.society || []).reduce((a, row, i) => a + (societyRowLocked(row) ? 0 : get("society", i, "hod")), 0);
    const ind = (faculty.industry || []).reduce((a, _, i) => a + get("industry", i, "hod"), 0);
    const acrT = (faculty.acr || []).reduce((a, _, i) => a + clampScore(get("acr", i, "hod"), SCORE_LIMITS.acrRow), 0);
    const partA = lec + cf + innov + proj + qual + fb + dept + uni + soc + ind + acrT;

    const jour = (faculty.journals || []).reduce((a, _, i) => a + get("journals", i, "hod"), 0);
    const bk = (faculty.books || []).reduce((a, _, i) => a + get("books", i, "hod"), 0);
    const ictT = (faculty.ict || []).reduce((a, _, i) => a + get("ict", i, "hod"), 0);
    const res = faculty.sectionApplicability?.research === "notApplicable" ? 0 : (faculty.research || []).reduce((a, _, i) => a + get("research", i, "hod"), 0);
    const resProjects = clampScore((faculty.projects2 || []).reduce((a, _, i) => a + get("projects2", i, "hod"), 0), SCORE_LIMITS.researchInternalProjects);
    const externalResProjects = clampScore((faculty.externalProjects || []).reduce((a, _, i) => a + get("externalProjects", i, "hod"), 0), SCORE_LIMITS.researchExternalProjects);
    const pat = (faculty.patents || []).reduce((a, _, i) => a + get("patents", i, "hod"), 0);
    const awd = (faculty.awards || []).reduce((a, _, i) => a + get("awards", i, "hod"), 0);
    const conf = (faculty.confs || []).reduce((a, _, i) => a + get("confs", i, "hod"), 0);
    const prop = (faculty.proposals || []).reduce((a, _, i) => a + get("proposals", i, "hod"), 0);
    const prod = (faculty.products || []).reduce((a, _, i) => a + get("products", i, "hod"), 0);
    const fdp = clampScore((faculty.fdps || []).reduce((a, _, i) => a + clampScore(get("fdps", i, "hod"), SCORE_LIMITS.fdpRow), 0), 10);
    const train = clampScore((faculty.training || []).reduce((a, _, i) => a + clampScore(get("training", i, "hod"), SCORE_LIMITS.fdpRow), 0), 10);
    const partB = jour + bk + ictT + res + resProjects + externalResProjects + pat + awd + conf + prop + prod + fdp + train;

    return { partA, partB, total: partA + partB };
  };

  const { partA, partB, total } = calcHodScore();
  const g = grade(total, 575);
  const facultySummary = standardSubmittedScoreSummary(faculty, {
    partA: faculty.lectures?.reduce((a, r) => a + n(r.score), 0) || 0,
    partB: faculty.journals?.reduce((a, r) => a + n(r.score), 0) || 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: "100%" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, marginBottom: 16, borderRadius: 10 }}>
        <button onClick={onBack} style={{ background: "#1e293b", border: "none", color: "#94a3b8", cursor: "pointer", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "inherit" }}>Back</button>
        <Avatar initials={faculty.avatar} color={faculty.avatarColor} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>{faculty.name}</div>
          <div style={{ color: "#64748b", fontSize: 11 }}>{faculty.designation} - {faculty.employeeId}</div>
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

      {/* Section switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["partA", "Part A"], ["partB", "Part B"], ["summary", "Summary"]].map(([id, label]) => (
          <button key={id} onClick={() => {
            setSectionView(id);
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            });
          }}
            style={{ padding: "7px 18px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, background: sectionView === id ? "#312e81" : "#e2e8f0", color: sectionView === id ? "#e0e7ff" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {(sectionView === "partA" || sectionView === "partB") && (
        <FacultyReviewForm faculty={faculty} hodData={hodData} setHodData={setHodData} sectionView={sectionView} />
      )}

      {sectionView === "summary" && (
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
                ["Part A - Teaching & Activities", facultySummary.partAMax, facultySummary.partA, partA],
                ["Part B - Research & Contributions", facultySummary.partBMax, facultySummary.partB, partB],
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
                <td style={TDC}>{facultySummary.grandMax}</td>
                <td style={TDS}>{facultySummary.total.toFixed(1)}</td>
                <td style={{ ...TDS_HOD, color: "#065f46", fontSize: 14 }}>{total.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>

          <label style={{ fontWeight: 700, fontSize: 13, color: "#334155", display: "block", marginBottom: 6 }}>HOD Remarks</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={4}
            placeholder="Enter your remarks, observations, and recommendations for this faculty member..."
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 16 }} />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onBack} style={{ padding: "9px 22px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit" }}>Cancel</button>
            <button onClick={() => onSubmit(faculty.id, total, remarks)}
              disabled={!remarks.trim()}
              style={{ padding: "10px 28px", background: remarks.trim() ? "#059669" : "#64748b", color: "#fff", border: "none", borderRadius: 7, cursor: remarks.trim() ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
              Submit HOD Review
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main HOD Dashboard -------------------------------------------------------
export default function HODDashboard() {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState("myAppraisal");
  const [hodAppraisalTab, setHodAppraisalTab] = useState("partA");
  const [guidelinesTab, setGuidelinesTab] = useState("form");
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // -- HOD's own appraisal form state --
  const [info, setInfo] = useState({
    name: sessionStorage.getItem("name") || "",
    qual: sessionStorage.getItem("qualification") || "",
    desig: sessionStorage.getItem("designation") || "",
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
  const setCF = (i, k, v) => setCourseFile((p) => p.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, [k]: v };
    return next;
  }));
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
  const [workflowDeclaration, setWorkflowDeclaration] = useState(null);
  const [workflowReviews, setWorkflowReviews] = useState([]);

  useEffect(() => {
    const userEmail = sessionStorage.getItem("username");
    if (!userEmail || !info.ay) return;

    const loadOwnAppraisal = async () => {
      try {
        const data = await api.get("/appraisal/status", { params: { academic_year: info.ay } }).catch((err) => {
          console.error("Could not load workflow status:", err);
          return null;
        });
        const declaration = data?.declaration || null;
        setWorkflowDeclaration(declaration);
        setWorkflowReviews(data?.reviews || []);
        setAppraisalLocked(Boolean(declaration));

        await Promise.all([
          loadSavedAppraisal({
            facultyEmail: userEmail,
            academicYear: info.ay,
            setters: {
              setInfo, setLectures, setCourseFile, setInnovRows, setInnovDetails, setInnovScore,
              setProjects, setQuals, setFeedback, setDeptActs, setUniActs,
              setSociety, setIndustry, setAcr, setJournals, setBooks, setIct,
              setResearch, setProjects2, setExternalProjects, setPatents, setAwards,
              setConfs, setProposals, setProducts, setFdps, setTraining, setDocs,
              setSectionApplicability, setSectionSaveStatus,
            },
          }),
          loadAppraisalDocuments({ facultyEmail: userEmail, academicYear: info.ay, setDocs }),
        ]);
      } catch (err) {
        console.error("Could not load saved appraisal:", err);
      }
    };

    loadOwnAppraisal();
  }, [info.ay]);

  // -- Computed scores for HOD appraisal --
  const totalLecScore = averageSectionScore(lectures, 50);
  const courseFileScore = courseFileAverageScore(courseFile, 20);
  const innovTotal = clampScore(innovRows.reduce((s, r) => s + clampScore(r.score, SCORE_LIMITS.innovativeRow), 0), 10);
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
  const [submitting, setSubmitting] = useState(false);
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [attachmentsConfirmed, setAttachmentsConfirmed] = useState(false);

  const validateSelfAppraisalRows = () => {
    const sections = [
      { label: "A(i). Lectures", rows: lectures, fields: ["sem", "code", "planned", "conducted", "score"] },
      { label: "A(ii). Course File", rows: courseFile, fields: ["course", "title", "details"] },
      { label: "A(iii). Innovative Teaching Methods", rows: innovRows, fields: ["method", "details", "score"] },
      { label: "A(iv). Projects", rows: projects, fields: ["label", "score"], rowMax: projectGuidanceRowMax, maxScore: 10, skip: sectionApplicability.projects === "notApplicable" },
      { label: "A(v). Qualifications", rows: quals, fields: ["label", "score"] },
      { label: "A(vi). Student Feedback", rows: feedback, fields: ["code", "fb1", "fb2"] },
      { label: "A(vii). Department Activities", rows: deptActs, fields: ["activity", "nature", "score"] },
      { label: "A(viii). University Activities", rows: uniActs, fields: ["activity", "nature", "score"] },
      { label: "A(ix). Contribution to Society", rows: society, fields: ["details"] },
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
      { label: "B8(a). FDP / Workshops", rows: fdps, fields: ["program", "duration", "org", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 10 },
      { label: "B8(b). Industrial Training", rows: training, fields: ["company", "duration", "nature", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 10 },
    ];
    const errors = validateCompleteRows(sections, docs);
    [...projects2, ...externalProjects].forEach((row, index) => {
      if (row.date && !isValidDDMMYYYY(row.date)) errors.push(`B4 project row ${index + 1}: date must be DD/MM/YYYY.`);
    });
    if (errors.length) { alert(errors.join("\n")); return false; }
    return true;
  };

  const validateSelfAppraisalSectionRows = (section) => {
    const partASections = [
      { label: "A(i). Lectures", rows: lectures, fields: ["sem", "code", "planned", "conducted", "score"] },
      { label: "A(ii). Course File", rows: courseFile, fields: ["course", "title", "details"] },
      { label: "A(iii). Innovative Teaching Methods", rows: innovRows, fields: ["method", "details", "score"] },
      { label: "A(iv). Projects", rows: projects, fields: ["label", "score"], rowMax: projectGuidanceRowMax, maxScore: 10, skip: sectionApplicability.projects === "notApplicable" },
      { label: "A(v). Qualifications", rows: quals, fields: ["label", "score"] },
      { label: "A(vi). Student Feedback", rows: feedback, fields: ["code", "fb1", "fb2"] },
      { label: "A(vii). Department Activities", rows: deptActs, fields: ["activity", "nature", "score"] },
      { label: "A(viii). University Activities", rows: uniActs, fields: ["activity", "nature", "score"] },
      { label: "A(ix). Contribution to Society", rows: society, fields: ["details"] },
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
      { label: "B8(a). FDP / Workshops", rows: fdps, fields: ["program", "duration", "org", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 10 },
      { label: "B8(b). Industrial Training", rows: training, fields: ["company", "duration", "nature", "score"], rowMax: SCORE_LIMITS.fdpRow, maxScore: 10 },
    ];
    const errors = validateCompleteRows(section === "partA" ? partASections : partBSections, docs);
    if (section !== "partA") {
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

  const buildSelfDraftForm = (saveStatus = sectionSaveStatus) => normalizeAutoScores({ info, lectures, courseFile, innovDetails: innovRows.map((row) => row.method).filter(Boolean).join(", "), innovScore: innovScoreComputed, innovRows, projects, quals, feedback, deptActs, uniActs, society, industry, acr, journals, books, ict, research, projects2, externalProjects, patents, awards, confs, proposals, products, fdps, training, sectionApplicability, sectionSaveStatus: saveStatus });

  const markSnapshotLocked = () => {
    setAppraisalLocked(true);
    setWorkflowDeclaration((current) => current || { status: "Submitted" });
  };

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
        form: buildSelfDraftForm(nextStatus),
        totals: { partATotal, partBTotal, grandTotal },
        docs,
        submitterProfile: profileFromsessionStorage(),
        sectionSaveStatus: nextStatus,
      });
      setSectionSaveStatus(nextStatus);
    } catch (err) {
      if (err?.statusCode === 403 || err?.response?.status === 403) {
        markSnapshotLocked();
        return;
      }
      alert(`Unable to save draft.\n\n${err.message}`);
    } finally {
      setSavingSection(null);
    }
  };
  const handleSubmitAppraisal = async () => {
    if (appraisalLocked) {
      alert("This appraisal has already been submitted and is locked for review.");
      return;
    }
    if (!accuracyConfirmed || !attachmentsConfirmed) {
      alert("Please tick both declaration checkboxes before submitting.");
      return;
    }
    if (!validateSelfAppraisalRows()) return;

    // 1. Basic Validation
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

    const workflowError = workflowValidationError(profileFromsessionStorage());
    if (workflowError) {
      alert(workflowError);
      return;
    }

    const confirmSubmit = window.confirm("Are you sure you want to submit your appraisal? This will save your data to the database.");
    if (!confirmSubmit) return;

    setSubmitting(true);
    try {
      const reviewChain = getReviewChain(profileFromsessionStorage());
      const nextReviewer = reviewChain[0];
      const workflowStatus = nextReviewer ? pendingStatusFor(nextReviewer) : "Submitted";

      // 2. Submit all form data via API
      const submitterProfile = profileFromsessionStorage();

      const submittedAt = new Date().toISOString();
      await submitAppraisal({
        facultyEmail: userEmail,
        academicYear: info.ay,
        form: buildSelfDraftForm(),
        totals: { partATotal, partBTotal, grandTotal },
        docs,
        submitterProfile,
        activeProfile: submitterProfile,
      });
      alert("Appraisal submitted successfully!");
      setAppraisalLocked(true);
      setWorkflowDeclaration({
        status: workflowStatus,
        submitted_at: submittedAt,
        updated_at: submittedAt,
      });
      setWorkflowReviews([]);
    } catch (err) {
      console.error("Submission error:", err);
      alert(`Unable to submit appraisal.\n\n${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const generateReport = async () => {
  const win = window.open('', '_blank');
  if (!win) { alert("Please allow popups to generate the report."); return; }
  let logoSrc = `${window.location.origin}/image.png`;
  try {
    const res = await fetch(logoSrc);
    const blob = await res.blob();
    logoSrc = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  } catch { /* use URL fallback */ }

  const html = `
  <html>
  <head>
    <title>Faculty Appraisal</title>

    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: "Times New Roman", serif; font-size: 11px; color: #000; }
      h1 { text-align: center; font-size: 15px; margin: 4px 0; }
      h2 { text-align: center; font-size: 13px; margin: 3px 0; }
      h3 { font-size: 12px; margin: 10px 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      th, td { border: 1px solid #000; padding: 4px 6px; word-wrap: break-word; vertical-align: top; }
      th { background: #d9d9d9; text-align: center; font-weight: bold; }
      .c { text-align: center; }
      .b { font-weight: bold; }
      .pb { page-break-before: always; }
      .tr { background: #f2f2f2; font-weight: bold; }
      .ht { width: 100%; border: none; margin-bottom: 6px; }
      .ht td { border: none; padding: 2px; }
      .logo { width: 22mm; height: auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .st th { background: #bfbfbf; }
    </style>
  </head>

  <body>

    <table class="ht"><tr>
      <td style="width:20%;text-align:left"><img class="logo" src="${logoSrc}" alt="DYPIU" /></td>
      <td style="text-align:center">
        <h1>D Y PATIL INTERNATIONAL UNIVERSITY, AKURDI, PUNE</h1>
        <h2>Faculty Appraisal Form — Academic Year ${info.ay || ""}</h2>
      </td>
      <td style="width:20%"></td>
    </tr></table>

    <table>
      <tr><td class="b" style="width:35%">Name of Faculty</td><td>${info.name || "&nbsp;"}</td></tr>
      <tr><td class="b">Educational Qualifications</td><td>${info.qual || "&nbsp;"}</td></tr>
      <tr><td class="b">Present Designation</td><td>${info.desig || "&nbsp;"}</td></tr>
      <tr><td class="b">School / Department</td><td>${info.school || "&nbsp;"}</td></tr>
      <tr><td class="b">Experience at DYPIU / Previous / Total</td><td>${info.expDyp || "&nbsp;"} / ${info.expPrev || "&nbsp;"} / ${info.expTotal || "&nbsp;"} years</td></tr>
    </table>

    <h3 style="background:#d9d9d9;padding:4px;text-align:center;font-size:13px">PART A — Teaching Process &amp; Academic Activities</h3>

    <h3>(i) Lectures / Tutorials / Practicals &nbsp;(Max 50)</h3>
    <table>
      <tr><th>SN</th><th>Semester</th><th>Course Code / Name</th><th>Classes as per Course Structure</th><th>Classes Actually Conducted</th><th>API Score</th></tr>
      ${lectures.map((l,i) => `<tr><td class="c">${i+1}</td><td>${l.sem||'&nbsp;'}</td><td>${l.code||'&nbsp;'}</td><td class="c">${l.planned||'&nbsp;'}</td><td class="c">${l.conducted||'&nbsp;'}</td><td class="c">${l.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Average Score (Max 50)</td><td class="c">${totalLecScore.toFixed(1)}</td></tr>
    </table>

    <h3>(ii) Course File &nbsp;(Max 20)</h3>
    <table>
      <tr><th>SN</th><th>Course / Paper</th><th>Program & Semester</th><th>Details</th><th>API Score</th></tr>
      ${courseFile.map((c,i) => `<tr><td class="c">${i+1}</td><td>${c.course||'&nbsp;'}</td><td>${c.title||'&nbsp;'}</td><td>${c.details||'&nbsp;'}</td><td class="c">${c.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="4" class="c b">Average Score (Max 20)</td><td class="c">${courseFileScore.toFixed(1)}</td></tr>
    </table>

    <h3>(iii) Innovative Teaching-Learning Methodologies &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Methods Used</th><th>Details</th><th>API Score</th></tr>
      ${innovRows.map((r,i) => `<tr><td class="c">${i+1}</td><td>${r.method||'&nbsp;'}</td><td>${r.details||'&nbsp;'}</td><td class="c">${r.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="3" class="c b">Total Score (Max 10)</td><td class="c">${innovTotal.toFixed(1)}</td></tr>
    </table>

    ${sectionApplicability.projects !== "notApplicable" ? `
    <h3>(iv) Projects &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Project Type</th><th>API Score</th></tr>
      ${projects.map((p,i) => `<tr><td class="c">${i+1}</td><td>${p.label||'&nbsp;'}</td><td class="c">${clampScore(p.score, projectGuidanceRowMax(p))||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="2" class="c b">Total Score (Max 10)</td><td class="c">${projectTotal.toFixed(1)}</td></tr>
    </table>` : ""}

    <h3>(v) Qualification Enhancement &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Qualification / Category</th><th>API Score</th></tr>
      ${quals.map((q,i) => `<tr><td class="c">${i+1}</td><td>${q.label||'&nbsp;'}</td><td class="c">${q.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="2" class="c b">Total Score (Max 10)</td><td class="c">${qualTotal.toFixed(1)}</td></tr>
    </table>

    <h3>B. Students' Feedback &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Course Code / Name</th><th>First Feedback</th><th>Second Feedback</th><th>Average</th><th>API Score</th></tr>
      ${feedback.map((f,i) => `<tr><td class="c">${i+1}</td><td>${f.code||'&nbsp;'}</td><td class="c">${f.fb1||'&nbsp;'}</td><td class="c">${f.fb2||'&nbsp;'}</td><td class="c">${(f.fb1||f.fb2)?((n(f.fb1)+n(f.fb2))/((f.fb1?1:0)+(f.fb2?1:0)||1)).toFixed(2):'&nbsp;'}</td><td class="c">${(f.fb1||f.fb2)?(((n(f.fb1)+n(f.fb2))/((f.fb1?1:0)+(f.fb2?1:0)||1))/10).toFixed(2):'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Total (Max 10)</td><td class="c">${stuFeedbackScore.toFixed(1)}</td></tr>
    </table>

    <h3>C. Departmental / School Activities &nbsp;(Max 20)</h3>
    <table>
      <tr><th>SN</th><th>Activity</th><th>Nature of Activity</th><th>API Score</th></tr>
      ${deptActs.map((d,i) => `<tr><td class="c">${i+1}</td><td>${d.activity||'&nbsp;'}</td><td>${d.nature||'&nbsp;'}</td><td class="c">${d.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="3" class="c b">Total (Max 20)</td><td class="c">${deptScore.toFixed(1)}</td></tr>
    </table>

    <h3>D. University Level Activities &nbsp;(Max 30)</h3>
    <table>
      <tr><th>SN</th><th>Activity</th><th>Nature of Activity</th><th>API Score</th></tr>
      ${uniActs.map((u,i) => `<tr><td class="c">${i+1}</td><td>${u.activity||'&nbsp;'}</td><td>${u.nature||'&nbsp;'}</td><td class="c">${u.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="3" class="c b">Total (Max 30)</td><td class="c">${uniScore.toFixed(1)}</td></tr>
    </table>

    <h3>E. Contribution to Society &nbsp;(Max 10)</h3>
    ${sectionApplicability.society === "notApplicable" ? "<p><em>Not Applicable</em></p>" : `<table>
      <tr><th>SN</th><th>Activity</th><th>Details</th><th>API Score</th></tr>
      ${society.map((s,i) => `<tr><td class="c">${i+1}</td><td>${s.label||'&nbsp;'}</td><td>${s.details||'&nbsp;'}</td><td class="c">${societyRowScore(s)}</td></tr>`).join('')}
      <tr class="tr"><td colspan="3" class="c b">Total (Max 10)</td><td class="c">${societyScore.toFixed(1)}</td></tr>
    </table>`}

    <h3>F. Industry Connect Activity &nbsp;(Max 5)</h3>
    <table>
      <tr><th>SN</th><th>Name of Industry</th><th>Details of Activity</th><th>API Score</th></tr>
      ${industry.map((ind,i) => `<tr><td class="c">${i+1}</td><td>${ind.name||'&nbsp;'}</td><td>${ind.details||'&nbsp;'}</td><td class="c">${ind.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="3" class="c b">Total (Max 5)</td><td class="c">${industryScore.toFixed(1)}</td></tr>
    </table>

    <h3>G. Annual Confidential Report &nbsp;(Max 25)</h3>
    <table>
      <tr><th>SN</th><th>Parameter</th><th>API Score</th></tr>
      ${acr.map((a,i) => `<tr><td class="c">${i+1}</td><td>${a.label||'&nbsp;'}</td><td class="c">${String(a.score ?? "").trim() ? clampScore(a.score, SCORE_LIMITS.acrRow) : '&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="2" class="c b">Total (Max 25)</td><td class="c">${acrScore.toFixed(1)}</td></tr>
    </table>

    <table class="st">
      <tr><th>Part A Summary</th><th>Max</th><th>Faculty Score</th></tr>
      <tr><td>Teaching Process (i+ii+iii+iv+v)</td><td class="c">100</td><td class="c">${teachingRaw.toFixed(1)}</td></tr>
      <tr><td>Students' Feedback</td><td class="c">10</td><td class="c">${stuFeedbackScore.toFixed(1)}</td></tr>
      <tr><td>Departmental Activities</td><td class="c">20</td><td class="c">${deptScore.toFixed(1)}</td></tr>
      <tr><td>University Activity</td><td class="c">30</td><td class="c">${uniScore.toFixed(1)}</td></tr>
      <tr><td>Contribution to Society</td><td class="c">${sectionApplicability.society === "notApplicable" ? "N/A" : "10"}</td><td class="c">${societyScore.toFixed(1)}</td></tr>
      <tr><td>Industry Connect</td><td class="c">5</td><td class="c">${industryScore.toFixed(1)}</td></tr>
      <tr><td>Annual Confidential Report</td><td class="c">25</td><td class="c">${acrScore.toFixed(1)}</td></tr>
      <tr class="tr"><td class="b">PART A TOTAL</td><td class="c b">${effectivePartAMax}</td><td class="c b">${partATotal.toFixed(1)}</td></tr>
    </table>

    <div class="pb"></div>
    <h3 style="background:#d9d9d9;padding:4px;text-align:center;font-size:13px">PART B — Research &amp; Academic Contributions</h3>

    <h3>1) Published Papers in Journals &nbsp;(Max 120)</h3>
    <table>
      <tr><th>SN</th><th>Title with Page Nos.</th><th>Journal Details</th><th>ISSN/ISBN No.</th><th>Journal Indexing</th><th>API Score</th></tr>
      ${journals.map((j,i) => `<tr><td class="c">${i+1}</td><td>${j.title||'&nbsp;'}</td><td>${j.journal||'&nbsp;'}</td><td class="c">${j.issn||'&nbsp;'}</td><td class="c">${j.index||'&nbsp;'}</td><td class="c">${j.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Total (Max 120)</td><td class="c">${journalScore.toFixed(1)}</td></tr>
    </table>

    <h3>2) Articles / Chapters in Books &nbsp;(Max 50)</h3>
    <table>
      <tr><th>SN</th><th>Title with Page Nos.</th><th>Book Title, Editor &amp; Publisher</th><th>ISSN/ISBN</th><th>Type of Publisher</th><th>Co-authors</th><th>First Author</th><th>API Score</th></tr>
      ${books.map((b,i) => `<tr><td class="c">${i+1}</td><td>${b.title||'&nbsp;'}</td><td>${b.book||'&nbsp;'}</td><td class="c">${b.issn||'&nbsp;'}</td><td>${b.pub||'&nbsp;'}</td><td>${b.coauth||'&nbsp;'}</td><td class="c">${b.first||'&nbsp;'}</td><td class="c">${b.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="7" class="c b">Total (Max 50)</td><td class="c">${bookScore.toFixed(1)}</td></tr>
    </table>

    <h3>3) ICT Mediated Teaching Learning Pedagogy &nbsp;(Max 20)</h3>
    <table>
      <tr><th>SN</th><th>Title</th><th>Short Description</th><th>Type / Link</th><th>Quadrants</th><th>API Score</th></tr>
      ${ict.map((r,i) => `<tr><td class="c">${i+1}</td><td>${r.title||'&nbsp;'}</td><td>${r.desc||'&nbsp;'}</td><td>${r.type||'&nbsp;'}</td><td class="c">${r.quad||'&nbsp;'}</td><td class="c">${r.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Total (Max 20)</td><td class="c">${ictScore.toFixed(1)}</td></tr>
    </table>

    ${sectionApplicability.research !== "notApplicable" ? `
    <h3>4a) Research Guidance — PhD / PG &nbsp;(Max 30)</h3>
    <table>
      <tr><th>SN</th><th>Degree</th><th>Name of Student</th><th>Thesis / Status</th><th>API Score</th></tr>
      ${research.map((r,i) => `<tr><td class="c">${i+1}</td><td class="c">${r.degree||'&nbsp;'}</td><td>${r.name||'&nbsp;'}</td><td>${r.thesis||'&nbsp;'}</td><td class="c">${researchGuidanceScore(r).toFixed(1)}</td></tr>`).join('')}
      <tr class="tr"><td colspan="4" class="c b">Total (Max 30)</td><td class="c">${researchScore.toFixed(1)}</td></tr>
    </table>` : ""}

    <h3>4b) Internal Research Projects &nbsp;(Max 15)</h3>
    <table>
      <tr><th>SN</th><th>Title</th><th>Funding Agency</th><th>Date of Sanction</th><th>Grant Amount</th><th>Role</th><th>Status</th><th>API Score</th></tr>
      ${projects2.map((p,i) => `<tr><td class="c">${i+1}</td><td>${p.title||'&nbsp;'}</td><td>${p.agency||'&nbsp;'}</td><td class="c">${p.date||'&nbsp;'}</td><td class="c">${p.amount||'&nbsp;'}</td><td>${p.role||'&nbsp;'}</td><td>${p.status||'&nbsp;'}</td><td class="c">${p.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="7" class="c b">Total (Max 15)</td><td class="c">${projectBScore.toFixed(1)}</td></tr>
    </table>

    <h3>4c) External Research Projects &nbsp;(Max 30)</h3>
    <table>
      <tr><th>SN</th><th>Title</th><th>Funding Agency</th><th>Date of Sanction</th><th>Grant Amount</th><th>Role</th><th>Status</th><th>API Score</th></tr>
      ${externalProjects.map((p,i) => `<tr><td class="c">${i+1}</td><td>${p.title||'&nbsp;'}</td><td>${p.agency||'&nbsp;'}</td><td class="c">${p.date||'&nbsp;'}</td><td class="c">${p.amount||'&nbsp;'}</td><td>${p.role||'&nbsp;'}</td><td>${p.status||'&nbsp;'}</td><td class="c">${p.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="7" class="c b">Total (Max 30)</td><td class="c">${externalProjectScore.toFixed(1)}</td></tr>
    </table>

    <h3>5a) Patents (IPR) &nbsp;(Max 40)</h3>
    <table>
      <tr><th>SN</th><th>Title</th><th>National / International</th><th>Date of Filing</th><th>Status</th><th>Patent File No.</th><th>API Score</th></tr>
      ${patents.map((p,i) => `<tr><td class="c">${i+1}</td><td>${p.title||'&nbsp;'}</td><td class="c">${p.type||'&nbsp;'}</td><td class="c">${p.date||'&nbsp;'}</td><td>${p.status||'&nbsp;'}</td><td class="c">${p.fileNo||'&nbsp;'}</td><td class="c">${p.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="6" class="c b">Total (Max 40)</td><td class="c">${patentScore.toFixed(1)}</td></tr>
    </table>

    <h3>5b) Research Awards / Fellowships &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Title of Award</th><th>Date</th><th>Awarding Agency</th><th>Level</th><th>API Score</th></tr>
      ${awards.map((a,i) => `<tr><td class="c">${i+1}</td><td>${a.title||'&nbsp;'}</td><td class="c">${a.date||'&nbsp;'}</td><td>${a.agency||'&nbsp;'}</td><td>${a.level||'&nbsp;'}</td><td class="c">${a.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Total (Max 10)</td><td class="c">${awardScore.toFixed(1)}</td></tr>
    </table>

    <h3>6) Conferences / Seminars / Workshops &nbsp;(Max 30)</h3>
    <table>
      <tr><th>SN</th><th>Title / Session</th><th>Type</th><th>Organization</th><th>Level</th><th>API Score</th></tr>
      ${confs.map((c,i) => `<tr><td class="c">${i+1}</td><td>${c.title||'&nbsp;'}</td><td>${c.type||'&nbsp;'}</td><td>${c.org||'&nbsp;'}</td><td>${c.level||'&nbsp;'}</td><td class="c">${c.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Total (Max 30)</td><td class="c">${confScore.toFixed(1)}</td></tr>
    </table>

    <h3>7a) Submitted Research Proposals &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Title of Proposal</th><th>Duration</th><th>Funding Agency</th><th>Grant Amount Requested</th><th>API Score</th></tr>
      ${proposals.map((p,i) => `<tr><td class="c">${i+1}</td><td>${p.title||'&nbsp;'}</td><td class="c">${p.duration||'&nbsp;'}</td><td>${p.agency||'&nbsp;'}</td><td class="c">${p.amount||'&nbsp;'}</td><td class="c">${p.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="5" class="c b">Total (Max 10)</td><td class="c">${proposalScore.toFixed(1)}</td></tr>
    </table>

    <h3>7b) Product Developed and Used by Students / Commercialized &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Details of Product</th><th>Used by Students / Commercialized</th><th>API Score</th></tr>
      ${products.map((p,i) => `<tr><td class="c">${i+1}</td><td>${p.details||'&nbsp;'}</td><td>${p.usage||'&nbsp;'}</td><td class="c">${p.score||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="3" class="c b">Total (Max 10)</td><td class="c">${productScore.toFixed(1)}</td></tr>
    </table>

    <h3>8a) Attended FDP / Workshops &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Program</th><th>Duration</th><th>Organized By</th><th>API Score</th></tr>
      ${fdps.map((f,i) => `<tr><td class="c">${i+1}</td><td>${f.program||'&nbsp;'}</td><td class="c">${f.duration||'&nbsp;'}</td><td>${f.org||'&nbsp;'}</td><td class="c">${clampScore(f.score, SCORE_LIMITS.fdpRow)||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="4" class="c b">Total (Max 10)</td><td class="c">${fdpScore.toFixed(1)}</td></tr>
    </table>

    <h3>8b) Industrial Training &nbsp;(Max 10)</h3>
    <table>
      <tr><th>SN</th><th>Company / Industry</th><th>Duration</th><th>Nature of Training</th><th>API Score</th></tr>
      ${training.map((t,i) => `<tr><td class="c">${i+1}</td><td>${t.company||'&nbsp;'}</td><td class="c">${t.duration||'&nbsp;'}</td><td>${t.nature||'&nbsp;'}</td><td class="c">${clampScore(t.score, SCORE_LIMITS.fdpRow)||'&nbsp;'}</td></tr>`).join('')}
      <tr class="tr"><td colspan="4" class="c b">Total (Max 10)</td><td class="c">${trainScore.toFixed(1)}</td></tr>
    </table>

    <div class="pb"></div>
    <h3 style="text-align:center;font-size:13px">SUMMARY OF API SCORES — AY ${info.ay||""}</h3>
    <table class="st">
      <tr><th>Sr.No.</th><th>Criteria</th><th>Max Score</th><th>Faculty Score</th></tr>
      <tr><td colspan="4" class="b" style="background:#d9d9d9;text-align:center">Part A — Teaching Process</td></tr>
      <tr><td class="c">A</td><td>Teaching Process (i+ii+iii+iv+v)</td><td class="c">100</td><td class="c">${teachingRaw.toFixed(1)}</td></tr>
      <tr><td class="c">B</td><td>Students' Feedback</td><td class="c">10</td><td class="c">${stuFeedbackScore.toFixed(1)}</td></tr>
      <tr><td class="c">C</td><td>Departmental Activities</td><td class="c">20</td><td class="c">${deptScore.toFixed(1)}</td></tr>
      <tr><td class="c">D</td><td>University Activity</td><td class="c">30</td><td class="c">${uniScore.toFixed(1)}</td></tr>
      <tr><td class="c">E</td><td>Contribution to Society</td><td class="c">${sectionApplicability.society === "notApplicable" ? "N/A" : "10"}</td><td class="c">${societyScore.toFixed(1)}</td></tr>
      <tr><td class="c">F</td><td>Industry Connect</td><td class="c">5</td><td class="c">${industryScore.toFixed(1)}</td></tr>
      <tr><td class="c">G</td><td>Annual Confidential Report</td><td class="c">25</td><td class="c">${acrScore.toFixed(1)}</td></tr>
      <tr class="tr"><td colspan="2" class="c b">Part A Total</td><td class="c b">${effectivePartAMax}</td><td class="c b">${partATotal.toFixed(1)}</td></tr>
      <tr><td colspan="4" class="b" style="background:#d9d9d9;text-align:center">Part B — Research and Academic Contribution</td></tr>
      <tr><td class="c">1</td><td>Research papers / journal publication</td><td class="c">120</td><td class="c">${journalScore.toFixed(1)}</td></tr>
      <tr><td class="c">2</td><td>Books authored / edited / book chapter</td><td class="c">50</td><td class="c">${bookScore.toFixed(1)}</td></tr>
      <tr><td class="c">3</td><td>ICT Teaching Learning Pedagogy</td><td class="c">20</td><td class="c">${ictScore.toFixed(1)}</td></tr>
      <tr><td class="c">4</td><td>Research guidance / projects / consultancy</td><td class="c">75</td><td class="c">${(researchScore+projectBScore+externalProjectScore).toFixed(1)}</td></tr>
      <tr><td class="c">5</td><td>Patents, Awards, Fellowship</td><td class="c">50</td><td class="c">${(patentScore+awardScore).toFixed(1)}</td></tr>
      <tr><td class="c">6</td><td>Conferences / paper presentations</td><td class="c">30</td><td class="c">${confScore.toFixed(1)}</td></tr>
      <tr><td class="c">7</td><td>Research proposals / product development</td><td class="c">20</td><td class="c">${(proposalScore+productScore).toFixed(1)}</td></tr>
      <tr><td class="c">8</td><td>Self Development (FDP / Industrial Training)</td><td class="c">10</td><td class="c">${b8Score.toFixed(1)}</td></tr>
      <tr class="tr"><td colspan="2" class="c b">Part B Total</td><td class="c b">${effectivePartBMax}</td><td class="c b">${partBTotal.toFixed(1)}</td></tr>
      <tr style="background:#bfbfbf;font-weight:bold;font-size:13px"><td colspan="2" class="c">Grand Total (Part A + Part B)</td><td class="c">${effectiveGrandMax}</td><td class="c">${grandTotal.toFixed(1)}</td></tr>
    </table>

    <h3 style="text-align:center;font-size:14px;background:#d9d9d9;padding:6px;margin:16px 0 10px">DECLARATION BY FACULTY</h3>
    <table style="border:none;margin-bottom:14px">
      <tr>
        <td style="border:none;vertical-align:top;width:32px;font-size:18px">&#10003;</td>
        <td style="border:none;line-height:1.7;font-size:11px">
          I, <strong>${info.name || "________________________"}</strong>, hereby declare that all the information
          furnished in this Self-Appraisal Report is true, complete, and correct to the best of my knowledge and belief.
          I understand that in the event of any information being found false or incorrect, I shall be solely responsible
          for the consequences thereof and shall be liable for any disciplinary action as deemed fit by the University authorities.
        </td>
      </tr>
    </table>
    <table style="border:none;margin-bottom:20px">
      <tr>
        <td style="border:none;width:50%">
          <div style="border-bottom:1px solid #000;min-height:36px;margin-bottom:4px">&nbsp;</div>
          <div><strong>Signature of Faculty</strong></div>
          <div style="margin-top:6px"><strong>Name:</strong> ${info.name || "&nbsp;"}</div>
          <div style="margin-top:4px"><strong>Date of Submission:</strong> ${workflowDeclaration?.submitted_at ? new Date(workflowDeclaration.submitted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "&nbsp;"}</div>
        </td>
        <td style="border:none;width:50%">&nbsp;</td>
      </tr>
    </table>
    ${workflowReviews.length ? `
    <h3 style="text-align:center;font-size:13px;background:#d9d9d9;padding:4px;margin:0 0 8px">REVIEWERS' ACKNOWLEDGEMENT</h3>
    <p style="font-size:10px;margin:0 0 10px">The following authorities acknowledge that they have reviewed the details submitted by the faculty and confirm the accuracy of scores assigned.</p>
    <table>
      <thead><tr><th style="width:30%">Reviewer Role</th><th style="width:40%">Name &amp; Signature</th><th style="width:15%">Date</th><th style="width:15%">Stamp</th></tr></thead>
      <tbody>
        ${workflowReviews.map((rev) => `<tr>
          <td><strong>${roleLabel(rev.reviewer_role)}</strong></td>
          <td style="border-bottom:1px solid #000">${rev.reviewer_name || "&nbsp;"}</td>
          <td style="border-bottom:1px solid #000">${rev.reviewed_at ? new Date(rev.reviewed_at).toLocaleDateString("en-IN") : "&nbsp;"}</td>
          <td style="border-bottom:1px solid #000">&nbsp;</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}

  </body>
  </html>`;

  win.document.write(html);
  win.document.close();
  win.print();
};
  const navItems = [
    { id: "myAppraisal", icon: "👤", label: "My Appraisal", sub: "View your self-appraisal form" },
    { id: "guidelines", icon: "📋", label: "Guidelines", sub: "Faculty appraisal guidelines AY 2025-26" },
  ];
  const workflowRejected = isRejectedStatus(workflowDeclaration?.status) ||
    workflowReviews.some((review) => isRejectedStatus(review.status));

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "inherit", background: "#f8fafc", color: "#1e293b" }}>

      {/* -- Sidebar -- */}
      <aside style={{ width: 252, height: "100vh", minHeight: "100vh", boxSizing: "border-box", overflow: "hidden", background: "#0f172a", display: "flex", flexDirection: "column", padding: "22px 16px", gap: 14, position: "sticky", top: 0, alignSelf: "flex-start", flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.06)", boxShadow: "2px 0 16px rgba(15,23,42,0.14)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>FA</div>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13 }}>{APP_INFO.PORTAL_NAME}</div>
            <div style={{ color: "#475569", fontSize: 9, lineHeight: 1.3 }}>{APP_INFO.UNIVERSITY_NAME}</div>
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

        {navItems.map(tab => (
          <button key={tab.id} onClick={() => { setActiveMainTab(tab.id); }}
            style={{ background: activeMainTab === tab.id ? "rgba(99,102,241,0.18)" : "transparent", border: "none", borderRadius: 8, padding: "10px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", fontFamily: "inherit", transition: "background 0.15s" }}>
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
              style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "7px 8px", fontSize: 12, fontFamily: "inherit", color: "#e2e8f0", background: "#0f172a", outline: "none" }}
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
              style={{ width: "100%", border: "1px solid #334155", borderRadius: 7, padding: "7px 8px", fontSize: 12, fontFamily: "inherit", color: "#e2e8f0", background: "#0f172a", outline: "none" }}>
              <option value="form">Form Guidelines</option>
              <option value="grading">Grading Scheme</option>
            </select>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
        <button
          type="button"
          onClick={() => navigate("/edit-profile")}
          title="Edit profile"
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
        >
          <Avatar initials={(sessionStorage.getItem("name") || "U").split(" ").map(n => n[0]).join("").toUpperCase()} color="#6366f1" size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 700 }}>{(sessionStorage.getItem("name") || "User").split(" ").slice(0, 2).join(" ")}</div>
            <div style={{ color: "#475569", fontSize: 9 }}>{sessionStorage.getItem("role") || "Faculty"} {sessionStorage.getItem("department")?.split(" ")[0] || ""}</div>
          </div>
        </button>
        <div style={{ margin: "8px 0", padding: "10px 12px", background: "rgba(37,99,235,0.15)", border: "1px solid #2563eb", borderRadius: 8 }}>
          <div style={{ color: "#94a3b8", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>For any queries</div>
          <a href="mailto:appraisal@dypiu.ac.in" style={{ color: "#60a5fa", fontWeight: 600, fontSize: 11, wordBreak: "break-all", textDecoration: "none" }}>appraisal@dypiu.ac.in</a>
        </div>
        <button
          onClick={() => setShowLogoutModal(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "none", border: "1px solid #374151", borderRadius: 8, padding: "9px 11px", cursor: "pointer", fontFamily: "inherit" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12 }}>Logout</span>
        </button>
      </aside>

      {/* -- Main Content -- */}
      <main style={{ flex: 1, padding: "24px 30px", display: "flex", flexDirection: "column", gap: 18, overflowX: "auto" }}>

        {/* MY APPRAISAL TAB */}
        {activeMainTab === "myAppraisal" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#fff", borderRadius: 9, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 4, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>My Appraisal Form</h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{info.name || "Faculty"}.{info.ay}</p>
              </div>
              <AppraisalHeaderImage height={45} />
            </div>
            <WorkflowStatusTracker
              declaration={workflowDeclaration}
              reviews={workflowReviews}
              profile={profileFromsessionStorage()}
            />
            {appraisalLocked && (
              <div style={{ background: workflowRejected ? "#fef2f2" : "#ecfdf5", border: `1px solid ${workflowRejected ? "#fecaca" : "#bbf7d0"}`, color: workflowRejected ? "#991b1b" : "#166534", borderRadius: 9, padding: "10px 14px", fontSize: 12, fontWeight: 700 }}>
                {workflowRejected
                  ? "This appraisal was rejected. Review the approval status in the tracker above."
                  : "Submitted and locked for review. Your saved data is visible here, but editing is disabled while authorities review it."}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ flex: 1, pointerEvents: appraisalLocked && hodAppraisalTab !== "summary" ? "none" : "auto", opacity: appraisalLocked && hodAppraisalTab !== "summary" ? 0.78 : 1 }}>

            {/* Part A Tab */}
            {hodAppraisalTab === "partA" && (
              <SC title="Part A - Teaching & Academic Activities (Max 200)" accent="#6366f1">
                <div style={{ marginBottom: 14, padding: "8px 12px", background: "#f0f4ff", borderRadius: 6, fontSize: 12, color: "#312e81", fontWeight: 600 }}>
                  Total Part A Score: {partATotal.toFixed(1)}/{effectivePartAMax}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Fill in your teaching and academic activities for the appraisal period. Enter scores for each item.</div>
{/* A1. Teaching Process */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(i) Lectures, Tutorials, Practicals, Projects - Max 50 marks</div>
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
                          <td style={TDC}><TI val={r.planned} onChange={(v) => setLec(i, "planned", v)} center numeric /></td>
                          <td style={TDC}><TI val={r.conducted} onChange={(v) => setLec(i, "conducted", v)} center numeric /></td>
                          <td style={TD}><DocCell id={`lec-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`lec-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setLec(i, "score", v)} center numeric max={50} /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={7}>Average Score (Max 50)</td>
                        <td style={{ ...TDS, fontWeight: "bold", color: "#1e3a5f" }}>{totalLecScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setLectures((p) => [...p, { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" }])} onDel={() => setLectures((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={lectures.length > 1} />
                </div>

                {/* A2. Course File */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(ii) Course File - Max 20 marks</div>
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
                      <select value={r.details} onChange={(e) => setCF(i, "details", e.target.value)} style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontFamily: "inherit", fontSize: 11 }}>
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
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={4}>Average Score (Max 20)</td>
                        <td style={{ ...TDS, fontWeight: "bold", color: "#1e3a5f" }}>{courseFileScore.toFixed(1)}</td>
                      </tr>
                  </tbody>
                  </table>
                  <RowBtns onAdd={() =>setCourseFile((p) => [ ...p, { course: "", title: "", details: "", score: "", hod: "", director: "" }])}onDel={() =>setCourseFile((p) => (p.length > 1 ? p.slice(0, -1) : p))}canDel={courseFile.length > 1}/>
                </div>

                {/* A3. Innovative Teaching */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(iii) Innovative Teaching-Learning Methodologies - Max 10 marks</div>
                  <table style={T}>
                    <thead><tr>
                      <th style={{ ...TH, width: 30 }}>SN</th>
                      <th style={TH}>Methods Used</th>
                      <th style={TH}>Details</th>
                      <th style={TH}>Attachment</th>
                      <th style={TH}>View Docs</th>
                      <th style={TH}>Score</th>
                    </tr></thead>
                    <tbody>
                      {innovRows.map((r, i) => (
                        <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                          <td style={TDC}>{i + 1}</td>
                          <td style={TD}><TI val={r.method} onChange={(v) => setInnov(i, "method", v)} /></td>
                          <td style={TD}><TI val={r.details} onChange={(v) => setInnov(i, "details", v)} /></td>
                          <td style={TD}><DocCell id={`innov-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`innov-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setInnov(i, "score", v === "" ? "" : String(clampScore(v, SCORE_LIMITS.innovativeRow)))} numeric max={SCORE_LIMITS.innovativeRow} center /></td>
                        </tr>
                      ))}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold", color: "#1e3a5f" }}>{innovTotal.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setInnovRows((p) => [...p, { method: "", details: "", score: "" }])} onDel={() => setInnovRows((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={innovRows.length > 1} />
                </div>

                {/* A4. Projects */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(iv) Projects - Max 10 marks</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10, fontSize: 12, fontWeight: 700, color: "#334155" }}>
                    {["applicable", "notApplicable"].map((value) => (
                      <label key={value} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={sectionApplicability.projects === value}
                          onChange={() => {
                            setSectionApplicability((current) => ({ ...current, projects: value }));
                            if (value === "notApplicable") {
                              setProjects((rows) => rows.map((row) => ({ ...row, label: "", score: "" })));
                            }
                          }}
                        />
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
                          <td style={TDS}><TI val={r.score} readOnly={sectionApplicability.projects === "notApplicable"} onChange={(v) => setProj(i, "score", v)} center numeric max={projectGuidanceRowMax(r)} /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(v) Qualifications - Max 10 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setQual(i, "score", v)} center numeric max={SCORE_LIMITS.qualificationRow} /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(vi) Student Feedback - Max 10 marks</div>
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
                          <td style={TDC}><TI val={r.fb1} onChange={(v) => setFb(i, "fb1", v)} center numeric max={SCORE_LIMITS.feedbackAverage} /></td>
                          <td style={TDC}><TI val={r.fb2} onChange={(v) => setFb(i, "fb2", v)} center numeric max={SCORE_LIMITS.feedbackAverage} /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(vii) Department Activities - Max 20 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setDept(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(viii) University Activities - Max 30 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setUni(i, "score", v)} center numeric /></td>
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
                          <td style={TD}><TI val={r.details} onChange={(v) => setSoc(i, "details", v)} readOnly={socLocked} /></td>
                          <td style={TD}><DocCell id={`soc-${i}`} docs={docs} setDocs={setDocs} readOnly={socLocked} /></td>
                          <td style={TD}><ViewCell id={`soc-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setSoc(i, "score", v === "" ? "" : String(clampScore(v, SCORE_LIMITS.societyRow)))} numeric max={SCORE_LIMITS.societyRow} center readOnly={socLocked} /></td>
                        </tr>
                        );
                      })}
                      <tr style={{ background: "#eff6ff" }}>
                        <td style={{ ...TDC, fontWeight: "bold" }} colSpan={5}>Total Score (Max 10)</td>
                        <td style={{ ...TDS, fontWeight: "bold" }}>{societyScore.toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <RowBtns onAdd={() => setSociety((p) => [...p, { label: "", details: "", score: "" }])} onDel={() => setSociety((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={society.length > 1} />
                  </>}
                </div>

                {/* A10. Industry Connect */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(x) Industry Connect - Max 5 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setInd(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>(xi) Annual Confidential Report (ACR) - Max 25 marks</div>
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
              <SC title="Part B - Research & Academic Contributions (Max 375)" accent="#7c3aed">
                <div style={{ marginBottom: 14, padding: "8px 12px", background: "#ede9fe", borderRadius: 6, fontSize: 12, color: "#6d28d9", fontWeight: 600 }}>
                  Total Part B Score: {partBTotal.toFixed(1)}/{effectivePartBMax}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>Enter your research publications, patents, conferences, and other academic contributions.</div>

                {/* B1. Research Papers / Journals */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B1. Research Papers / Journals - Max 120 marks</div>
                  <table style={T}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 30 }}>SN</th>
                        <th style={TH}>Title</th>
                        <th style={TH}>Journal</th>
                        <th style={TH}>ISSN</th>
                        <th style={TH}>Journal Indexing</th>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setJour(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B2. Books / Chapters - Max 50 marks</div>
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
                          <td style={TD}><select value={r.first || ""} onChange={(e) => setBook(i, "first", e.target.value)} style={{ width: "100%", height: 30, border: "1px solid #d1d5db", borderRadius: 4, padding: "5px 6px", fontSize: 11, fontFamily: "inherit" }}><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select></td>
                          <td style={TD}><DocCell id={`book-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`book-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setBook(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B3. ICT Pedagogy - Max 20 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setIctRow(i, "score", v)} center numeric /></td>
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
                              style={{ width: "100%", height: 30, border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", fontSize: 11, fontFamily: "inherit" }}
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
                          <td style={TD}><TI val={r.amount} onChange={(v) => setPrj2(i, "amount", v)} numeric /></td>
                          <td style={TD}><TI val={r.role} onChange={(v) => setPrj2(i, "role", v)} textOnly /></td>
                          <td style={TD}><TI val={r.status} onChange={(v) => setPrj2(i, "status", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`project2-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`project2-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setPrj2(i, "score", v)} center numeric max={SCORE_LIMITS.researchInternalProjects} /></td>
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
                          <td style={TD}><TI val={r.amount} onChange={(v) => setExtPrj(i, "amount", v)} numeric /></td>
                          <td style={TD}><TI val={r.role} onChange={(v) => setExtPrj(i, "role", v)} textOnly /></td>
                          <td style={TD}><TI val={r.status} onChange={(v) => setExtPrj(i, "status", v)} textOnly /></td>
                          <td style={TD}><DocCell id={`externalProject-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`externalProject-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setExtPrj(i, "score", v)} center numeric max={SCORE_LIMITS.researchExternalProjects} /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B5(a). Patents (IPR) - Max 40 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setPat(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B5(b). Awards - Max 10 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setAwd(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B6. Invited Lectures / Resource Person / Paper Presentations - Max 30 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setConf(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B7(a). Submitted Research Proposals - Max 10 marks</div>
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
                          <td style={TD}><TI val={r.amount} onChange={(v) => setProp(i, "amount", v)} numeric /></td>
                          <td style={TD}><DocCell id={`prop-${i}`} docs={docs} setDocs={setDocs} /></td>
                          <td style={TD}><ViewCell id={`prop-${i}`} docs={docs} /></td>
                          <td style={TDS}><TI val={r.score} onChange={(v) => setProp(i, "score", v)} center numeric /></td>
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
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 8 }}>B7(b). Product Developed and Used by Students in Lab / Commercialized - Max 10 marks</div>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setProd(i, "score", v)} center numeric /></td>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setFdp(i, "score", v)} center numeric max={SCORE_LIMITS.fdpRow} /></td>
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
                          <td style={TDS}><TI val={r.score} onChange={(v) => setTrain(i, "score", v)} center numeric max={SCORE_LIMITS.fdpRow} /></td>
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
                      ["Part A - Teaching & Activities", partATotal, effectivePartAMax, "#6366f1"],
                      ["Part B - Research & Contributions", partBTotal, effectivePartBMax, "#7c3aed"],
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

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 10, color: "#334155", fontSize: 12, lineHeight: 1.5, cursor: appraisalLocked ? "not-allowed" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={accuracyConfirmed}
                    onChange={(e) => setAccuracyConfirmed(e.target.checked)}
                    disabled={submitting || appraisalLocked}
                    style={{ marginTop: 3 }}
                  />
                  <span>I have verified all the details and confirm that the information provided is correct. I am responsible for the accuracy of this data.</span>
                </label>

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, marginBottom: 14, color: "#334155", fontSize: 12, lineHeight: 1.5, cursor: appraisalLocked ? "not-allowed" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={attachmentsConfirmed}
                    onChange={(e) => setAttachmentsConfirmed(e.target.checked)}
                    disabled={submitting || appraisalLocked}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    I confirm that <strong>all required supporting documents and attachments have been uploaded</strong> against the respective entries.
                    I understand that any <strong>missing or false attachment is my sole responsibility</strong> and may result in the rejection or revision of my appraisal.
                  </span>
                </label>

                <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                  <button
                    onClick={generateReport}
                    style={{ padding: "10px 28px", background: "#4c1d95", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}
                  >
                    Generate Report
                  </button>
                  <button
                    onClick={handleSubmitAppraisal}
                    disabled={submitting || appraisalLocked || !accuracyConfirmed || !attachmentsConfirmed}
                    style={{ padding: "10px 28px", background: (appraisalLocked || !accuracyConfirmed || !attachmentsConfirmed) ? "#64748b" : "#059669", color: "#fff", border: "none", borderRadius: 7, cursor: (appraisalLocked || !accuracyConfirmed || !attachmentsConfirmed) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}
                  >
                    {appraisalLocked ? "Submitted & Locked" : submitting ? "Submitting..." : "Submit Appraisal"}
                  </button>
                </div>
              </SC>
            )}
          </div>
            </div>
          </div>
        )}

        {activeMainTab === "guidelines" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "inherit", width: "100%" }}>
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
                      (a) Attended FDP of one week duration or more (Max 10 marks): 5/FDP<br/>
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
                    <th style={TH}>SoEMR, SCoE, SCM, SoCSEA, SoBB (Max Score)</th>
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

      {/* -- Logout Confirmation Modal -- */}
      {showLogoutModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowLogoutModal(false)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "32px 36px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, fontFamily: "inherit" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>!</div>
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
    fontFamily: "inherit"
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
    fontFamily: "inherit"
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


