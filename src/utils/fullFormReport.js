import { clampScore, researchGuidanceScore, rowMaxForSection } from "./appraisalFormUtils";

const n = (value) => parseFloat(value) || 0;

export const safeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const scoreKeyForInnov = (role) => ({
  hod: "innovHod",
  director: "innovDirector",
  dean: "innovDean",
  vc: "innovVc",
}[role] || "innovScore");

const displayValue = (value) => {
  const text = String(value ?? "").trim();
  return text ? safeHtml(text) : "&nbsp;";
};

const docsFor = (docs, key) => {
  const files = docs?.[key] || [];
  if (!files.length) return "&nbsp;";
  return files.map((file) => {
    const label = safeHtml(file.name || file.url || "Document");
    return file.url
      ? `<a href="${safeHtml(file.url)}" target="_blank" rel="noreferrer">${label}</a>`
      : label;
  }).join("<br/>");
};

const roleColumnLabel = (role, roleLabel = (value) => value) =>
  role === "score" ? "Faculty Score" : `${safeHtml(roleLabel(role))} Score`;

const displaySectionScore = (section, row, role) => {
  if (section.key === "research" && role === "score") return researchGuidanceScore(row).toFixed(1);
  if (role === "score") return clampScore(row?.[role], rowMaxForSection(section.key, row, section.max));
  return row?.[role];
};

const renderSection = ({ section, rows = [], docs = {}, scoreRoles = ["score"], roleLabel }) => `
  <h3>${safeHtml(section.title)} <span>(Max ${safeHtml(section.max)})</span></h3>
  <table>
    <thead>
      <tr>
        <th>SN</th>
        ${section.fields.map(([, label]) => `<th>${safeHtml(label)}</th>`).join("")}
        <th>Documents</th>
        ${scoreRoles.map((role) => `<th>${roleColumnLabel(role, roleLabel)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${(rows.length ? rows : [{}]).map((row, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          ${section.fields.map(([key]) => `<td>${displayValue(row?.[key])}</td>`).join("")}
          <td>${docsFor(docs, `${section.doc}-${index}`)}</td>
          ${scoreRoles.map((role) => `<td class="center">${displayValue(displaySectionScore(section, row, role))}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  </table>`;

const isSectionReportable = (form, section) => {
  const applicability = form?.sectionApplicability || {};
  if (applicability[section.key] === "notApplicable") return false;
  if (section.applicabilityKey && applicability[section.applicabilityKey] === "notApplicable") return false;
  return true;
};

const renderInnovativeSection = ({ form, docs, scoreRoles, roleLabel }) => `
  <h3>A(iii). Innovative Teaching Methods <span>(Max 10)</span></h3>
  <table>
    <thead>
      <tr>
        <th>Methods Used</th>
        <th>Details</th>
        <th>Documents</th>
        ${scoreRoles.map((role) => `<th>${roleColumnLabel(role, roleLabel)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${(form.innovRows?.length ? form.innovRows : [{ method: form.innovDetails, details: "" }]).map((row, index) => `
        <tr>
          <td>${displayValue(row.method || form.innovDetails)}</td>
          <td>${displayValue(row.details)}</td>
          <td>${docsFor(docs, `innov-${index}`)}</td>
          ${scoreRoles.map((role) => `<td class="center">${displayValue(role === "score" ? (row.score || form.innovScore) : form[scoreKeyForInnov(role)])}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  </table>`;

export const openFullFormReport = ({
  title,
  subtitle = "",
  form = {},
  docs = {},
  partASections = [],
  partBSections = [],
  totals = {},
  maxScores = {},
  scoreRoles = ["score"],
  roleLabel,
  status = "",
  remarksLabel = "",
  remarks = "",
  generatedBy = "",
}) => {
  const win = window.open("", "_blank", "width=1000,height=800");
  if (!win) {
    alert("Please allow popups to generate the report.");
    return;
  }

  const info = form.info || {};
  const html = `<!doctype html>
<html>
<head>
  <title>${safeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: "Times New Roman", Georgia, serif; font-size: 12px; color: #0f172a; }
    h1 { text-align: center; margin: 0 0 6px; font-size: 22px; }
    h2 { margin: 24px 0 10px; border-bottom: 2px solid #0f172a; padding-bottom: 5px; font-size: 16px; }
    h3 { margin: 15px 0 7px; font-size: 13px; color: #1e293b; }
    h3 span { color: #64748b; font-size: 11px; font-weight: 400; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
    th, td { border: 1px solid #94a3b8; padding: 6px; vertical-align: top; word-wrap: break-word; }
    th { background: #e2e8f0; color: #0f172a; text-align: center; font-weight: 700; }
    a { color: #1d4ed8; }
    .subtitle { text-align: center; color: #475569; margin-bottom: 14px; }
    .meta td { border: none; padding: 4px 6px; }
    .center { text-align: center; }
    .page-break { page-break-before: always; }
    .summary td, .summary th { font-size: 13px; }
    .total { font-weight: 800; background: #f8fafc; }
    .remarks { white-space: pre-wrap; border: 1px solid #94a3b8; padding: 10px; min-height: 50px; }
    .report-header { position: relative; }
    .report-logo { position: absolute; top: 0; right: 0; width: 64px; max-height: 52px; object-fit: contain; }
  </style>
</head>
<body>
  <header class="report-header">
    <img class="report-logo" src="${window.location.origin}/dypiu.jpeg" alt="DYPIU Logo" />
    <h1>${safeHtml(title)}</h1>
    ${subtitle ? `<div class="subtitle">${safeHtml(subtitle)}</div>` : ""}
  </header>
  <table class="meta">
    <tbody>
      <tr><td><strong>Name:</strong></td><td>${displayValue(info.name || form.name)}</td><td><strong>Academic Year:</strong></td><td>${displayValue(info.ay || form.academicYear)}</td></tr>
      <tr><td><strong>Qualification:</strong></td><td>${displayValue(info.qual || form.qualification)}</td><td><strong>Designation / Role:</strong></td><td>${displayValue(info.desig || form.designation || form.appraisalRole)}</td></tr>
      <tr><td><strong>School:</strong></td><td>${displayValue(info.school || form.schoolName || form.school)}</td><td><strong>Generated On:</strong></td><td>${safeHtml(new Date().toLocaleString())}</td></tr>
      ${generatedBy ? `<tr><td><strong>Generated By:</strong></td><td colspan="3">${safeHtml(generatedBy)}</td></tr>` : ""}
    </tbody>
  </table>

  <h2>Part A - Teaching Process & Academic Activities</h2>
  ${partASections.slice(0, 2).filter((section) => isSectionReportable(form, section)).map((section) => renderSection({ section, rows: form[section.key], docs, scoreRoles, roleLabel })).join("")}
  ${renderInnovativeSection({ form, docs, scoreRoles, roleLabel })}
  ${partASections.slice(2).filter((section) => isSectionReportable(form, section)).map((section) => renderSection({ section, rows: form[section.key], docs, scoreRoles, roleLabel })).join("")}

  <div class="page-break"></div>
  <h2>Part B - Research and Academic Contributions</h2>
  ${partBSections.filter((section) => isSectionReportable(form, section)).map((section) => renderSection({ section, rows: form[section.key], docs, scoreRoles, roleLabel })).join("")}

  <div class="page-break"></div>
  <h2>Summary</h2>
  <table class="summary">
    <thead><tr><th>Section</th><th>Score</th><th>Maximum</th></tr></thead>
    <tbody>
      <tr><td>Part A</td><td class="center">${n(totals.partA).toFixed(1)}</td><td class="center">${safeHtml(maxScores.partA)}</td></tr>
      <tr><td>Part B</td><td class="center">${n(totals.partB).toFixed(1)}</td><td class="center">${safeHtml(maxScores.partB)}</td></tr>
      <tr class="total"><td>Grand Total</td><td class="center">${n(totals.total).toFixed(1)}</td><td class="center">${safeHtml(maxScores.grand)}</td></tr>
      ${status ? `<tr><td>Status</td><td colspan="2">${safeHtml(status)}</td></tr>` : ""}
    </tbody>
  </table>
  ${remarksLabel ? `<h3>${safeHtml(remarksLabel)}</h3><div class="remarks">${safeHtml(remarks || "No remarks recorded.")}</div>` : ""}
</body>
</html>`;

  win.document.write(html);
  win.document.close();
  win.print();
};

