import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchReviewQueueForRole, submitWorkflowReview } from "../services/reviewWorkflow";
import { fetchNonTeachingQueueForRole, expectedPendingStatus, isNonTeachingReviewComplete } from "../services/nonTeachingWorkflow";
import { SOCIETY_LABELS, ACR_LABELS, MAX_SCORES, APP_INFO } from "../constants/formConfig";
import { VC_USER } from "../data/mockData";
import { DEAN_TRACKS, UNIVERSITY_SCHOOLS } from "../constants/universityHierarchy";
import { FORM_TYPES, formTypeForSchool } from "../constants/formRouting";
import { getReviewChain, getSchoolKey, reviewedStatusFor, profileFromsessionStorage } from "../utils/hierarchy";
import { openFullFormReport } from "../utils/fullFormReport";
import { MediaCommAuthorityReviewPanel } from "./MediaCommDashboard";
import { DesignArtsAuthorityReviewPanel } from "./DesignArtsDashboard";
import { NonTeachingAuthorityReviewPanel } from "./NonTeachingStaffDashboard";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0;
const pct = (v, m) => Math.min(100, Math.round((v / m) * 100)) || 0;
const isVcReviewed = (person = {}) => person.status === "Reviewed" || person.status === "VC Reviewed" || person.status === "Rejected" || person.status === "VC Rejected" || n(person.vcTotal) > 0;
const grade = (score, max) => {
  const p = (score / max) * 100;
  if (p >= 85) return { label: "Outstanding", color: "#059669", bg: "#d1fae5" };
  if (p >= 70) return { label: "Very Good",   color: "#0284c7", bg: "#dbeafe" };
  if (p >= 55) return { label: "Good",         color: "#7c3aed", bg: "#ede9fe" };
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
    "Pending Review":      { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    "HOD Reviewed":        { bg: "#ede9fe", color: "#5b21b6", dot: "#7c3aed" },
    "Director Reviewed":   { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
    "Director Approved":   { bg: "#cffafe", color: "#164e63", dot: "#06b6d4" },
    "Pending Dean Review": { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    "Dean Reviewed":       { bg: "#d1fae5", color: "#065f46", dot: "#10b981" },
    "VC Reviewed":         { bg: "#fdf4ff", color: "#6b21a8", dot: "#a855f7" },
    "Reviewed":            { bg: "#fdf4ff", color: "#6b21a8", dot: "#a855f7" },
    "Rejected":            { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
    "VC Rejected":         { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
    "Pending VC Review":   { bg: "#ede9fe", color: "#5b21b6", dot: "#7c3aed" },
  };
  const s = map[status] || map["Pending Review"];
  const label = status === "Reviewed" ? "VC Reviewed" : status === "Pending Review" ? "Pending VC Review" : status;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />{label}
    </span>
  );
}
function RoleBadge({ role }) {
  const map = {
    Director: { bg: "#0c4a6e", color: "#7dd3fc", icon: "🏛️" },
    HOD:      { bg: "#312e81", color: "#c7d2fe", icon: "👥" },
    Faculty:  { bg: "#14532d", color: "#86efac", icon: "📋" },
    Dean:     { bg: "#4c1d95", color: "#ddd6fe", icon: "🎓" },
  };
  const s = map[role] || map.Faculty;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.bg, color: s.color, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
      {s.icon} {role}
    </span>
  );
}
function RO({ val, center }) {
  return <span style={{ fontSize: 11, fontFamily: "Georgia, serif", color: "#1e293b", display: "block", textAlign: center ? "center" : "left" }}>{val || <span style={{ color: "#cbd5e1" }}>—</span>}</span>;
}
function VCInput({ val, onChange }) {
  return (
    <input type="number" min="0" step="0.5" value={val ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{ width: 58, textAlign: "center", border: "1.5px solid #7c3aed", borderRadius: 5, padding: "3px 5px", fontSize: 11, fontFamily: "Georgia, serif", outline: "none", background: "#fdf4ff" }}
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

// ─── Table style constants ─────────────────────────────────────────────────────
const T     = { width: "100%", borderCollapse: "collapse", fontSize: 11 };
const TH      = { border: "1px solid #cbd5e1", padding: "5px 7px", background: "#0f172a",  color: "#94a3b8",  fontWeight: 700, textAlign: "center", fontSize: 10 };
const TH_HOD  = { ...TH, background: "#312e81", color: "#c7d2fe" };
const TH_DIR  = { ...TH, background: "#0c4a6e", color: "#bae6fd" };
const TH_DEAN = { ...TH, background: "#065f46", color: "#bbf7d0" };
const TH_VC   = { ...TH, background: "#4c1d95", color: "#e9d5ff" };
const TD  = { border: "1px solid #e2e8f0", padding: "5px 7px", verticalAlign: "middle" };
const TDC = { ...TD, textAlign: "center" };
const TDS     = { ...TD, textAlign: "center", background: "#f8fafc", minWidth: 58 };
const TDS_HOD  = { ...TDS, background: "#f0f4ff" };
const TDS_DIR  = { ...TDS, background: "#f0fbff" };
const TDS_DEAN = { ...TDS, background: "#f0fdf4" };
const TDS_VC   = { ...TDS, background: "#fdf4ff", minWidth: 70 };
const TDV = { ...TD, background: "#fafbff", minWidth: 110 };

const VC_CHAIN_ROLE_META = {
  hod: {
    label: "HOD Score",
    shortLabel: "HOD",
    field: "hod",
    headerStyle: TH_HOD,
    cellStyle: TDS_HOD,
    color: "#818cf8",
    remarksKey: "hodRemarks",
    remarksTitle: "HOD Remarks",
    remarksBg: "#f0f4ff",
    remarksBorder: "#c7d2fe",
    remarksColor: "#4338ca",
  },
  center_head: {
    label: "Center Head Score",
    shortLabel: "Center Head",
    field: "hod",
    headerStyle: TH_HOD,
    cellStyle: TDS_HOD,
    color: "#0f766e",
    remarksKey: "hodRemarks",
    remarksTitle: "Center Head Remarks",
    remarksBg: "#ecfdf5",
    remarksBorder: "#99f6e4",
    remarksColor: "#0f766e",
  },
  director: {
    label: "Director Score",
    shortLabel: "Director",
    field: "director",
    headerStyle: TH_DIR,
    cellStyle: TDS_DIR,
    color: "#38bdf8",
    remarksKey: "directorRemarks",
    remarksTitle: "Director Remarks",
    remarksBg: "#f0f9ff",
    remarksBorder: "#bae6fd",
    remarksColor: "#0369a1",
  },
  dean: {
    label: "Dean Score",
    shortLabel: "Dean",
    field: "dean",
    headerStyle: TH_DEAN,
    cellStyle: TDS_DEAN,
    color: "#34d399",
    remarksKey: "deanRemarks",
    remarksTitle: "Dean Remarks",
    remarksBg: "#f0fdf4",
    remarksBorder: "#bbf7d0",
    remarksColor: "#065f46",
  },
};

const vcChainProfileFor = (person = {}, personMode = "faculty") => ({
  school: person.school || person.info?.school || "",
  department: person.department || "",
  appraisal_role: person.appraisalRole || personMode,
});

const vcPreviousRolesFor = (person = {}, personMode = "faculty") =>
  getReviewChain(vcChainProfileFor(person, personMode)).filter((role) => role !== "vc");

const vcRoleMeta = (role) => VC_CHAIN_ROLE_META[role] || {
  label: `${role} Score`,
  shortLabel: role,
  field: role,
  headerStyle: TH,
  cellStyle: TDS,
  color: "#64748b",
};

const vcScoreForRole = (row = {}, role) => row?.[vcRoleMeta(role).field];
const vcInnovScoreForRole = (person = {}, role) => {
  if (role === "hod" || role === "center_head") return person.innovHod;
  if (role === "director") return person.innovDirector ?? person.innovDir;
  if (role === "dean") return person.innovDean;
  return "";
};
const vcTotalForRole = (person = {}, role) => {
  if (role === "hod" || role === "center_head") return n(person.hodTotal ?? person.hodScore);
  if (role === "director") return n(person.directorTotal ?? person.directorScore);
  if (role === "dean") return n(person.deanTotal ?? person.deanSelfScore);
  return 0;
};
const vcSelfTotalForPerson = (person = {}) =>
  n(person.declaration?.grand_total ?? person.grandTotal ?? person.totalScore ?? person.total ?? person.selfTotal);

const VC_REVIEW_ARRAY_KEYS = ["lectures", "courseFile", "projects", "quals", "feedback", "deptActs", "uniActs", "society", "industry", "acr", "journals", "books", "ict", "research", "projects2", "externalProjects", "patents", "awards", "confs", "proposals", "products", "fdps", "training"];
const VC_REPORT_PART_A_SECTIONS = [
  { key: "lectures", title: "A(i). Lectures / Tutorials / Practicals", max: 50, doc: "lec", fields: [["sem", "Semester"], ["code", "Course Code / Name"], ["planned", "Classes (as per course structure)"], ["conducted", "Classes Actually Conducted"]] },
  { key: "courseFile", title: "A(ii). Course File", max: 20, doc: "cf", fields: [["course", "Course / Paper"], ["title", "Title"], ["details", "Details"]] },
  { key: "projects", title: "A(iv). Project Guidance", max: 10, doc: "proj", fields: [["label", "Project Category"]] },
  { key: "quals", title: "A(v). Qualification Enhancement", max: 10, doc: "qual", fields: [["label", "Category"]] },
  { key: "feedback", title: "Student Feedback", max: 10, doc: "fb", fields: [["code", "Course Code / Name"], ["fb1", "First Feedback"], ["fb2", "Second Feedback"]] },
  { key: "deptActs", title: "Departmental / School Activities", max: 20, doc: "dept", fields: [["activity", "Activity"], ["nature", "Nature"]] },
  { key: "uniActs", title: "University Level Activities", max: 30, doc: "uni", fields: [["activity", "Activity"], ["nature", "Nature"]] },
  { key: "society", title: "Contribution to Society", max: 10, doc: "soc", fields: [["label", "Activity"], ["details", "Details"]] },
  { key: "industry", title: "Industry Connect", max: 5, doc: "ind", fields: [["name", "Industry"], ["details", "Details"]] },
  { key: "acr", title: "Annual Confidential Report - School Level", max: 25, doc: "acr", fields: [["label", "Parameter"]] },
];
const VC_REPORT_PART_B_SECTIONS = [
  { key: "journals", title: "B1. Research Papers / Journal Publications", max: 120, doc: "jour", fields: [["title", "Title"], ["journal", "Journal"], ["issn", "ISSN"], ["index", "Indexing"]] },
  { key: "books", title: "B2. Books / Book Chapters", max: 50, doc: "book", fields: [["title", "Title with Page Nos."], ["book", "Book Title, Editor & Publisher"], ["issn", "ISSN / ISBN No."], ["pub", "Type of Publisher"], ["coauth", "Co-authors (from DYPIU)"], ["first", "First Author"]] },
  { key: "ict", title: "B3. ICT / E-Content", max: 20, doc: "ict", fields: [["title", "Title"], ["desc", "Description"], ["type", "Type"], ["quad", "Quadrants"]] },
  { key: "research", title: "B4(a). Research Guidance", max: 30, doc: "res", fields: [["degree", "Degree"], ["name", "Student Name"], ["thesis", "Thesis / Status"]] },
  { key: "projects2", title: "B4(b). Research / Consultancy Internal Projects", max: 45, doc: "project2", fields: [["title", "Title"], ["agency", "Funding Agency"], ["date", "Date of Sanction"], ["amount", "Grant Amount"], ["role", "Role PI / Co-PI / Consultant"], ["status", "Status"]] },
  { key: "externalProjects", title: "B4(c). Research / Consultancy External Projects", max: 45, doc: "externalProject", fields: [["title", "Title"], ["agency", "Funding Agency"], ["date", "Date of Sanction"], ["amount", "Grant Amount"], ["role", "Role PI / Co-PI / Consultant"], ["status", "Status"]] },
  { key: "patents", title: "B5(a). Patents (IPR)", max: 40, doc: "pat", fields: [["title", "Title"], ["type", "National / International"], ["date", "Date"], ["status", "Status"], ["fileNo", "File No."]] },
  { key: "awards", title: "B5(b). Awards", max: 10, doc: "awd", fields: [["title", "Title"], ["date", "Date"], ["agency", "Agency"], ["level", "Level"]] },
  { key: "confs", title: "B6. Invited Lectures / Resource Person / Paper Presentations", max: 30, doc: "conf", fields: [["title", "Title"], ["type", "Type"], ["org", "Organization"], ["level", "Level"]] },
  { key: "proposals", title: "B7(a). Submitted Research Proposals", max: 10, doc: "prop", fields: [["title", "Title"], ["duration", "Duration"], ["agency", "Funding Agency"], ["amount", "Grant Amount Requested"]] },
  { key: "products", title: "B7(b). Product Developed and Used by Students in Lab / Commercialized", max: 10, doc: "prod", fields: [["details", "Details of Product"], ["usage", "Used by Students in Lab / Commercialized"]] },
  { key: "fdps", title: "B8(a). FDP / Self Development", max: 10, doc: "fdp", fields: [["program", "Program"], ["duration", "Duration"], ["org", "Organization"]] },
  { key: "training", title: "B8(b). Industrial Training", max: 10, doc: "train", fields: [["company", "Company"], ["duration", "Duration"], ["nature", "Nature"]] },
];

const buildVcSectionScores = (person, vcData) => {
  const payload = {};
  VC_REVIEW_ARRAY_KEYS.forEach((key) => {
    const rows = Array.isArray(person[key]) ? person[key] : [];
    payload[key] = rows.map((row, index) => ({
      ...row,
      vc: vcData[key]?.[index]?.vc ?? row.vc ?? "",
    }));
  });
  payload.innovativeTeaching = {
    vc: vcData.innovVc ?? vcData.innovVC ?? person.innovVc ?? "",
  };
  return payload;
};


// ─── VC Review Form ───────────────────────────────────────────────────────────
// personMode: "dean" | "director" | "hod" | "faculty"
function VCReviewForm({ person, vcData, setVcData, personMode = "director" }) {
  const reviewRoles = vcPreviousRolesFor(person, personMode);
  const selfScoreLabel = personMode === "faculty" ? "Faculty Score" : "Self Score";

  const set = (section, idx, field, val) => {
    setVcData(prev => {
      const updated = { ...prev };
      if (!updated[section]) updated[section] = JSON.parse(JSON.stringify(person[section] || []));
      if (idx === null) {
        updated[section] = Array.isArray(updated[section])
          ? (updated[section].length ? updated[section].map((r, i) => i === 0 ? { ...r, [field]: val } : r) : [{ [field]: val }])
          : { ...updated[section], [field]: val };
      } else updated[section] = updated[section].map((r, i) => i === idx ? { ...r, [field]: val } : r);
      return updated;
    });
  };
  const setScalar = (key, val) => setVcData(prev => ({ ...prev, [key]: val }));
  const get = (section, idx, field) => {
    if (vcData[section]) {
      const s = vcData[section];
      return idx === null
        ? (Array.isArray(s) ? (s[0]?.[field] ?? "") : (s[field] ?? ""))
        : (s[idx]?.[field] ?? person[section]?.[idx]?.[field] ?? "");
    }
    if (idx === null) {
      const source = person[section];
      return Array.isArray(source) ? (source[0]?.[field] ?? "") : (source?.[field] ?? "");
    }
    return person[section]?.[idx]?.[field] ?? "";
  };
  const getS = (key) => vcData[key] ?? person[key] ?? "";
  const { docs } = person;
  const courseFileRow = Array.isArray(person.courseFile) ? (person.courseFile[0] || {}) : (person.courseFile || {});
  const rows = (arr) => arr && arr.length > 0 ? arr : [{}];

  const ScoreHeaders = () => (
    <>
      <th style={TH}>{selfScoreLabel}</th>
      {reviewRoles.map((role) => {
        const meta = vcRoleMeta(role);
        return <th key={role} style={meta.headerStyle}>{meta.label}</th>;
      })}
      <th style={TH_VC}>VC Score</th>
    </>
  );

  const ScoreCells = ({ r, section, i }) => (
    <>
      <td style={TDS}><RO val={r?.score} center /></td>
      {reviewRoles.map((role) => {
        const meta = vcRoleMeta(role);
        return <td key={role} style={meta.cellStyle}><RO val={vcScoreForRole(r, role)} center /></td>;
      })}
      <td style={TDS_VC}><VCInput val={get(section, i, "vc")} onChange={v => set(section, i, "vc", v)} /></td>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Mode banner */}
      <div style={{ background: "linear-gradient(90deg,#2e1065,#6d28d9)", color: "#ede9fe", borderRadius: 8, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
        <span style={{ fontSize: 18 }}>🎓</span>
        <div>
          <strong>Vice Chancellor Review Mode</strong> — Only the <span style={{ color: "#d8b4fe", fontWeight: 700 }}>VC Score</span> column is editable.
          {" "}All previous scores are shown read-only for reference.
        </div>
      </div>

      {/* Personal Info */}
      <SC title="Personal Information" accent="#7c3aed">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {Object.entries(person.info).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "6px 10px", background: "#f8fafc", fontWeight: 600, border: "1px solid #e2e8f0", width: "35%", textTransform: "capitalize" }}>{k}</td>
                <td style={{ padding: "5px 10px", border: "1px solid #e2e8f0", color: "#334155" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SC>

      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#dbeafe", padding: "8px 14px", borderRadius: 6, marginBottom: 10 }}>PART A — Teaching &amp; Academic Activities</div>

      {/* A1 Lectures */}
      <SC title="A1. Lectures / Tutorials / Practicals (Max 50)" accent="#7c3aed">
        <div style={{ overflowX: "auto" }}>
          <table style={T}><thead><tr>
            <th style={TH}>SN</th><th style={TH}>Semester</th><th style={TH}>Course</th>
            <th style={TH}>Classes (as per course structure)</th><th style={TH}>Classes Actually Conducted</th><th style={TH}>Docs</th>
            <ScoreHeaders />
          </tr></thead>
          <tbody>{rows(person.lectures).map((r, i) => (
            <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
              <td style={TDC}>{i + 1}</td><td style={TD}><RO val={r.sem} /></td><td style={TD}><RO val={r.code} /></td>
              <td style={TDC}><RO val={r.planned} center /></td><td style={TDC}><RO val={r.conducted} center /></td>
              <td style={TDV}><ViewDocsCell docKey={`lec-${i}`} docs={docs} /></td>
              <ScoreCells r={r} section="lectures" i={i} />
            </tr>
          ))}</tbody></table>
        </div>
      </SC>

      {/* A2 Course File */}
      <SC title="A2. Course File (Max 20)" accent="#7c3aed">
        <table style={T}><thead><tr>
          <th style={TH}>Course</th><th style={TH}>Title</th><th style={TH}>Details</th><th style={TH}>Docs</th>
          <ScoreHeaders />
        </tr></thead>
        <tbody><tr>
          <td style={TD}><RO val={courseFileRow.course} /></td>
          <td style={TD}><RO val={courseFileRow.title} /></td>
          <td style={TDC}><RO val={courseFileRow.details} center /></td>
          <td style={TDV}><ViewDocsCell docKey="cf-0" docs={docs} /></td>
          <ScoreCells r={courseFileRow} section="courseFile" i={null} />
        </tr></tbody></table>
      </SC>

      {/* A3 Innovative */}
      <SC title="A3. Innovative Teaching-Learning (Max 10)" accent="#7c3aed">
        <table style={T}><thead><tr>
          <th style={TH}>Method</th>
          <ScoreHeaders />
        </tr></thead>
        <tbody><tr>
          <td style={TD}>Innovative / participatory teaching methods used</td>
          <td style={TDS}><RO val={person.innovScore} center /></td>
          {reviewRoles.map((role) => {
            const meta = vcRoleMeta(role);
            return <td key={role} style={meta.cellStyle}><RO val={vcInnovScoreForRole(person, role)} center /></td>;
          })}
          <td style={TDS_VC}><VCInput val={getS("innovVc") || getS("innovVC")} onChange={v => setScalar("innovVc", v)} /></td>
        </tr></tbody></table>
      </SC>

      {/* A4–A5 Projects & Quals */}
      {[
        ["A4. Projects (Max 10)", "projects", "proj"],
        ["A5. Qualification Enhancement (Max 10)", "quals", "qual"],
      ].map(([title, key, docPfx]) => (
        <SC key={key} title={title} accent="#7c3aed">
          <table style={T}><thead><tr>
            <th style={TH}>SN</th><th style={TH}>Description</th><th style={TH}>Docs</th>
            <ScoreHeaders />
          </tr></thead>
          <tbody>{rows(person[key]).map((r, i) => (
            <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
              <td style={TDC}>{i + 1}</td>
              <td style={TD}><RO val={r.label} /></td>
              <td style={TDV}><ViewDocsCell docKey={`${docPfx}-${i}`} docs={docs} /></td>
              <ScoreCells r={r} section={key} i={i} />
            </tr>
          ))}</tbody></table>
        </SC>
      ))}

      {/* B Feedback */}
      <SC title="B. Student Feedback (Max 10)" accent="#7c3aed">
        <table style={T}><thead><tr>
          <th style={TH}>SN</th><th style={TH}>Course</th><th style={TH}>First Feedback</th><th style={TH}>Second Feedback</th><th style={TH}>Average</th>
          <ScoreHeaders />
        </tr></thead>
        <tbody>{rows(person.feedback).map((r, i) => (
          <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
            <td style={TDC}>{i + 1}</td><td style={TD}><RO val={r.code} /></td>
            <td style={TDC}><RO val={r.fb1} center /></td><td style={TDC}><RO val={r.fb2} center /></td>
            <td style={{ ...TDC, fontWeight: 700, color: "#0ea5e9" }}>{r.fb1 && r.fb2 ? ((n(r.fb1) + n(r.fb2)) / 2).toFixed(2) : "—"}</td>
            <ScoreCells r={r} section="feedback" i={i} />
          </tr>
        ))}</tbody></table>
      </SC>

      {/* C–F Activities */}
      {[
        ["C. Departmental Activities (Max 20)", "deptActs", "#f59e0b", ["Activity", "Nature"], ["activity", "nature"], "dept"],
        ["D. University Activities (Max 30)", "uniActs", "#f59e0b", ["Activity", "Nature"], ["activity", "nature"], "uni"],
        ["E. Contribution to Society (Max 10)", "society", "#10b981", ["Activity", "Details"], ["label", "details"], "soc"],
        ["F. Industry Connect (Max 5)", "industry", "#10b981", ["Industry", "Details"], ["name", "details"], "ind"],
      ].map(([title, key, accent2, cols, fields, docPfx]) => (
        <SC key={key} title={title} accent={accent2}>
          <table style={T}><thead><tr>
            <th style={TH}>SN</th>
            {cols.map(c => <th key={c} style={TH}>{c}</th>)}
            <th style={TH}>Docs</th>
            <ScoreHeaders />
          </tr></thead>
          <tbody>{rows(person[key]).map((r, i) => (
            <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
              <td style={TDC}>{i + 1}</td>
              {fields.map(f => <td key={f} style={TD}><RO val={r[f]} /></td>)}
              <td style={TDV}><ViewDocsCell docKey={`${docPfx}-${i}`} docs={docs} /></td>
              <ScoreCells r={r} section={key} i={i} />
            </tr>
          ))}</tbody></table>
        </SC>
      ))}

      {/* G ACR */}
      <SC title="G. Annual Confidential Report (Max 25)" accent="#ef4444">
        <table style={T}><thead><tr>
          <th style={TH}>SN</th><th style={TH}>Parameter</th>
          <ScoreHeaders />
        </tr></thead>
        <tbody>{rows(person.acr).map((r, i) => (
          <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
            <td style={TDC}>{i + 1}</td>
            <td style={TD}><RO val={r.label} /></td>
            <ScoreCells r={r} section="acr" i={i} />
          </tr>
        ))}</tbody></table>
      </SC>

      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b", background: "#ede9fe", padding: "8px 14px", borderRadius: 6, marginBottom: 10 }}>PART B — Research &amp; Academic Contributions</div>

      {/* B1 Journals */}
      <SC title="B1. Research Papers / Journal Publications (Max 120)" accent="#7c3aed">
        <div style={{ overflowX: "auto" }}><table style={T}><thead><tr>
          <th style={TH}>SN</th><th style={TH}>Title</th><th style={TH}>Journal</th>
          <th style={TH}>ISSN</th><th style={TH}>Index</th><th style={TH}>Docs</th>
          <ScoreHeaders />
        </tr></thead>
        <tbody>{rows(person.journals).map((r, i) => (
          <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
            <td style={TDC}>{i + 1}</td><td style={TD}><RO val={r.title} /></td><td style={TD}><RO val={r.journal} /></td>
            <td style={TDC}><RO val={r.issn} center /></td><td style={TDC}><RO val={r.index} center /></td>
            <td style={TDV}><ViewDocsCell docKey={`jour-${i}`} docs={docs} /></td>
            <ScoreCells r={r} section="journals" i={i} />
          </tr>
        ))}</tbody></table></div>
      </SC>

      {/* B2–B8 */}
      {[
        { title: "B2. Books / Book Chapters (Max 50)", key: "books", docPfx: "book",
          render: (r) => [r.title, r.book, r.issn, r.pub, r.coauth, r.first] },
        { title: "B3. ICT / E-Content (Max 20)", key: "ict", docPfx: "ict",
          render: (r) => [r.title, r.type, r.quad] },
        { title: "B4(a). Research Guidance (Max 30)", key: "research", docPfx: "res",
          render: (r) => [r.degree, r.name, r.thesis] },
        { title: "B4(b). Research / Consultancy Internal Projects (Max 45)", key: "projects2", docPfx: "project2",
          render: (r) => [r.title, r.agency, r.date, r.amount, r.role, r.status] },
        { title: "B4(c). Research / Consultancy External Projects (Max 45)", key: "externalProjects", docPfx: "externalProject",
          render: (r) => [r.title, r.agency, r.date, r.amount, r.role, r.status] },
        { title: "B5(a). Patents (IPR) (Max 40)", key: "patents", docPfx: "pat",
          render: (r) => [r.title, r.type, r.date, r.status, r.fileNo] },
        { title: "B5(b). Awards (Max 10)", key: "awards", docPfx: "awd",
          render: (r) => [r.title, r.date, r.agency, r.level] },
        { title: "B6. Invited Lectures / Resource Person / Paper Presentations (Max 30)", key: "confs", docPfx: "conf",
          render: (r) => [r.title, r.type, r.org, r.level] },
        { title: "B7(a). Submitted Research Proposals (Max 10)", key: "proposals", docPfx: "prop",
          render: (r) => [r.title, r.duration, r.agency, r.amount] },
        { title: "B7(b). Product Developed and Used by Students in Lab / Commercialized (Max 10)", key: "products", docPfx: "prod",
          render: (r) => [r.details, r.usage] },
        { title: "B8(a). FDP / Workshops Attended (Max 5)", key: "fdps", docPfx: "fdp",
          render: (r) => [r.program, r.duration, r.org] },
        { title: "B8(b). Industrial Training (Max 5)", key: "training", docPfx: "train",
          render: (r) => [r.company, r.duration, r.nature] },
      ].map(({ title, key, docPfx, render }) => (
        <SC key={key} title={title} accent="#7c3aed">
          <div style={{ overflowX: "auto" }}><table style={T}><thead>
            <tr>
              <th style={TH}>SN</th><th style={TH}>Details</th><th style={TH}>Docs</th>
              <ScoreHeaders />
            </tr>
          </thead>
          <tbody>{rows(person[key]).map((r, i) => {
            const cells = render(r);
            return (
              <tr key={i} style={i % 2 ? { background: "#f8fafc" } : {}}>
                <td style={TDC}>{i + 1}</td>
                <td style={TD}>
                  {cells.filter(Boolean).map((c, ci) => (
                    <span key={ci} style={{ display: "inline-block", marginRight: 8, color: "#334155" }}>{c}</span>
                  ))}
                </td>
                <td style={TDV}><ViewDocsCell docKey={`${docPfx}-${i}`} docs={docs} /></td>
                <ScoreCells r={r} section={key} i={i} />
              </tr>
            );
          })}</tbody></table></div>
        </SC>
      ))}
    </div>
  );
}


// ─── Score Calculator ─────────────────────────────────────────────────────────
function calcVCScore(person, vcData) {
  const get = (section, idx, field) => {
    if (vcData[section]) {
      const s = vcData[section];
      return idx === null ? n(Array.isArray(s) ? s[0]?.[field] : s[field]) : n(s[idx]?.[field]);
    }
    const source = person[section];
    return idx === null ? n(Array.isArray(source) ? source[0]?.[field] : source?.[field]) : n(source?.[idx]?.[field]);
  };
  const getS = (key) => n(vcData[key] ?? person[key]);
  const sum = (arr, s, f) => (arr || []).reduce((a, _, i) => a + get(s, i, f), 0);

  const partA = sum(person.lectures, "lectures", "vc") + get("courseFile", null, "vc") +
    n(vcData.innovVc ?? vcData.innovVC ?? person.innovVc) + sum(person.projects, "projects", "vc") +
    sum(person.quals, "quals", "vc") + sum(person.feedback, "feedback", "vc") +
    sum(person.deptActs, "deptActs", "vc") + sum(person.uniActs, "uniActs", "vc") +
    sum(person.society, "society", "vc") + sum(person.industry, "industry", "vc") +
    sum(person.acr, "acr", "vc");

  const partB = sum(person.journals, "journals", "vc") + sum(person.books, "books", "vc") +
    sum(person.ict, "ict", "vc") + sum(person.research, "research", "vc") +
    sum(person.projects2, "projects2", "vc") + sum(person.externalProjects, "externalProjects", "vc") + sum(person.patents, "patents", "vc") + sum(person.awards, "awards", "vc") +
    sum(person.confs, "confs", "vc") + sum(person.proposals, "proposals", "vc") + sum(person.products, "products", "vc") +
    sum(person.fdps, "fdps", "vc") + sum(person.training || [], "training", "vc");

  return { partA, partB, total: partA + partB };
}

// ─── VC Review Panel ──────────────────────────────────────────────────────────
function VCReviewPanel({ person, personMode, onBack, onSubmit, readOnly = false }) {
  const [vcData, setVcData] = useState({});
  const [remarks, setRemarks] = useState(person.vcRemarks || "");
  const [tab, setTab] = useState("form");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const reviewLocked = readOnly || isVcReviewed(person);

  const { partA, partB, total } = calcVCScore(person, vcData);
  const g = grade(total, MAX_SCORES.GRAND_TOTAL);
  const previousRoles = vcPreviousRolesFor(person, personMode);
  const selfPartA = n(person.declaration?.part_a_total ?? person.selfPartA ?? person.partATotal);
  const selfPartB = n(person.declaration?.part_b_total ?? person.selfPartB ?? person.partBTotal);
  const selfTotal = vcSelfTotalForPerson(person);
  const vcReviewCompleted = person.status === "Reviewed" || person.status === "VC Reviewed" || n(person.vcTotal) > 0;

  const generateVcReport = () => {
    if (!vcReviewCompleted) return;
    const reportForm = {
      ...person,
      info: {
        ...(person.info || {}),
        name: person.info?.name || person.name,
        ay: person.info?.ay || person.academicYear || VC_USER.ay,
        desig: person.info?.desig || person.designation || personMode,
        school: person.info?.school || person.schoolName || person.school,
      },
      docs: person.docs || {},
    };
    VC_REVIEW_ARRAY_KEYS.forEach((key) => {
      const rows = Array.isArray(person[key]) ? person[key] : (person[key] ? [person[key]] : []);
      reportForm[key] = rows.map((row, index) => ({
        ...row,
        vc: vcData[key]?.[index]?.vc ?? row.vc ?? "",
      }));
    });
    reportForm.innovVc = vcData.innovVc ?? vcData.innovVC ?? person.innovVc ?? "";
    openFullFormReport({
      title: "VC Appraisal Report",
      subtitle: `${APP_INFO.UNIVERSITY_NAME} | Academic Year ${person.academicYear || person.info?.ay || VC_USER.ay || ""}`,
      form: reportForm,
      docs: reportForm.docs,
      partASections: VC_REPORT_PART_A_SECTIONS,
      partBSections: VC_REPORT_PART_B_SECTIONS,
      totals: {
        partA: n(person.vcPartA ?? partA),
        partB: n(person.vcPartB ?? partB),
        total: n(person.vcTotal ?? total),
      },
      maxScores: { partA: 200, partB: 420, grand: MAX_SCORES.GRAND_TOTAL },
      scoreRoles: ["score", ...previousRoles, "vc"],
      roleLabel: (value) => value === "vc" ? "VC" : vcRoleMeta(value).shortLabel || value,
      status: person.status,
      remarksLabel: "VC Remarks",
      remarks: person.vcRemarks || remarks,
      generatedBy: sessionStorage.getItem("name") || "Vice Chancellor",
    });
  };

  const scoreCards = [
    { label: personMode === "faculty" ? "Faculty Score" : "Self Score", val: selfTotal, color: "#e2e8f0" },
    ...previousRoles
      .map((role) => {
        const meta = vcRoleMeta(role);
        return { label: meta.label, val: vcTotalForRole(person, role), color: meta.color };
      })
      .filter(({ val }) => val > 0),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, marginBottom: 16, borderRadius: 10 }}>
        <button onClick={onBack} style={{ background: "#1e293b", border: "none", color: "#94a3b8", cursor: "pointer", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "Georgia, serif" }}>← Back</button>
        <Avatar initials={person.avatar} color={person.avatarColor || "#7c3aed"} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>{person.name}</div>
          <div style={{ color: "#64748b", fontSize: 11 }}>{person.designation} · {person.employeeId}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {scoreCards.map(({ label, val, color }) => (
            <div key={label} style={{ background: "#1e293b", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
              <div style={{ color: "#94a3b8", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
              <div style={{ color, fontWeight: 800, fontSize: 14 }}>{val}</div>
            </div>
          ))}
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ color: "#94a3b8", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>VC Part A</div>
            <div style={{ color: "#c4b5fd", fontWeight: 800, fontSize: 14 }}>{partA.toFixed(1)}</div>
          </div>
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ color: "#94a3b8", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6 }}>VC Part B</div>
            <div style={{ color: "#a78bfa", fontWeight: 800, fontSize: 14 }}>{partB.toFixed(1)}</div>
          </div>
          <div style={{ background: g.bg, border: `2px solid ${g.color}40`, borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
            <div style={{ color: g.color, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>VC Total</div>
            <div style={{ color: g.color, fontWeight: 800, fontSize: 14 }}>{total.toFixed(1)}<span style={{ fontSize: 10, color: "#94a3b8" }}>/{MAX_SCORES.GRAND_TOTAL}</span></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["form", "📋 Review Form"], ["remarks", "✏️ Remarks & Submit"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: "7px 18px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700, background: tab === id ? "#4c1d95" : "#e2e8f0", color: tab === id ? "#ddd6fe" : "#475569" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "form" && (
        <fieldset disabled={reviewLocked} style={{ border: "none", padding: 0, margin: 0 }}>
          <VCReviewForm person={person} vcData={vcData} setVcData={setVcData} personMode={personMode} />
        </fieldset>
      )}

      {tab === "remarks" && (
        <div style={{ background: "#fff", borderRadius: 10, padding: "22px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin: "0 0 16px", color: "#0f172a", fontSize: 15 }}>{reviewLocked ? "VC Submitted Review" : "VC Remarks &amp; Final Submission"}</h3>

          {previousRoles.map((role) => {
            const meta = vcRoleMeta(role);
            const remark = person[meta.remarksKey];
            if (!remark) return null;
            return (
              <div key={role} style={{ background: meta.remarksBg, border: `1px solid ${meta.remarksBorder}`, borderRadius: 8, padding: "12px 14px", marginBottom: role === previousRoles[previousRoles.length - 1] ? 16 : 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: meta.remarksColor, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{meta.remarksTitle}</div>
                <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>{remark}</div>
              </div>
            );
          })}

          <SC title="Score Reconciliation" accent="#7c3aed">
            <table style={{ ...T, fontSize: 12 }}>
              <thead><tr>
                <th style={TH}>Section</th>
                <th style={TH}>{personMode === "faculty" ? "Faculty Score" : "Self Score"}</th>
                {previousRoles.map((role) => {
                  const meta = vcRoleMeta(role);
                  return <th key={role} style={meta.headerStyle}>{meta.label}</th>;
                })}
                <th style={TH_VC}>VC Final</th>
              </tr></thead>
              <tbody>
                <tr>
                  <td style={TD}>Part A — Teaching</td>
                  <td style={TDS}>{selfPartA || "-"}</td>
                  {previousRoles.map((role) => {
                    const meta = vcRoleMeta(role);
                    return <td key={role} style={meta.cellStyle}>-</td>;
                  })}
                  <td style={{ ...TDS_VC, fontWeight: 700 }}>{partA.toFixed(1)}</td>
                </tr>
                <tr>
                  <td style={TD}>Part B — Research</td>
                  <td style={TDS}>{selfPartB || "-"}</td>
                  {previousRoles.map((role) => {
                    const meta = vcRoleMeta(role);
                    return <td key={role} style={meta.cellStyle}>-</td>;
                  })}
                  <td style={{ ...TDS_VC, fontWeight: 700 }}>{partB.toFixed(1)}</td>
                </tr>
                <tr style={{ background: "#ede9fe", fontWeight: 800 }}>
                  <td style={TD}>GRAND TOTAL</td>
                  <td style={TDS}>{selfTotal || "-"}</td>
                  {previousRoles.map((role) => {
                    const meta = vcRoleMeta(role);
                    return <td key={role} style={meta.cellStyle}>{vcTotalForRole(person, role) || "-"}</td>;
                  })}
                  <td style={{ ...TDS_VC, fontSize: 15, color: "#4c1d95" }}>{total.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </SC>

          <label style={{ fontWeight: 700, fontSize: 13, color: "#334155", display: "block", marginBottom: 6 }}>VC Final Observations &amp; Decisions</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={5} readOnly={reviewLocked}
            placeholder="Final executive decision, appraisal score confirmation, and future recommendations..."
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", fontSize: 13, fontFamily: "Georgia, serif", resize: "vertical", boxSizing: "border-box", marginBottom: 18, background: reviewLocked ? "#f8fafc" : "#fff" }} />

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
            <button onClick={generateVcReport} disabled={!vcReviewCompleted}
              style={{ padding: "10px 24px", background: vcReviewCompleted ? "#e2e8f0" : "#f1f5f9", color: vcReviewCompleted ? "#475569" : "#94a3b8", border: "none", borderRadius: 7, cursor: vcReviewCompleted ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>
              Generate Report
            </button>
            {!reviewLocked && (
            <button onClick={() => onSubmit(person.id, { partA, partB, total }, remarks, personMode, buildVcSectionScores(person, vcData), reviewConfirmed)}
              disabled={!reviewConfirmed}
              style={{ padding: "10px 28px", background: reviewConfirmed ? "#4c1d95" : "#64748b", color: "#fff", border: "none", borderRadius: 7, cursor: reviewConfirmed ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>
              🎓 Confirm &amp; Sign Appraisal
            </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Person Card ──────────────────────────────────────────────────────────────
function PersonCard({ person, role, onReview, schoolColor }) {
  const personMode = role === "Director" ? "director" : role === "HOD" ? "hod" : role === "Dean" ? "dean" : role === "Center Head" ? "center_head" : "faculty";
  const previousRoles = vcPreviousRolesFor(person, personMode);
  const vcTotal = n(person.vcTotal);
  const dirTotal = person.directorTotal || person.directorScore || 0;
  const hodTotal = person.hodTotal || person.hodScore || 0;
  const deanTotal = person.deanTotal || 0;
  const scoreTiles = [
    {
      label: personMode === "faculty" ? "Faculty Score" : "Self Score",
      value: vcSelfTotalForPerson(person),
      color: "#0ea5e9",
    },
    ...previousRoles
      .map((reviewRole) => {
        const meta = vcRoleMeta(reviewRole);
        return { label: meta.shortLabel, value: vcTotalForRole(person, reviewRole), color: meta.color };
      })
      .filter((tile) => tile.value > 0),
    { label: "VC Score", value: vcTotal, color: "#7c3aed", isVc: true },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "15px 16px", boxShadow: "0 1px 5px rgba(0,0,0,.06)", display: "flex", flexDirection: "column", gap: 11, borderLeft: `3px solid ${schoolColor || "#7c3aed"}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar initials={person.avatar} color={person.avatarColor || "#7c3aed"} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{person.name}</span>
            <RoleBadge role={role} />
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginBottom: 1 }}>{person.designation}</div>
          <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace" }}>{person.employeeId}</div>
        </div>
        <StatusBadge status={person.status} />
      </div>

      {/* Score grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${1 + (hodTotal > 0 ? 1 : 0) + (deanTotal > 0 ? 1 : 0) + 1}, 1fr)`, gap: 8, background: "#f8fafc", borderRadius: 7, padding: "10px 12px" }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {role === "Director" ? "Self Score" : "Dir Score"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0ea5e9" }}>{dirTotal}<span style={{ fontSize: 9, color: "#94a3b8" }}>/{MAX_SCORES.GRAND_TOTAL}</span></div>
          <ScoreBar score={dirTotal} max={MAX_SCORES.GRAND_TOTAL} color="#0ea5e9" />
        </div>
        {hodTotal > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>HOD Score</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#6366f1" }}>{hodTotal}<span style={{ fontSize: 9, color: "#94a3b8" }}>/{MAX_SCORES.GRAND_TOTAL}</span></div>
            <ScoreBar score={hodTotal} max={MAX_SCORES.GRAND_TOTAL} color="#6366f1" />
          </div>
        )}
        {deanTotal > 0 && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>Dean Score</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#10b981" }}>{deanTotal}<span style={{ fontSize: 9, color: "#94a3b8" }}>/{MAX_SCORES.GRAND_TOTAL}</span></div>
            <ScoreBar score={deanTotal} max={MAX_SCORES.GRAND_TOTAL} color="#10b981" />
          </div>
        )}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>VC Score</div>
          {vcTotal > 0
            ? <><div style={{ fontSize: 14, fontWeight: 800, color: "#7c3aed" }}>{typeof vcTotal.toFixed === "function" ? vcTotal.toFixed(1) : vcTotal}<span style={{ fontSize: 9, color: "#94a3b8" }}>/{MAX_SCORES.GRAND_TOTAL}</span></div><ScoreBar score={vcTotal} max={MAX_SCORES.GRAND_TOTAL} color="#7c3aed" /></>
            : <div style={{ fontSize: 14, fontWeight: 800, color: "#7c3aed" }}>—</div>
          }
        </div>
      </div>

      {(person.hodRemarks || person.directorRemarks || person.deanRemarks) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {person.hodRemarks && (
            <div style={{ background: "#f0f4ff", borderRadius: 5, padding: "5px 8px", fontSize: 10, color: "#4338ca", borderLeft: "2px solid #818cf8" }}>
              <span style={{ fontWeight: 700 }}>HOD: </span>{person.hodRemarks.slice(0, 55)}{person.hodRemarks.length > 55 ? "…" : ""}
            </div>
          )}
          {person.directorRemarks && (
            <div style={{ background: "#f0f9ff", borderRadius: 5, padding: "5px 8px", fontSize: 10, color: "#0369a1", borderLeft: "2px solid #38bdf8" }}>
              <span style={{ fontWeight: 700 }}>Dir: </span>{person.directorRemarks.slice(0, 55)}{person.directorRemarks.length > 55 ? "…" : ""}
            </div>
          )}
          {person.deanRemarks && (
            <div style={{ background: "#f0fdf4", borderRadius: 5, padding: "5px 8px", fontSize: 10, color: "#065f46", borderLeft: "2px solid #34d399" }}>
              <span style={{ fontWeight: 700 }}>Dean: </span>{person.deanRemarks.slice(0, 55)}{person.deanRemarks.length > 55 ? "…" : ""}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
        <div style={{ fontSize: 9, color: "#94a3b8" }}>Submitted: {person.submittedOn}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onReview(person, personMode)}
            style={{ fontSize: 11, padding: "6px 14px", background: isVcReviewed(person) ? "#1e293b" : "#4c1d95", color: isVcReviewed(person) ? "#e2e8f0" : "#ede9fe", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontFamily: "Georgia, serif" }}>
            {isVcReviewed(person) ? "View Review" : "Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── School Panel ─────────────────────────────────────────────────────────────
function SchoolPanel({ school, deanList, dirList, hodList, centerHeadList = [], facList, onReview }) {
  const schoolDeans    = deanList.filter(d => d.schoolId === school.id);
  const schoolDirs     = dirList.filter(d => d.schoolId === school.id);
  const schoolHods     = hodList.filter(h => h.schoolId === school.id);
  const schoolCenterHeads = centerHeadList.filter(c => c.schoolId === school.id);
  const schoolFaculty  = facList.filter(f => f.schoolId === school.id);

  const allPeople = [
    ...schoolDeans.map(p => ({ person: p, role: "Dean" })),
    ...schoolDirs.map(p => ({ person: p, role: "Director" })),
    ...schoolHods.map(p => ({ person: p, role: "HOD" })),
    ...schoolCenterHeads.map(p => ({ person: p, role: "Center Head" })),
    ...schoolFaculty.map(p => ({ person: p, role: "Faculty" })),
  ];

  const pendingCount  = allPeople.filter(p => !isVcReviewed(p.person)).length;
  const reviewedCount = allPeople.filter(p => isVcReviewed(p.person)).length;

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)", borderTop: `4px solid ${school.color}`, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${school.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
          {school.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>{school.name}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{school.code} · {allPeople.length} member{allPeople.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {pendingCount > 0 && (
            <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>⏳ {pendingCount} Pending</div>
          )}
          {reviewedCount > 0 && (
            <div style={{ background: "#fdf4ff", color: "#6b21a8", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>🎓 {reviewedCount} VC Reviewed</div>
          )}
          {school.hasHods && (
            <div style={{ background: "#ede9fe", color: "#6d28d9", borderRadius: 8, padding: "6px 10px", fontSize: 10, fontWeight: 700 }}>Has HODs</div>
          )}
        </div>
      </div>

      {allPeople.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8", background: "#fff", borderRadius: 10 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontWeight: 600 }}>No submissions yet for this school</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {allPeople.map(({ person, role }) => (
            <PersonCard key={`${role}-${person.id}`} person={person} role={role} onReview={onReview} schoolColor={school.color} />
          ))}
        </div>
      )}
    </div>
  );
}


// ─── University Structure ─────────────────────────────────────────────────────
// ─── Main VC Dashboard ────────────────────────────────────────────────────────
function NonTeachingCard({ item, onReview }) {
  const reviewed = isNonTeachingReviewComplete(item);
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "15px 16px", boxShadow: "0 1px 5px rgba(0,0,0,.06)", borderLeft: "3px solid #1d4ed8", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar initials={item.avatar} color={item.avatarColor || "#1d4ed8"} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{item.name}</div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{item.roleLabel} - {item.designation}</div>
          <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "monospace", marginTop: 1 }}>{item.employeeId}</div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, background: "#f8fafc", borderRadius: 7, padding: "10px 12px" }}>
        {[
          ["Self", item.selfTotal, "#1d4ed8"],
          ["RO", item.roTotal, "#0891b2"],
          ["Registrar", item.registrarTotal, "#155e75"],
          ["VC", item.vcTotal, "#6d28d9"],
        ].map(([label, value, color]) => (
          <div key={label}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color }}>{n(value).toFixed(1)}<span style={{ fontSize: 9, color: "#94a3b8" }}> / 130</span></div>
            <ScoreBar score={value} max={130} color={color} />
          </div>
        ))}
      </div>

      {(item.form?.roRemarks || item.form?.registrarRemarks) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {item.form?.roRemarks && (
            <div style={{ background: "#eff6ff", borderLeft: "2px solid #1d4ed8", borderRadius: 5, padding: "5px 8px", color: "#1e40af", fontSize: 10 }}>
              <strong>RO: </strong>{item.form.roRemarks.slice(0, 70)}{item.form.roRemarks.length > 70 ? "..." : ""}
            </div>
          )}
          {item.form?.registrarRemarks && (
            <div style={{ background: "#ecfeff", borderLeft: "2px solid #155e75", borderRadius: 5, padding: "5px 8px", color: "#155e75", fontSize: 10 }}>
              <strong>Registrar: </strong>{item.form.registrarRemarks.slice(0, 70)}{item.form.registrarRemarks.length > 70 ? "..." : ""}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
        <div style={{ fontSize: 9, color: "#94a3b8" }}>Submitted: {item.submittedOn || "-"}</div>
        <button type="button" onClick={() => onReview(item)} style={{ fontSize: 11, padding: "6px 14px", background: reviewed ? "#1e293b" : "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 800, fontFamily: "Georgia, serif" }}>
          {reviewed ? "View Review" : "Review"}
        </button>
      </div>
    </div>
  );
}

function NonTeachingPanel({ items, onReview }) {
  const pending = items.filter((item) => item.status === expectedPendingStatus("vc")).length;
  const reviewed = items.filter(isNonTeachingReviewComplete).length;

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)", borderTop: "4px solid #1d4ed8", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#1d4ed8", fontWeight: 900 }}>NT</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>Non-Teaching Staff Reviews</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Registrar - Reporting Officer - Staff branch</div>
        </div>
        {pending > 0 && <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800 }}>{pending} Pending</div>}
        {reviewed > 0 && <div style={{ background: "#fdf4ff", color: "#6b21a8", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800 }}>{reviewed} VC Reviewed</div>}
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8", background: "#fff", borderRadius: 10 }}>
          <div style={{ fontWeight: 700 }}>No non-teaching submissions pending VC review</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {items.map((item) => <NonTeachingCard key={item.id} item={item} onReview={onReview} />)}
        </div>
      )}
    </div>
  );
}

const SCHOOL_META = {
  SoCSEA: { color: "#6366f1", icon: "CS" },
  SoBB:   { color: "#10b981", icon: "BB" },
  SoCE:   { color: "#0ea5e9", icon: "CE" },
  SoEMR:  { color: "#f59e0b", icon: "EM" },
  SoC:    { color: "#14b8a6", icon: "CM" },
  SoMCS:  { color: "#8b5cf6", icon: "MC" },
  CioD:   { color: "#ec4899", icon: "DS" },
  SoAA:   { color: "#f97316", icon: "AA" },
  CISR:   { color: "#0f766e", icon: "CI" },
};

const toVcSchool = (school) => {
  const meta = SCHOOL_META[school.code] || {};
  return {
    id: school.code.toLowerCase(),
    code: school.code,
    name: school.name,
    label: school.label,
    color: meta.color || "#64748b",
    icon: meta.icon || school.code,
    hasHods: school.code === "SoEMR",
  };
};

const HIERARCHY_SCHOOLS = {
  engg: UNIVERSITY_SCHOOLS
    .filter((school) => school.deanTrack === DEAN_TRACKS.ENGINEERING)
    .map(toVcSchool),
  "non-engg": UNIVERSITY_SCHOOLS
    .filter((school) => school.deanTrack === DEAN_TRACKS.NON_ENGINEERING)
    .map(toVcSchool),
  cisr: UNIVERSITY_SCHOOLS
    .filter((school) => school.deanTrack === DEAN_TRACKS.DIRECT_VC)
    .map(toVcSchool),
};

const schoolIdForPerson = (person = {}) => {
  const schoolKey = getSchoolKey(person.school || person.info?.school || "");
  return schoolKey ? schoolKey.toLowerCase() : "";
};

const withVcSchoolId = (item) => ({
  ...item,
  schoolId: item.schoolId || schoolIdForPerson(item),
});

export default function VCDashboard() {
  const navigate = useNavigate();
  const [deanTypeFilter, setDeanTypeFilter] = useState("engg");
  const [activeSchoolId, setActiveSchoolId] = useState("socsea");
  const [reviewing, setReviewing] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [deanList, setDeanList] = useState([]);
  const [dirList, setDirList] = useState([]);
  const [hodList, setHodList] = useState([]);
  const [centerHeadList, setCenterHeadList] = useState([]);
  const [facList, setFacList] = useState([]);
  const [nonTeachingList, setNonTeachingList] = useState([]);

  useEffect(() => {
    let active = true;
    const loadReviewQueue = async () => {
      try {
        const items = await fetchReviewQueueForRole({
          reviewerRole: "vc",
          reviewerProfile: { ...profileFromsessionStorage(), appraisal_role: "vc" },
        });
        let nonTeachingItems = [];
        try {
          nonTeachingItems = await fetchNonTeachingQueueForRole({ reviewerRole: "vc" });
        } catch (nonTeachingErr) {
          console.warn("Could not load VC non-teaching review queue:", nonTeachingErr.message);
        }
        if (!active) return;
        const routedItems = items.map(withVcSchoolId);
        setFacList(routedItems.filter(item => item.appraisalRole === "faculty"));
        setHodList(routedItems.filter(item => item.appraisalRole === "hod"));
        setCenterHeadList(routedItems.filter(item => item.appraisalRole === "center_head"));
        setDirList(routedItems.filter(item => item.appraisalRole === "director"));
        setDeanList(routedItems.filter(item => item.appraisalRole === "dean"));
        setNonTeachingList(nonTeachingItems);
      } catch (err) {
        console.error("Could not load VC review queue:", err);
        if (!active) return;
        setFacList([]); setHodList([]); setCenterHeadList([]); setDirList([]); setDeanList([]);
        setNonTeachingList([]);
      }
    };
    loadReviewQueue();
    return () => { active = false; };
  }, []);

  const handleSubmit = async (id, scores, remarks, personMode, sectionScores, reviewConfirmed = false) => {
    if (!reviewConfirmed) {
      alert("Please verify and confirm the accuracy declaration before submitting the review.");
      return;
    }
    const sourceList = personMode === "dean" ? deanList : personMode === "director" ? dirList : personMode === "hod" ? hodList : personMode === "center_head" ? centerHeadList : facList;
    const item = sourceList.find(entry => entry.id === id);
    if (!item) return;
    try {
      await submitWorkflowReview({
        subjectEmail: item.email,
        academicYear: item.academicYear || item.info?.ay,
        reviewerRole: "vc",
        partAScore: scores.partA,
        partBScore: scores.partB,
        totalScore: scores.total,
        remarks,
        sectionScores,
      });
      const upd = (list) => list.map(p => p.id === id
        ? { ...p, ...sectionScores, innovVc: sectionScores?.innovativeTeaching?.vc ?? p.innovVc, status: "Reviewed", workflowStatus: reviewedStatusFor("vc"), vcPartA: scores.partA, vcPartB: scores.partB, vcTotal: scores.total, vcRemarks: remarks }
        : p);
      if (personMode === "dean") setDeanList(upd);
      else if (personMode === "director") setDirList(upd);
      else if (personMode === "hod") setHodList(upd);
      else if (personMode === "center_head") setCenterHeadList(upd);
      else if (personMode === "faculty") setFacList(upd);
      setReviewing(null);
      alert("VC final approval submitted.");
    } catch (err) {
      console.error("Could not submit VC review:", err);
      alert(`Unable to submit VC review.\n\n${err.message}`);
    }
  };

  const currentSchools = HIERARCHY_SCHOOLS[deanTypeFilter] || [];
  const activeSchool = currentSchools.find(s => s.id === activeSchoolId) || currentSchools[0] || null;

  const switchDeanType = (type) => {
    setDeanTypeFilter(type);
    setActiveSchoolId(HIERARCHY_SCHOOLS[type]?.[0]?.id || "");
    setReviewing(null);
  };
  const switchSchool = (schoolId) => { setActiveSchoolId(schoolId); setReviewing(null); };

  const getSchoolPending = (school) => {
    const all = [
      ...deanList.filter(p => p.schoolId === school.id),
      ...dirList.filter(p => p.schoolId === school.id),
      ...hodList.filter(p => p.schoolId === school.id),
      ...centerHeadList.filter(p => p.schoolId === school.id),
      ...facList.filter(p => p.schoolId === school.id),
    ];
    return all.filter(p => !isVcReviewed(p)).length;
  };

  const teachingItems = [...deanList, ...dirList, ...hodList, ...centerHeadList, ...facList];
  const totalPending = teachingItems.filter(p => !isVcReviewed(p)).length +
    nonTeachingList.filter(item => !isNonTeachingReviewComplete(item)).length;
  const totalReviewed = teachingItems.filter(isVcReviewed).length +
    nonTeachingList.filter(isNonTeachingReviewComplete).length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Georgia, serif", background: "#f0ede8", color: "#1e293b" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 248, height: "100vh", minHeight: "100vh", boxSizing: "border-box", overflow: "hidden", background: "#0f172a", display: "flex", flexDirection: "column", padding: "20px 16px", gap: 12, position: "sticky", top: 0, alignSelf: "flex-start", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>FA</div>
          <div>
            <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 13 }}>{APP_INFO.PORTAL_NAME}</div>
            <div style={{ color: "#475569", fontSize: 9 }}>{APP_INFO.UNIVERSITY_NAME}</div>
          </div>
        </div>

        <div style={{ background: "#3b0764", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#c4b5fd" }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Vice Chancellor</div>
          <div style={{ color: "#a78bfa", fontSize: 10 }}>Full university oversight</div>
          <div style={{ color: "#6d28d9", fontSize: 9, marginTop: 2 }}>AY {VC_USER.ay}</div>
        </div>

        <div style={{ height: 1, background: "#1e293b" }} />

        <button onClick={() => setReviewing(null)}
          style={{ background: "#1e293b", border: "none", borderRadius: 9, padding: "10px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", fontFamily: "Georgia, serif" }}>
          <span style={{ fontSize: 16 }}>🏫</span>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 12 }}>School Reviews</div>
            <div style={{ color: "#64748b", fontSize: 10, marginTop: 1 }}>{totalPending} awaiting</div>
          </div>
          {totalPending > 0 && (
            <div style={{ background: "#7c3aed", color: "#fff", fontWeight: 800, fontSize: 10, minWidth: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{totalPending}</div>
          )}
        </button>

        {/* Score legend */}
        <div style={{ background: "#1e293b", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Score Columns</div>
          {[
            { color: "#818cf8", label: "HOD Score" },
            { color: "#38bdf8", label: "Director Score" },
            { color: "#34d399", label: "Dean Score" },
            { color: "#a78bfa", label: "VC Score" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* University summary */}
        <div style={{ background: "#1e293b", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>University Overview</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>🔧 4 Engineering Schools</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>🎓 4 Non-Engineering Schools</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>CISR Center</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6 }}>Non-Teaching Branch</div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, background: "#fef3c7", borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e" }}>{totalPending}</div>
              <div style={{ fontSize: 8, color: "#b45309" }}>Pending</div>
            </div>
            <div style={{ flex: 1, background: "#fdf4ff", borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#6b21a8" }}>{totalReviewed}</div>
              <div style={{ fontSize: 8, color: "#7c3aed" }}>VC Reviewed</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ height: 1, background: "#1e293b" }} />
        <button
          type="button"
          onClick={() => navigate("/edit-profile")}
          title="Edit profile"
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, width: "100%", cursor: "pointer", fontFamily: "Georgia, serif", textAlign: "left" }}
        >
          <Avatar initials={(sessionStorage.getItem("name") || "U").split(" ").map(w => w[0]).join("").toUpperCase()} color="#7c3aed" size={34} />
          <div>
            <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 700 }}>{sessionStorage.getItem("name") || "Vice Chancellor"}</div>
            <div style={{ color: "#475569", fontSize: 9 }}>Vice Chancellor · {APP_INFO.SHORT_NAME}</div>
          </div>
        </button>
        <button onClick={() => setShowLogoutModal(true)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, background: "none", border: "1px solid #374151", borderRadius: 8, padding: "9px 11px", cursor: "pointer", fontFamily: "Georgia, serif" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          <span style={{ fontSize: 15 }}>🚪</span>
          <span style={{ color: "#f87171", fontWeight: 700, fontSize: 12 }}>Logout</span>
        </button>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, overflowX: "auto" }}>

        {!reviewing && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a", letterSpacing: -0.5 }}>School-wise Appraisal Reviews</h1>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>{APP_INFO.SHORT_NAME} · AY {VC_USER.ay}</p>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", background: "#fff", padding: "8px 14px", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                {deanList.length + dirList.length + hodList.length + centerHeadList.length + facList.length + nonTeachingList.length} total submissions
              </div>
            </div>

            {/* Engg / Non-Engg Toggle */}
            <div style={{ display: "flex", background: "#fff", borderRadius: 10, padding: 4, boxShadow: "0 1px 4px rgba(0,0,0,.07)", width: "fit-content", gap: 2 }}>
              {[
                { key: "engg",     label: "🔧 Engineering Schools",     color: "#1e40af", bg: "#dbeafe" },
                { key: "non-engg", label: "🎓 Non-Engineering Schools", color: "#6b21a8", bg: "#f3e8ff" },
                { key: "cisr", label: "CISR", color: "#0f766e", bg: "#ccfbf1" },
                { key: "non-teaching", label: "Non-Teaching Staff", color: "#1d4ed8", bg: "#dbeafe" },
              ].map(({ key, label, color, bg }) => {
                const schoolPending = key === "non-teaching"
                  ? nonTeachingList.filter(item => !isNonTeachingReviewComplete(item)).length
                  : (HIERARCHY_SCHOOLS[key] || []).reduce((a, s) => a + getSchoolPending(s), 0);
                const isActive = deanTypeFilter === key;
                return (
                  <button key={key} onClick={() => switchDeanType(key)}
                    style={{ padding: "10px 22px", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 13, fontWeight: 700, transition: "all .2s", background: isActive ? bg : "none", color: isActive ? color : "#64748b", display: "flex", alignItems: "center", gap: 8 }}>
                    {label}
                    {schoolPending > 0 && (
                      <span style={{ background: isActive ? color : "#94a3b8", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{schoolPending}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* School Tabs */}
            {activeSchool && (
            <div style={{ display: "flex", gap: 0, background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderBottom: `3px solid ${activeSchool.color}` }}>
              {currentSchools.map((school, idx) => {
                const pending = getSchoolPending(school);
                const isActive = school.id === activeSchoolId;
                return (
                  <button key={school.id} onClick={() => switchSchool(school.id)}
                    style={{ flex: 1, padding: "12px 8px", border: "none", cursor: "pointer", fontFamily: "Georgia, serif", fontSize: 11, fontWeight: 700, transition: "all .2s", background: isActive ? `${school.color}15` : "none", color: isActive ? school.color : "#64748b", borderBottom: isActive ? `3px solid ${school.color}` : "3px solid transparent", borderRight: idx < currentSchools.length - 1 ? "1px solid #f1f5f9" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 18 }}>{school.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>{school.code}</span>
                    <span style={{ fontSize: 9, color: isActive ? school.color : "#94a3b8", fontWeight: 400, maxWidth: 90, textAlign: "center", lineHeight: 1.3 }}>{school.name.split(" ").slice(0, 3).join(" ")}</span>
                    {pending > 0 && (
                      <span style={{ background: "#f59e0b", color: "#fff", borderRadius: 8, padding: "1px 6px", fontSize: 9, fontWeight: 800 }}>{pending} pending</span>
                    )}
                  </button>
                );
              })}
            </div>
            )}

            {deanTypeFilter === "non-teaching" ? (
              <NonTeachingPanel
                items={nonTeachingList}
                onReview={(person) => setReviewing({ person, personMode: "non_teaching" })}
              />
            ) : activeSchool ? (
              <SchoolPanel
                school={activeSchool}
                deanList={deanList}
                dirList={dirList}
                hodList={hodList}
                centerHeadList={centerHeadList}
                facList={facList}
                onReview={(person, personMode) => setReviewing({ person, personMode })}
              />
            ) : null}
          </>
        )}

        {reviewing && (
          reviewing.personMode === "non_teaching" ? (
            <NonTeachingAuthorityReviewPanel
              item={reviewing.person}
              reviewerRole="vc"
              onBack={() => setReviewing(null)}
              readOnly={isNonTeachingReviewComplete(reviewing.person)}
              onSubmitted={(updated) => {
                setNonTeachingList((current) => current.map((item) => item.id === updated.id ? updated : item));
                setReviewing(null);
              }}
            />
          ) : formTypeForSchool(getSchoolKey(reviewing.person?.school)) === FORM_TYPES.MEDIA_COMM ? (
            <MediaCommAuthorityReviewPanel
              person={reviewing.person}
              reviewerRole="vc"
              onBack={() => setReviewing(null)}
              onSubmit={(id, scores, remarks, sectionScores, reviewConfirmed) => handleSubmit(id, scores, remarks, reviewing.personMode, sectionScores, reviewConfirmed)}
              readOnly={isVcReviewed(reviewing.person)}
              showReport
            />
          ) : formTypeForSchool(getSchoolKey(reviewing.person?.school)) === FORM_TYPES.DESIGN_ARTS ? (
            <DesignArtsAuthorityReviewPanel
              person={reviewing.person}
              reviewerRole="vc"
              onBack={() => setReviewing(null)}
              onSubmit={(id, scores, remarks, sectionScores, reviewConfirmed) => handleSubmit(id, scores, remarks, reviewing.personMode, sectionScores, reviewConfirmed)}
              readOnly={isVcReviewed(reviewing.person)}
              showReport
            />
          ) : (
            <VCReviewPanel
              person={reviewing.person}
              personMode={reviewing.personMode}
              onBack={() => setReviewing(null)}
              onSubmit={handleSubmit}
              readOnly={isVcReviewed(reviewing.person)}
            />
          )
        )}
      </main>

      {/* Logout Modal */}
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
              <button onClick={() => setShowLogoutModal(false)}
                style={{ flex: 1, padding: "10px 0", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>
                Cancel
              </button>
              <button onClick={() => { setShowLogoutModal(false); sessionStorage.clear(); navigate("/", { replace: true }); }}
                style={{ flex: 1, padding: "10px 0", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "Georgia, serif" }}>
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
