import { useState, useRef, useCallback } from "react";

// ─── Multi-file DocCell ───────────────────────────────────────────────────────
function DocCell({ id, docs, setDocs }) {
  const ref = useRef();

  const handleFiles = (files) => {
    const newFiles = Array.from(files).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type,
    }));
    setDocs((p) => ({ ...p, [id]: [...(p[id] || []), ...newFiles] }));
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
    <div style={S.docCellWrap}>
      {files.map((f, idx) => (
        <div key={idx} style={S.docPill}>
          <span style={{ color: "#10b981", fontWeight: "bold" }}>✔</span>
          <span style={S.docPillName} title={f.name}>{f.name}</span>
          <button onClick={() => removeFile(idx)} style={S.docPillDel}>✕</button>
        </div>
      ))}
      <div style={S.dropArea} onClick={() => ref.current.click()}>
        <span style={{ fontSize: 10, color: "#64748b" }}>📎 Attach</span>
        <input
          ref={ref} type="file" multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}

// ─── ViewCell: shows links to uploaded docs ───────────────────────────────────
function ViewCell({ id, docs }) {
  const files = docs[id] || [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((f, idx) => (
        <a key={idx} href={f.url} target="_blank" rel="noreferrer" style={S.viewBtn}>
          👁 {f.name.length > 14 ? f.name.slice(0, 14) + "…" : f.name}
        </a>
      ))}
    </div>
  );
}

// ─── Text Input ───────────────────────────────────────────────────────────────
function TI({ val, onChange, center, placeholder }) {
  return (
    <input
      value={val} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || ""}
      style={center ? S.inpCenter : S.inp}
    />
  );
}

// ─── Row Buttons ──────────────────────────────────────────────────────────────
function RowBtns({ onAdd, onDel, canDel = true }) {
  return (
    <div style={S.rowBtnWrap}>
      <button style={S.addBtn} onClick={onAdd}>+ Add Row</button>
      {canDel && <button style={S.delBtn} onClick={onDel}>− Delete Last</button>}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, children, accent = "#6366f1" }) {
  return (
    <div style={{ ...S.sectionCard, borderTop: `3px solid ${accent}` }}>
      <div style={S.sectionCardHeader}>
        <div style={{ ...S.sectionCardTitle, color: accent }}>{title}</div>
        {subtitle && <div style={S.sectionCardSub}>{subtitle}</div>}
      </div>
      <div style={S.sectionCardBody}>{children}</div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const n = (v) => parseFloat(v) || 0;
const pct = (v, m) => Math.min(100, Math.round((v / m) * 100)) || 0;

function makeRows(count, template) {
  return Array.from({ length: count }, () => ({ ...template }));
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [info, setInfo] = useState({ name: "", qual: "", desig: "", ay: "2025-2026" });
  const inf = (k) => (v) => setInfo((p) => ({ ...p, [k]: v }));

  // ── Part A state ──
  const [lectures, setLectures] = useState(makeRows(3, { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" }));
  const setLec = (i, k, v) => setLectures((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [courseFile, setCourseFile] = useState({ course: "", title: "", details: "", score: "", hod: "", director: "" });
  const [innovScore, setInnovScore] = useState("");
  const [innovHod, setInnovHod] = useState("");

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

  const [feedback, setFeedback] = useState(makeRows(3, { code: "", fb1: "", fb2: "", score: "", hod: "", director: "" }));
  const setFb = (i, k, v) => setFeedback((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [deptActs, setDeptActs] = useState(makeRows(3, { activity: "", nature: "", score: "", hod: "", director: "" }));
  const setDept = (i, k, v) => setDeptActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [uniActs, setUniActs] = useState(makeRows(3, { activity: "", nature: "", score: "", hod: "", director: "" }));
  const setUni = (i, k, v) => setUniActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const societyLabels = ["Induction Program", "Unnat Bharat Abhiyan", "Yoga Classes", "Blood Donation", "Techno Social activities", "NSS", "Social visits", "Project of Social Impact", "Any other activity"];
  const [society, setSociety] = useState(societyLabels.map((l) => ({ label: l, details: "", score: "", hod: "", director: "" })));
  const setSoc = (i, k, v) => setSociety((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [industry, setIndustry] = useState(makeRows(2, { name: "", details: "", score: "", hod: "", director: "" }));
  const setInd = (i, k, v) => setIndustry((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const acrLabels = ["Self-motivation and Proactiveness", "Punctuality", "Target based work", "Effectiveness", "Obedience"];
  const [acr, setAcr] = useState(acrLabels.map((l) => ({ label: l, hod: "", director: "" })));
  const setAcrRow = (i, k, v) => setAcr((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // ── Part B state ──
  const [journals, setJournals] = useState(makeRows(3, { title: "", journal: "", issn: "", index: "", score: "", hod: "", director: "" }));
  const setJour = (i, k, v) => setJournals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [books, setBooks] = useState(makeRows(2, { title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "", hod: "", director: "" }));
  const setBook = (i, k, v) => setBooks((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [ict, setIct] = useState(makeRows(2, { title: "", desc: "", type: "", quad: "", score: "", hod: "", director: "" }));
  const setIctRow = (i, k, v) => setIct((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [research, setResearch] = useState(makeRows(2, { degree: "PhD", name: "", thesis: "", score: "", hod: "", director: "" }));
  const setRes = (i, k, v) => setResearch((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [projects2, setProjects2] = useState(makeRows(2, { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" }));
  const setPrj2 = (i, k, v) => setProjects2((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [patents, setPatents] = useState(makeRows(2, { title: "", type: "", date: "", status: "", fileNo: "", score: "", hod: "" , director: "" }));
  const setPat = (i, k, v) => setPatents((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [awards, setAwards] = useState(makeRows(2, { title: "", date: "", agency: "", level: "", score: "", hod: "", director: ""  }));
  const setAwd = (i, k, v) => setAwards((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [confs, setConfs] = useState(makeRows(3, { title: "", type: "", org: "", level: "", score: "", hod: "", director: ""  }));
  const setConf = (i, k, v) => setConfs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [proposals, setProposals] = useState(makeRows(2, { title: "", duration: "", agency: "", amount: "", score: "", hod: "", director: ""  }));
  const setProp = (i, k, v) => setProposals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [fdps, setFdps] = useState(makeRows(2, { program: "", duration: "", org: "", score: "", hod: "", director: ""  }));
  const setFdp = (i, k, v) => setFdps((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [training, setTraining] = useState(makeRows(2, { company: "", duration: "", nature: "", score: "", hod: "", director: "" }));
  const setTrain = (i, k, v) => setTraining((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // ── Docs: key → [{name, url, type}] ──
  const [docs, setDocs] = useState({});
  const [remarks, setRemarks] = useState({ hod: "", dir: "", dean: "", vc: "" });

  // ── Computed scores ──
  const totalLecScore = lectures.reduce((a, r) => a + n(r.score), 0);
  const courseFileScore = n(courseFile.score);
  const innovTotal = n(innovScore);
  const projectTotal = projects.reduce((a, r) => a + n(r.score), 0);
  const qualTotal = quals.reduce((a, r) => a + n(r.score), 0);
  const teachingRaw = totalLecScore + courseFileScore + innovTotal + projectTotal + qualTotal;
  const stuFeedbackScore = feedback.reduce((a, r) => a + n(r.score), 0);
  const deptScore = deptActs.reduce((a, r) => a + n(r.score), 0);
  const uniScore = uniActs.reduce((a, r) => a + n(r.score), 0);
  const societyScore = society.reduce((a, r) => a + n(r.score), 0);
  const industryScore = industry.reduce((a, r) => a + n(r.score), 0);
  const acrScore = acr.reduce((a, r) => a + n(r.hod), 0);
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

  const grade = () => {
    const p = pct(grandTotal, 575);
    if (p >= 85) return { label: "Outstanding", color: "#10b981" };
    if (p >= 70) return { label: "Very Good", color: "#3b82f6" };
    if (p >= 55) return { label: "Good", color: "#f59e0b" };
    if (p >= 40) return { label: "Satisfactory", color: "#f97316" };
    return { label: "Needs Improvement", color: "#ef4444" };
  };
  const g = grade();

  const navItems = [
    { id: "overview", label: "Overview", icon: "◈" },
    { id: "partA", label: "Part A — 360° Feedback", icon: "◉" },
    { id: "partB", label: "Part B — Research", icon: "◎" },
    { id: "summary", label: "Summary & Submit", icon: "▣" },
  ];

  return (
    <div style={S.page}>
      {/* ── SIDEBAR ── */}
      <aside style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoIcon}>FA</div>
          <div>
            <div style={S.logoTitle}>FacultyAppraise</div>
            <div style={S.logoSub}>D Y Patil International University</div>
          </div>
        </div>
        <nav style={S.nav}>
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              style={{ ...S.navBtn, ...(activeTab === item.id ? S.navBtnActive : {}) }}>
              <span style={S.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={S.sidebarProgress}>
          <div style={S.progressLabel}>
            <span>Grand Total</span>
            <span style={{ color: g.color }}>{grandTotal.toFixed(1)}/575</span>
          </div>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${pct(grandTotal, 575)}%`, background: g.color }} />
          </div>
        </div>
        <div style={S.sidebarFooter}>
          <div style={S.avatar}>
            {info.name ? info.name.split(" ").map((w) => w[0]).slice(0, 2).join("") : "FA"}
          </div>
          <div>
            <div style={S.avatarName}>{info.name || "Faculty Name"}</div>
            <div style={S.avatarDept}>{info.desig || "Designation"}</div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={S.main}>
        {/* Header */}
        <header style={S.header}>
          <div>
            <h1 style={S.pageTitle}>
              {activeTab === "overview" && "Dashboard Overview"}
              {activeTab === "partA" && "Part A: 360° Feedback"}
              {activeTab === "partB" && "Part B: Research & Academic"}
              {activeTab === "summary" && "Summary & Submit"}
            </h1>
            <p style={S.pageSubtitle}>Academic Year {info.ay || "2025-2026"} · D Y Patil International University, Akurdi, Pune</p>
          </div>
          <div style={{ ...S.gradePill, background: g.color + "22", color: g.color, border: `1.5px solid ${g.color}44` }}>
            {g.label}
          </div>
        </header>

        {/* Score Cards */}
        <div style={S.cards}>
          {[
            { label: "Part A Score", val: partATotal, max: 200, color: "#6366f1", disp: partATotal.toFixed(1) },
            { label: "Part B Score", val: partBTotal, max: 375, color: "#0ea5e9", disp: partBTotal.toFixed(1) },
            { label: "Grand Total", val: grandTotal, max: 575, color: g.color, disp: grandTotal.toFixed(1) },
            { label: "Overall Grade", val: grandTotal, max: 575, color: g.color, disp: g.label },
          ].map((c) => (
            <div key={c.label} style={{ ...S.card, borderTop: `3px solid ${c.color}` }}>
              <div style={S.cardLabel}>{c.label}</div>
              <div style={{ ...S.cardVal, color: c.color, fontSize: c.label === "Overall Grade" ? 15 : 22 }}>
                {c.disp}{c.label !== "Overall Grade" && <span style={S.cardMax}>/{c.max}</span>}
              </div>
              <div style={S.miniBarWrap}><div style={{ ...S.miniBar, width: `${pct(c.val, c.max)}%`, background: c.color }} /></div>
              <div style={S.cardPct}>{pct(c.val, c.max)}% achieved</div>
            </div>
          ))}
        </div>

        {/* ══ OVERVIEW ══ */}
        {activeTab === "overview" && (
          <div style={S.panel}>
            <h2 style={S.sectionTitle}>Appraisal Snapshot</h2>
            <p style={S.sectionDesc}>Fill in faculty details, then navigate to Part A and Part B to enter scores and upload documents.</p>
            <SectionCard title="Faculty Information" subtitle="Basic details about the faculty member" accent="#6366f1">
              <table style={S.infoTable}>
                <tbody>
                  {[["Name of Faculty", "name"], ["Educational Qualifications", "qual"], ["Present Designation", "desig"]].map(([label, key]) => (
                    <tr key={key}>
                      <td style={S.infoLabel}>{label}</td>
                      <td style={S.infoCell}><input value={info[key]} onChange={(e) => inf(key)(e.target.value)} placeholder={`Enter ${label}`} style={S.infoInput} /></td>
                    </tr>
                  ))}
                  <tr>
                    <td style={S.infoLabel}>Academic Year</td>
                    <td style={S.infoCell}><input value={info.ay} onChange={(e) => inf("ay")(e.target.value)} style={{ ...S.infoInput, width: 120 }} /></td>
                  </tr>
                </tbody>
              </table>
            </SectionCard>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              {[
                { label: "◉ Part A — 360° Feedback", total: partATotal, max: 200, color: "#6366f1", items: [
                  ["Teaching Process", teachingRaw, 100], ["Student Feedback", stuFeedbackScore, 10],
                  ["Dept Activities", deptScore, 20], ["University Activities", uniScore, 30],
                  ["Contribution to Society", societyScore, 10], ["Industry Connect", industryScore, 5], ["ACR", acrScore, 25],
                ]},
                { label: "◎ Part B — Research", total: partBTotal, max: 375, color: "#0ea5e9", items: [
                  ["Research Papers / Journals", journalScore, 120], ["Books / Chapters", bookScore, 50],
                  ["ICT Pedagogy", ictScore, 20], ["Research Guidance + Projects", researchScore + projectBScore, 75],
                  ["Patents & Awards", patentScore + awardScore, 50], ["Conferences / FDP", confScore, 30],
                  ["Research Proposals", proposalScore, 20], ["Self Development", fdpScore + trainScore, 10],
                ]},
              ].map((sec) => (
                <div key={sec.label} style={S.overviewCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12, marginBottom: 10, paddingBottom: 7, borderBottom: `2px solid ${sec.color}22`, color: sec.color }}>
                    <span>{sec.label}</span><span>{sec.total.toFixed(1)}/{sec.max}</span>
                  </div>
                  {sec.items.map(([lbl, val, max]) => (
                    <div key={lbl} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ color: "#475569" }}>{lbl}</span>
                      <span style={{ fontWeight: 600, color: "#1e293b" }}>{val.toFixed(1)}/{max}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ PART A ══ */}
        {activeTab === "partA" && (
          <div style={S.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={S.sectionTitle}>PART A — 360° Degree Feedback</h2>
                <p style={S.sectionDesc}>Enter scores and attach supporting documents. Max: 200 marks.</p>
              </div>
              <div style={{ padding: "7px 16px", borderRadius: 9, background: "#6366f122", color: "#6366f1", fontWeight: 700, fontSize: 14 }}>
                Total: {partATotal.toFixed(1)}/200
              </div>
            </div>

            {/* A. Teaching Process */}
            <SectionCard title="A. Teaching Process" subtitle="Max 100 marks" accent="#6366f1">
              <div style={S.subHead}>(i) Lectures, Tutorials, Practicals, Projects — Max 50 marks</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Semester</th>
                    <th style={S.th}>Course Code / Name</th>
                    <th style={S.th}>Planned</th>
                    <th style={S.th}>Conducted</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>  
                  </tr>
                </thead>
                <tbody>
                  {lectures.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.sem} onChange={(v) => setLec(i, "sem", v)} /></td>
                      <td style={S.td}><TI val={r.code} onChange={(v) => setLec(i, "code", v)} /></td>
                      <td style={S.tdC}><TI val={r.planned} onChange={(v) => setLec(i, "planned", v)} center /></td>
                      <td style={S.tdC}><TI val={r.conducted} onChange={(v) => setLec(i, "conducted", v)} center /></td>
                      <td style={S.td}><DocCell id={`lec-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`lec-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setLec(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setLec(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setLec(i, "director", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={S.tdBold} colSpan={7}>Total</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold", color: "#1e3a5f" }}>{totalLecScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setLectures((p) => [...p, { sem: "", code: "", planned: "", conducted: "", score: "", hod: "", director: "" }])}
                onDel={() => setLectures((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={lectures.length > 1} />

              <div style={S.subHead}>(ii) Course File — Max 20 marks</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Course / Paper</th>
                    <th style={S.th}>Title</th>
                    <th style={S.th}>Details</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={S.tdC}>1</td>
                    <td style={S.td}><TI val={courseFile.course} onChange={(v) => setCourseFile((p) => ({ ...p, course: v }))} /></td>
                    <td style={S.td}><TI val={courseFile.title} onChange={(v) => setCourseFile((p) => ({ ...p, title: v }))} /></td>
                    <td style={S.td}><TI val={courseFile.details} onChange={(v) => setCourseFile((p) => ({ ...p, details: v }))} /></td>
                    <td style={S.td}><DocCell id="courseFile" docs={docs} setDocs={setDocs} /></td>
                    <td style={S.viewCell}><ViewCell id="courseFile" docs={docs} /></td>
                    <td style={S.scoreCell}><TI val={courseFile.score} onChange={(v) => setCourseFile((p) => ({ ...p, score: v }))} center /></td>
                    <td style={S.scoreCell}><TI val={courseFile.hod} onChange={(v) => setCourseFile((p) => ({ ...p, hod: v }))} center /></td>
                    <td style={S.scoreCell}><TI val={courseFile.director} onChange={(v) => setCourseFile((p) => ({ ...p, director: v }))} center /></td>
                  </tr>
                </tbody>
              </table>

              <div style={S.subHead}>(iii) Innovative Teaching-Learning Methodologies — Max 10 marks</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Methods Used</th>
                    <th style={S.th}>Details</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={S.tdC}>1</td>
                    <td style={{ ...S.td, fontSize: 10, color: "#555" }}>Blended learning, Virtual Lab, LMS, Project Based Learning, Flip classroom, Any other</td>
                    <td style={S.td}></td>
                    <td style={S.td}><DocCell id="innov" docs={docs} setDocs={setDocs} /></td>
                    <td style={S.viewCell}><ViewCell id="innov" docs={docs} /></td>
                    <td style={S.scoreCell}><TI val={innovScore} onChange={setInnovScore} center /></td>
                    <td style={S.scoreCell}><TI val={innovHod} onChange={setInnovHod} center /></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={S.tdBold} colSpan={5}>Total Score (Max 10)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{n(innovScore).toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>

              <div style={S.subHead}>(iv) Projects — Max 10 marks</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Project Description</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}>{r.label}</td>
                      <td style={S.td}><DocCell id={`proj-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`proj-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setProj(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setProj(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setProj(i, "director", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={S.tdBold} colSpan={4}>Total (Max 10)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{projectTotal.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>

              <div style={S.subHead}>(v) Qualification Enhancement — Max 10 marks</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Description</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {quals.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}>{r.label}</td>
                      <td style={S.td}><DocCell id={`qual-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`qual-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setQual(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setQual(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setQual(i, "director", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={S.tdBold} colSpan={4}>Total (Max 10)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{qualTotal.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>

              <div style={{ background: "#eff6ff", borderRadius: 7, padding: "10px 14px", marginTop: 7, display: "flex", gap: 24, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#475569" }}>Total Teaching Process (out of 100):</span>
                <strong style={{ color: "#1e3a5f", fontSize: 15 }}>{teachingRaw.toFixed(1)}</strong>
              </div>
            </SectionCard>

            {/* B. Student Feedback */}
            <SectionCard title="B. Students' Feedback" subtitle="Max 10 marks" accent="#0ea5e9">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Course Code / Name</th>
                    <th style={S.th}>Feedback 1 (of 5)</th>
                    <th style={S.th}>Feedback 2 (of 5)</th>
                    <th style={S.th}>Average</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.code} onChange={(v) => setFb(i, "code", v)} /></td>
                      <td style={S.tdC}><TI val={r.fb1} onChange={(v) => setFb(i, "fb1", v)} center /></td>
                      <td style={S.tdC}><TI val={r.fb2} onChange={(v) => setFb(i, "fb2", v)} center /></td>
                      <td style={S.tdC}>{r.fb1 && r.fb2 ? ((n(r.fb1) + n(r.fb2)) / 2).toFixed(2) : "-"}</td>
                      <td style={S.td}><DocCell id={`fb-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`fb-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setFb(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setFb(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setFb(i, "director", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#e0f2fe" }}>
                    <td style={S.tdBold} colSpan={7}>Total (Max 10)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{stuFeedbackScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setFeedback((p) => [...p, { code: "", fb1: "", fb2: "", score: "", hod: "" }])}
                onDel={() => setFeedback((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={feedback.length > 1} />
            </SectionCard>

            {/* C. Dept */}
            <SectionCard title="C. Departmental / School Activities" subtitle="Max 20 marks" accent="#8b5cf6">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Activity</th>
                    <th style={S.th}>Nature of Activity</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {deptActs.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.activity} onChange={(v) => setDept(i, "activity", v)} /></td>
                      <td style={S.td}><TI val={r.nature} onChange={(v) => setDept(i, "nature", v)} /></td>
                      <td style={S.td}><DocCell id={`dept-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`dept-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setDept(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setDept(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setDept(i, "director", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f5f3ff" }}>
                    <td style={S.tdBold} colSpan={5}>Total (Max 20)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{deptScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setDeptActs((p) => [...p, { activity: "", nature: "", score: "", hod: "" }])}
                onDel={() => setDeptActs((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={deptActs.length > 1} />
            </SectionCard>

            {/* D. University */}
            <SectionCard title="D. University Level Activities" subtitle="Max 30 marks" accent="#f59e0b">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Activity</th>
                    <th style={S.th}>Nature of Activity</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {uniActs.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.activity} onChange={(v) => setUni(i, "activity", v)} /></td>
                      <td style={S.td}><TI val={r.nature} onChange={(v) => setUni(i, "nature", v)} /></td>
                      <td style={S.td}><DocCell id={`uni-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`uni-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setUni(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setUni(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#fffbeb" }}>
                    <td style={S.tdBold} colSpan={5}>Total (Max 30)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{uniScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setUniActs((p) => [...p, { activity: "", nature: "", score: "", hod: "" }])}
                onDel={() => setUniActs((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={uniActs.length > 1} />
            </SectionCard>

            {/* E. Society */}
            <SectionCard title="E. Contribution to Society" subtitle="Max 10 marks" accent="#10b981">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Activity</th>
                    <th style={S.th}>Details</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {society.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}>{r.label}</td>
                      <td style={S.td}><TI val={r.details} onChange={(v) => setSoc(i, "details", v)} /></td>
                      <td style={S.td}><DocCell id={`soc-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`soc-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setSoc(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setSoc(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f0fdf4" }}>
                    <td style={S.tdBold} colSpan={5}>Total (Max 10)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{societyScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
            </SectionCard>

            {/* F. Industry */}
            <SectionCard title="F. Industry Connect Activity" subtitle="Max 5 marks" accent="#f97316">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Industry Name</th>
                    <th style={S.th}>Details of Activity</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {industry.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.name} onChange={(v) => setInd(i, "name", v)} /></td>
                      <td style={S.td}><TI val={r.details} onChange={(v) => setInd(i, "details", v)} /></td>
                      <td style={S.td}><DocCell id={`ind-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`ind-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setInd(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setInd(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setInd(i, "director", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setIndustry((p) => [...p, { name: "", details: "", score: "", hod: "", director: "" }])}
                onDel={() => setIndustry((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={industry.length > 1} />
            </SectionCard>

            {/* G. ACR */}
            <SectionCard title="G. Annual Confidential Report (ACR)" subtitle="Max 25 marks" accent="#ef4444">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Criterion</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {acr.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}>{r.label}</td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setAcrRow(i, "hod", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.director} onChange={(v) => setAcrRow(i, "director", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#fef2f2" }}>
                    <td style={S.tdBold} colSpan={2}>Total (Max 25)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{acrScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
            </SectionCard>
          </div>
        )}

        {/* ══ PART B ══ */}
        {activeTab === "partB" && (
          <div style={S.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={S.sectionTitle}>PART B — Research & Academic Contribution</h2>
                <p style={S.sectionDesc}>Enter scores and attach supporting documents. Max: 375 marks.</p>
              </div>
              <div style={{ padding: "7px 16px", borderRadius: 9, background: "#0ea5e922", color: "#0ea5e9", fontWeight: 700, fontSize: 14 }}>
                Total: {partBTotal.toFixed(1)}/375
              </div>
            </div>

            {/* B1 Journals */}
            <SectionCard title="1. Research Papers / Journal Publications" subtitle="Max 120 marks" accent="#6366f1">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Title of Paper</th>
                    <th style={S.th}>Journal Name</th>
                    <th style={S.th}>ISSN No.</th>
                    <th style={S.th}>Index (SCI/Scopus)</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setJour(i, "title", v)} /></td>
                      <td style={S.td}><TI val={r.journal} onChange={(v) => setJour(i, "journal", v)} /></td>
                      <td style={S.tdC}><TI val={r.issn} onChange={(v) => setJour(i, "issn", v)} center /></td>
                      <td style={S.tdC}><TI val={r.index} onChange={(v) => setJour(i, "index", v)} center /></td>
                      <td style={S.td}><DocCell id={`jour-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`jour-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setJour(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setJour(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={S.tdBold} colSpan={7}>Total (Max 120)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{journalScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setJournals((p) => [...p, { title: "", journal: "", issn: "", index: "", score: "", hod: "" }])}
                onDel={() => setJournals((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={journals.length > 1} />
            </SectionCard>

            {/* B2 Books */}
            <SectionCard title="2. Books / Chapters Published" subtitle="Max 50 marks" accent="#0ea5e9">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Title</th>
                    <th style={S.th}>Book/Editor/Publisher</th>
                    <th style={S.th}>ISSN/ISBN</th>
                    <th style={S.th}>Publisher Type</th>
                    <th style={S.th}>Co-authors (DYPIU)</th>
                    <th style={S.th}>First Author?</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setBook(i, "title", v)} /></td>
                      <td style={S.td}><TI val={r.book} onChange={(v) => setBook(i, "book", v)} /></td>
                      <td style={S.tdC}><TI val={r.issn} onChange={(v) => setBook(i, "issn", v)} center /></td>
                      <td style={S.td}><TI val={r.pub} onChange={(v) => setBook(i, "pub", v)} /></td>
                      <td style={S.tdC}><TI val={r.coauth} onChange={(v) => setBook(i, "coauth", v)} center /></td>
                      <td style={S.tdC}><TI val={r.first} onChange={(v) => setBook(i, "first", v)} center /></td>
                      <td style={S.td}><DocCell id={`book-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`book-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setBook(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setBook(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setBooks((p) => [...p, { title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "", hod: "" }])}
                onDel={() => setBooks((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={books.length > 1} />
            </SectionCard>

            {/* B3 ICT */}
            <SectionCard title="3. ICT mediated Teaching Learning Pedagogy" subtitle="Max 20 marks" accent="#8b5cf6">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Title</th>
                    <th style={S.th}>Short Description</th>
                    <th style={S.th}>Type / Module</th>
                    <th style={S.th}>No. of Quadrants</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {ict.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setIctRow(i, "title", v)} /></td>
                      <td style={S.td}><TI val={r.desc} onChange={(v) => setIctRow(i, "desc", v)} /></td>
                      <td style={S.td}><TI val={r.type} onChange={(v) => setIctRow(i, "type", v)} /></td>
                      <td style={S.tdC}><TI val={r.quad} onChange={(v) => setIctRow(i, "quad", v)} center /></td>
                      <td style={S.td}><DocCell id={`ict-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`ict-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setIctRow(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setIctRow(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f5f3ff" }}>
                    <td style={S.tdBold} colSpan={7}>Total (Max 20)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{ictScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setIct((p) => [...p, { title: "", desc: "", type: "", quad: "", score: "", hod: "" }])}
                onDel={() => setIct((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={ict.length > 1} />
            </SectionCard>

            {/* B4a Research Guidance */}
            <SectionCard title="4a. Research Guidance" subtitle="Max 30 marks (PhD–20, PG–10)" accent="#f59e0b">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Degree</th>
                    <th style={S.th}>Student Name</th>
                    <th style={S.th}>Thesis Submitted / Degree Awarded (with date)</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {research.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.tdC}><TI val={r.degree} onChange={(v) => setRes(i, "degree", v)} center /></td>
                      <td style={S.td}><TI val={r.name} onChange={(v) => setRes(i, "name", v)} /></td>
                      <td style={S.td}><TI val={r.thesis} onChange={(v) => setRes(i, "thesis", v)} /></td>
                      <td style={S.td}><DocCell id={`res-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`res-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setRes(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setRes(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setResearch((p) => [...p, { degree: "PhD", name: "", thesis: "", score: "", hod: "" }])}
                onDel={() => setResearch((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={research.length > 1} />
            </SectionCard>

            {/* B4b Projects2 */}
            <SectionCard title="4b & 4c. Research Projects / Consultancy" subtitle="Max 45 marks" accent="#10b981">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Project Title</th>
                    <th style={S.th}>Funding Agency</th>
                    <th style={S.th}>Sanction Date</th>
                    <th style={S.th}>Grant (₹ Lakhs)</th>
                    <th style={S.th}>Role (PI/Co-PI)</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {projects2.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setPrj2(i, "title", v)} /></td>
                      <td style={S.td}><TI val={r.agency} onChange={(v) => setPrj2(i, "agency", v)} /></td>
                      <td style={S.tdC}><TI val={r.date} onChange={(v) => setPrj2(i, "date", v)} center /></td>
                      <td style={S.tdC}><TI val={r.amount} onChange={(v) => setPrj2(i, "amount", v)} center /></td>
                      <td style={S.tdC}><TI val={r.role} onChange={(v) => setPrj2(i, "role", v)} center /></td>
                      <td style={S.td}><TI val={r.status} onChange={(v) => setPrj2(i, "status", v)} /></td>
                      <td style={S.td}><DocCell id={`prj2-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`prj2-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setPrj2(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setPrj2(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setProjects2((p) => [...p, { title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "" }])}
                onDel={() => setProjects2((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={projects2.length > 1} />
            </SectionCard>

            {/* B5a Patents */}
            <SectionCard title="5a. Patents" subtitle="Max 30 marks" accent="#ef4444">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Patent Title</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th}>File No.</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {patents.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setPat(i, "title", v)} /></td>
                      <td style={S.td}><TI val={r.type} onChange={(v) => setPat(i, "type", v)} /></td>
                      <td style={S.tdC}><TI val={r.date} onChange={(v) => setPat(i, "date", v)} center /></td>
                      <td style={S.td}><TI val={r.status} onChange={(v) => setPat(i, "status", v)} /></td>
                      <td style={S.tdC}><TI val={r.fileNo} onChange={(v) => setPat(i, "fileNo", v)} center /></td>
                      <td style={S.td}><DocCell id={`pat-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`pat-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setPat(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setPat(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setPatents((p) => [...p, { title: "", type: "", date: "", status: "", fileNo: "", score: "", hod: "" }])}
                onDel={() => setPatents((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={patents.length > 1} />
            </SectionCard>

            {/* B5b Awards */}
            <SectionCard title="5b. Awards / Fellowships" subtitle="Max 20 marks" accent="#f97316">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Award Title</th>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Awarding Agency</th>
                    <th style={S.th}>Level</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {awards.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setAwd(i, "title", v)} /></td>
                      <td style={S.tdC}><TI val={r.date} onChange={(v) => setAwd(i, "date", v)} center /></td>
                      <td style={S.td}><TI val={r.agency} onChange={(v) => setAwd(i, "agency", v)} /></td>
                      <td style={S.td}><TI val={r.level} onChange={(v) => setAwd(i, "level", v)} /></td>
                      <td style={S.td}><DocCell id={`awd-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`awd-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setAwd(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setAwd(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setAwards((p) => [...p, { title: "", date: "", agency: "", level: "", score: "", hod: "" }])}
                onDel={() => setAwards((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={awards.length > 1} />
            </SectionCard>

            {/* B6 Conferences */}
            <SectionCard title="6. Conferences / Papers Presented / Session Chair" subtitle="Max 30 marks" accent="#6366f1">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Paper Title / Activity</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Organizer</th>
                    <th style={S.th}>Level</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {confs.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setConf(i, "title", v)} /></td>
                      <td style={S.td}><TI val={r.type} onChange={(v) => setConf(i, "type", v)} /></td>
                      <td style={S.td}><TI val={r.org} onChange={(v) => setConf(i, "org", v)} /></td>
                      <td style={S.td}><TI val={r.level} onChange={(v) => setConf(i, "level", v)} /></td>
                      <td style={S.td}><DocCell id={`conf-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`conf-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setConf(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setConf(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#eff6ff" }}>
                    <td style={S.tdBold} colSpan={7}>Total (Max 30)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{confScore.toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setConfs((p) => [...p, { title: "", type: "", org: "", level: "", score: "", hod: "" }])}
                onDel={() => setConfs((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={confs.length > 1} />
            </SectionCard>

            {/* B7 Proposals */}
            <SectionCard title="7. Research Proposals / Products / Technology Transfer" subtitle="Max 20 marks" accent="#0ea5e9">
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Title</th>
                    <th style={S.th}>Duration</th>
                    <th style={S.th}>Funding Agency</th>
                    <th style={S.th}>Amount</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.title} onChange={(v) => setProp(i, "title", v)} /></td>
                      <td style={S.tdC}><TI val={r.duration} onChange={(v) => setProp(i, "duration", v)} center /></td>
                      <td style={S.td}><TI val={r.agency} onChange={(v) => setProp(i, "agency", v)} /></td>
                      <td style={S.tdC}><TI val={r.amount} onChange={(v) => setProp(i, "amount", v)} center /></td>
                      <td style={S.td}><DocCell id={`prop-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`prop-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setProp(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setProp(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setProposals((p) => [...p, { title: "", duration: "", agency: "", amount: "", score: "", hod: "" }])}
                onDel={() => setProposals((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={proposals.length > 1} />
            </SectionCard>

            {/* B8 Self Dev */}
            <SectionCard title="8. Self Development (FDP / Training)" subtitle="Max 10 marks" accent="#10b981">
              <div style={S.subHead}>FDP / Workshops / Seminars Attended</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Program Name</th>
                    <th style={S.th}>Duration</th>
                    <th style={S.th}>Organizing Institution</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {fdps.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.program} onChange={(v) => setFdp(i, "program", v)} /></td>
                      <td style={S.tdC}><TI val={r.duration} onChange={(v) => setFdp(i, "duration", v)} center /></td>
                      <td style={S.td}><TI val={r.org} onChange={(v) => setFdp(i, "org", v)} /></td>
                      <td style={S.td}><DocCell id={`fdp-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`fdp-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setFdp(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setFdp(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <RowBtns onAdd={() => setFdps((p) => [...p, { program: "", duration: "", org: "", score: "", hod: "" }])}
                onDel={() => setFdps((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={fdps.length > 1} />

              <div style={{ ...S.subHead, marginTop: 12 }}>Industrial / Professional Training</div>
              <table style={S.t}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: 30 }}>SN</th>
                    <th style={S.th}>Company / Organization</th>
                    <th style={S.th}>Duration</th>
                    <th style={S.th}>Nature of Training</th>
                    <th style={S.th}>Attachment</th>
                    <th style={S.th}>View Docs</th>
                    <th style={S.th}>Faculty Score</th>
                    <th style={S.th}>HOD Score</th>
                    <th style={S.th}>Director Score</th>
                  </tr>
                </thead>
                <tbody>
                  {training.map((r, i) => (
                    <tr key={i} style={i % 2 === 1 ? { background: "#f8fafc" } : {}}>
                      <td style={S.tdC}>{i + 1}</td>
                      <td style={S.td}><TI val={r.company} onChange={(v) => setTrain(i, "company", v)} /></td>
                      <td style={S.tdC}><TI val={r.duration} onChange={(v) => setTrain(i, "duration", v)} center /></td>
                      <td style={S.td}><TI val={r.nature} onChange={(v) => setTrain(i, "nature", v)} /></td>
                      <td style={S.td}><DocCell id={`train-${i}`} docs={docs} setDocs={setDocs} /></td>
                      <td style={S.viewCell}><ViewCell id={`train-${i}`} docs={docs} /></td>
                      <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setTrain(i, "score", v)} center /></td>
                      <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setTrain(i, "hod", v)} center /></td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f0fdf4" }}>
                    <td style={S.tdBold} colSpan={6}>Self Development Total (FDP + Training, Max 10)</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{(fdpScore + trainScore).toFixed(1)}</td>
                    <td style={S.scoreCell}></td>
                  </tr>
                </tbody>
              </table>
              <RowBtns onAdd={() => setTraining((p) => [...p, { company: "", duration: "", nature: "", score: "", hod: "" }])}
                onDel={() => setTraining((p) => p.length > 1 ? p.slice(0, -1) : p)} canDel={training.length > 1} />
            </SectionCard>
          </div>
        )}

        {/* ══ SUMMARY ══ */}
        {activeTab === "summary" && (
          <div style={S.panel}>
            <h2 style={S.sectionTitle}>Summary of API Scores — AY {info.ay}</h2>
            <div style={{ background: g.color + "15", border: `2px solid ${g.color}40`, borderRadius: 11, padding: "18px 24px", textAlign: "center", marginBottom: 22 }}>
              <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Overall Grade</div>
              <div style={{ fontSize: 27, fontWeight: 800, color: g.color, marginBottom: 3 }}>{g.label}</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>Grand Total: {grandTotal.toFixed(1)} / 575 ({pct(grandTotal, 575)}%)</div>
            </div>

            <table style={S.t}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 50 }}>Sr.No.</th>
                  <th style={S.th}>Criteria</th>
                  <th style={{ ...S.th, width: 80 }}>Max Score</th>
                  <th style={{ ...S.th, width: 90 }}>Faculty Score</th>
                  <th style={{ ...S.th, width: 90 }}>HOD Score</th>
                  <th style={{ ...S.th, width: 90 }}>Director Score</th>
                  
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: "#dbeafe" }}>
                  <td style={{ ...S.tdBold, textAlign: "center" }}>I</td>
                  <td style={S.tdBold} colSpan={5}>PART A — 360° Degree Feedback (Max 200)</td>
                </tr>
                {[
                  ["A", "Teaching Process", 100, teachingRaw.toFixed(1)],
                  ["B", "Students' Feedback", 10, stuFeedbackScore.toFixed(1)],
                  ["C", "Departmental Activities", 20, deptScore.toFixed(1)],
                  ["D", "University Activity", 30, uniScore.toFixed(1)],
                  ["E", "Contribution to Society", 10, societyScore.toFixed(1)],
                  ["F", "Industry Connect", 5, industryScore.toFixed(1)],
                  ["G", "Annual Confidential Report", 25, acrScore.toFixed(1)],
                ].map(([sn, label, max, val]) => (
                  <tr key={sn}>
                    <td style={{ ...S.tdC, fontWeight: "bold" }}>{sn}</td>
                    <td style={S.td}>{label}</td>
                    <td style={S.tdC}>{max}</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{val}</td>
                    <td style={S.scoreCell}></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                ))}
                <tr style={{ background: "#fef3c7", fontWeight: "bold" }}>
                  <td style={S.tdBold} colSpan={2}>Marks Obtained in Part A</td>
                  <td style={S.tdC}><strong>200</strong></td>
                  <td style={{ ...S.scoreCell, fontWeight: "bold", color: "#1e3a5f", fontSize: 14 }}>{partATotal.toFixed(1)}</td>
                  <td style={S.scoreCell}></td>
                  <td style={S.scoreCell}></td>
                </tr>
                <tr style={{ background: "#dbeafe" }}>
                  <td style={{ ...S.tdBold, textAlign: "center" }}>II</td>
                  <td style={S.tdBold} colSpan={5}>PART B — Research & Academic Contribution (Max 375)</td>
                </tr>
                {[
                  ["1", "Research Papers / Journal Publications", 120, journalScore.toFixed(1)],
                  ["2", "Books / Book Chapters", 50, bookScore.toFixed(1)],
                  ["3", "ICT Teaching Learning Pedagogy", 20, ictScore.toFixed(1)],
                  ["4", "Research Guidance + Projects + Consultancy", 75, (researchScore + projectBScore).toFixed(1)],
                  ["5", "Patents, Awards, Fellowship", 50, (patentScore + awardScore).toFixed(1)],
                  ["6", "Conferences / Papers Presented", 30, confScore.toFixed(1)],
                  ["7", "Research Proposals / Products", 20, proposalScore.toFixed(1)],
                  ["8", "Self Development (FDP + Training)", 10, (fdpScore + trainScore).toFixed(1)],
                ].map(([sn, label, max, val]) => (
                  <tr key={sn}>
                    <td style={{ ...S.tdC, fontWeight: "bold" }}>{sn}</td>
                    <td style={S.td}>{label}</td>
                    <td style={S.tdC}>{max}</td>
                    <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{val}</td>
                    <td style={S.scoreCell}></td>
                    <td style={S.scoreCell}></td>
                  </tr>
                ))}
                <tr style={{ background: "#fef3c7", fontWeight: "bold" }}>
                  <td style={S.tdBold} colSpan={2}>Total Score Part B</td>
                  <td style={S.tdC}><strong>375</strong></td>
                  <td style={{ ...S.scoreCell, fontWeight: "bold", color: "#1e3a5f", fontSize: 14 }}>{partBTotal.toFixed(1)}</td>
                  <td style={S.scoreCell}></td>
                  <td style={S.scoreCell}></td>
                </tr>
                <tr style={{ background: "#d1fae5", fontWeight: "bold" }}>
                  <td style={S.tdBold} colSpan={2}>GRAND TOTAL (Part A + Part B)</td>
                  <td style={S.tdC}><strong>575</strong></td>
                  <td style={{ ...S.scoreCell, fontWeight: "bold", color: "#065f46", fontSize: 15 }}>{grandTotal.toFixed(1)}</td>
                  <td style={S.scoreCell}></td>
                  <td style={S.scoreCell}></td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 10 }}>Remarks by Authorities</div>
              {[
                ["1. Remark by Head of Department", "hod"],
                ["2. Remark by School Director", "dir"],
                ["3. Remarks by Dean", "dean"],
                ["4. Approval by Vice Chancellor", "vc"],
              ].map(([label, key]) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "#334155", marginBottom: 3 }}>{label}</div>
                  <textarea value={remarks[key]} onChange={(e) => setRemarks((p) => ({ ...p, [key]: e.target.value }))}
                    rows={2} style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 5, padding: "7px 9px", fontSize: 12, fontFamily: "Georgia, serif", resize: "vertical", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, borderTop: "1px solid #f1f5f9", paddingTop: 14, marginTop: 7 }}>
              I certify that the information provided is correct as per records available with the university and / or documents enclosed along with the duly filled PBAS proforma.
            </div>

            <div style={{ textAlign: "center", marginTop: 22 }}>
              <button style={S.submitBtn}>✔  Submit Appraisal Form</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page: { display: "flex", minHeight: "100vh", fontFamily: "'Georgia', serif", background: "#f0ede8", color: "#1e293b" },
  sidebar: { width: 250, minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column", padding: "22px 18px", gap: 22, position: "sticky", top: 0, alignSelf: "flex-start", flexShrink: 0 },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 },
  logoTitle: { color: "#f1f5f9", fontWeight: 700, fontSize: 13 },
  logoSub: { color: "#64748b", fontSize: 9, lineHeight: 1.3 },
  nav: { display: "flex", flexDirection: "column", gap: 3, flex: 1 },
  navBtn: { background: "none", border: "none", color: "#94a3b8", textAlign: "left", padding: "9px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 8, fontFamily: "'Georgia', serif", width: "100%" },
  navBtnActive: { background: "#1e293b", color: "#f1f5f9" },
  navIcon: { fontSize: 13 },
  sidebarProgress: { padding: "0 4px" },
  progressLabel: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 5 },
  progressTrack: { background: "#1e293b", borderRadius: 4, height: 5, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 0.4s" },
  sidebarFooter: { display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid #1e293b", paddingTop: 16 },
  avatar: { width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#0ea5e9)", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 },
  avatarName: { color: "#e2e8f0", fontSize: 12, fontWeight: 600 },
  avatarDept: { color: "#64748b", fontSize: 10 },

  main: { flex: 1, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16, overflowX: "auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: -0.5 },
  pageSubtitle: { margin: "3px 0 0", color: "#64748b", fontSize: 11 },
  gradePill: { padding: "5px 14px", borderRadius: 18, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  cards: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 },
  card: { background: "#fff", borderRadius: 11, padding: "13px 15px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  cardLabel: { color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 },
  cardVal: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  cardMax: { fontSize: 12, color: "#94a3b8", fontWeight: 400 },
  miniBarWrap: { background: "#f1f5f9", borderRadius: 4, height: 4, margin: "7px 0 3px", overflow: "hidden" },
  miniBar: { height: "100%", borderRadius: 4, transition: "width .4s" },
  cardPct: { color: "#94a3b8", fontSize: 10 },

  panel: { background: "#fff", borderRadius: 12, padding: "22px 24px", boxShadow: "0 1px 6px rgba(0,0,0,.06)" },
  sectionTitle: { margin: "0 0 3px", fontSize: 18, fontWeight: 700, color: "#0f172a" },
  sectionDesc: { margin: "0 0 16px", color: "#64748b", fontSize: 12, lineHeight: 1.6 },

  sectionCard: { background: "#fff", borderRadius: 9, boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 16, overflow: "hidden", border: "1px solid #e2e8f0" },
  sectionCardHeader: { padding: "11px 15px", borderBottom: "1px solid #f1f5f9" },
  sectionCardTitle: { fontWeight: 700, fontSize: 13 },
  sectionCardSub: { color: "#64748b", fontSize: 11, marginTop: 2 },
  sectionCardBody: { padding: "13px 15px" },

  subHead: { fontWeight: 700, fontSize: 11, color: "#475569", fontStyle: "italic", marginBottom: 6, marginTop: 3 },

  t: { width: "100%", borderCollapse: "collapse", marginBottom: 6, fontSize: 11 },
  th: { border: "1px solid #cbd5e1", padding: "5px 6px", background: "#0f172a", color: "#94a3b8", fontWeight: 700, textAlign: "center", verticalAlign: "middle", fontSize: 10 },
  td: { border: "1px solid #e2e8f0", padding: "4px 7px", verticalAlign: "top" },
  tdC: { border: "1px solid #e2e8f0", padding: "4px 7px", textAlign: "center", verticalAlign: "middle" },
  tdBold: { border: "1px solid #e2e8f0", padding: "4px 7px", fontWeight: "bold", verticalAlign: "middle" },
  scoreCell: { border: "1px solid #e2e8f0", padding: "3px 5px", textAlign: "center", verticalAlign: "middle", minWidth: 55, background: "#f8fafc" },
  viewCell: { border: "1px solid #e2e8f0", padding: "4px 5px", verticalAlign: "top", minWidth: 110, background: "#fafbff" },
  inp: { width: "100%", border: "none", outline: "none", fontSize: 11, fontFamily: "'Georgia', serif", background: "transparent", padding: 0 },
  inpCenter: { width: "100%", border: "none", outline: "none", fontSize: 11, fontFamily: "'Georgia', serif", background: "transparent", padding: 0, textAlign: "center" },

  // Multi-file doc cell
  docCellWrap: { display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" },
  docPill: { display: "inline-flex", alignItems: "center", gap: 4, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 4, padding: "2px 6px", fontSize: 10, maxWidth: 160 },
  docPillName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 },
  docPillDel: { background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 10, padding: 0, lineHeight: 1 },
  dropArea: { display: "inline-flex", alignItems: "center", gap: 5, border: "1.5px dashed #cbd5e1", borderRadius: 4, padding: "3px 8px", cursor: "pointer", background: "#f8fafc", marginTop: 1 },
  viewBtn: { display: "inline-block", color: "#3b82f6", fontSize: 10, cursor: "pointer", textDecoration: "underline", fontFamily: "'Georgia', serif" },

  rowBtnWrap: { display: "flex", gap: 5, marginBottom: 7 },
  addBtn: { fontSize: 10, padding: "3px 10px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontFamily: "'Georgia', serif" },
  delBtn: { fontSize: 10, padding: "3px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontFamily: "'Georgia', serif" },

  infoTable: { width: "100%", borderCollapse: "collapse", marginBottom: 7 },
  infoLabel: { padding: "7px 10px", background: "#f8fafc", fontWeight: 600, fontSize: 12, border: "1px solid #e2e8f0", width: "35%" },
  infoCell: { padding: "5px 9px", border: "1px solid #e2e8f0" },
  infoInput: { border: "none", borderBottom: "1.5px solid #cbd5e1", outline: "none", fontSize: 12, fontFamily: "'Georgia', serif", width: "100%", background: "transparent", padding: "2px 0" },

  overviewCard: { background: "#f8fafc", borderRadius: 11, padding: "13px 15px", border: "1px solid #e2e8f0" },
  submitBtn: { padding: "13px 44px", background: "#0f172a", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, letterSpacing: .5, cursor: "pointer", borderRadius: 7, fontFamily: "'Georgia', serif" },
};
