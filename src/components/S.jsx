import { useState, useRef } from "react";

// ─── helpers ────────────────────────────────────────────────────────────────
const emptyRows = (n) => Array.from({ length: n }, () => ({}));

const S = {
  // layout
  page: { fontFamily: "'Times New Roman', Times, serif", background: "#f0ede8", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px" },
  sheet: { background: "#fff", width: "100%", maxWidth: 960, boxShadow: "0 4px 32px rgba(0,0,0,0.18)", padding: "32px 40px 48px" },

  // header
  uniName: { textAlign: "center", fontWeight: "bold", fontSize: 20, letterSpacing: 1, marginBottom: 2 },
  uniSub: { textAlign: "center", fontSize: 14, marginBottom: 4 },
  formTitle: { textAlign: "center", fontWeight: "bold", fontSize: 17, textDecoration: "underline", marginBottom: 14 },
  yearRow: { textAlign: "center", fontWeight: "bold", fontSize: 13, marginBottom: 18 },

  // faculty info table
  infoTable: { width: "100%", borderCollapse: "collapse", marginBottom: 20 },

  // section headers
  partHeader: { fontWeight: "bold", fontSize: 15, marginTop: 28, marginBottom: 6, textDecoration: "underline" },
  secHeader: { fontWeight: "bold", fontSize: 13, marginTop: 18, marginBottom: 6 },
  subSecHeader: { fontWeight: "bold", fontSize: 12, marginTop: 14, marginBottom: 4, fontStyle: "italic" },
  noteText: { fontSize: 11, fontStyle: "italic", marginBottom: 6, color: "#444" },

  // THE TABLE
  t: { width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 12 },
  th: { border: "1px solid #222", padding: "5px 8px", background: "#d6e4f0", fontWeight: "bold", textAlign: "center", verticalAlign: "middle" },
  td: { border: "1px solid #222", padding: "4px 7px", verticalAlign: "top" },
  tdCenter: { border: "1px solid #222", padding: "4px 7px", textAlign: "center", verticalAlign: "middle" },
  tdBold: { border: "1px solid #222", padding: "4px 7px", fontWeight: "bold", verticalAlign: "middle" },
  inp: { width: "100%", border: "none", outline: "none", fontSize: 12, fontFamily: "'Times New Roman', Times, serif", background: "transparent", padding: 0 },
  inpCenter: { width: "100%", border: "none", outline: "none", fontSize: 12, fontFamily: "'Times New Roman', Times, serif", background: "transparent", padding: 0, textAlign: "center" },
  scoreCell: { border: "1px solid #222", padding: "4px 6px", textAlign: "center", verticalAlign: "middle", minWidth: 48 },

  // summary highlight
  summaryTotalRow: { background: "#fef3c7", fontWeight: "bold" },
  summaryFinalRow: { background: "#d1fae5", fontWeight: "bold" },

  // doc upload
  docZone: { marginTop: 4 },
  dropArea: { border: "1.5px dashed #94a3b8", borderRadius: 4, padding: "4px 8px", cursor: "pointer", background: "#f8fafc", display: "flex", alignItems: "center", gap: 6 },
  docPill: { display: "inline-flex", alignItems: "center", gap: 5, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 4, padding: "2px 7px", fontSize: 11 },
  verifiedDot: { color: "#10b981", fontWeight: "bold" },

  // submit
  submitWrap: { textAlign: "center", marginTop: 36 },
  submitBtn: { padding: "12px 48px", background: "#1e3a5f", color: "#fff", border: "none", fontSize: 14, fontWeight: "bold", letterSpacing: 1, cursor: "pointer", borderRadius: 3 },
  disabledBtn: { padding: "12px 48px", background: "#94a3b8", color: "#fff", border: "none", fontSize: 14, fontWeight: "bold", letterSpacing: 1, cursor: "not-allowed", borderRadius: 3 },

  // signature area
  sigRow: { display: "flex", justifyContent: "space-between", marginTop: 32, fontSize: 12 },
  sigLine: { borderTop: "1px solid #222", width: 180, textAlign: "center", paddingTop: 4, marginTop: 32 },
  remarksBox: { border: "1px solid #222", minHeight: 48, padding: 6, marginBottom: 8 },
};

// ─── DocCell: inline doc upload inside a table cell ─────────────────────────
function DocCell({ id, docs, setDocs }) {
  const ref = useRef();
  const doc = docs[id];

  const handleFile = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setDocs((p) => ({ ...p, [id]: { name: file.name, url, type: file.type } }));
  };

  if (doc) return (
    <div style={S.docPill}>
      <span style={S.verifiedDot}>✔</span>
      <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
      <button onClick={() => setDocs((p) => ({ ...p, [id]: null }))}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 11, padding: 0 }}>✕</button>
    </div>
  );

  return (
    <div style={S.dropArea} onClick={() => ref.current.click()}>
      <span style={{ fontSize: 11, color: "#64748b" }}>📎 Attach</span>
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])} />
    </div>
  );
}

// ─── editable input helpers ─────────────────────────────────────────────────
function TI({ val, onChange, center, bold }) {
  return (
    <input value={val} onChange={(e) => onChange(e.target.value)}
      style={center ? { ...S.inpCenter, fontWeight: bold ? "bold" : undefined } : { ...S.inp, fontWeight: bold ? "bold" : undefined }} />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Dashboard() {
  // Faculty info
  const [info, setInfo] = useState({ name: "", qual: "", desig: "", ay: "20__-20__" });
  const inf = (k) => (v) => setInfo((p) => ({ ...p, [k]: v }));

  // ── PART A state ──
  // A1 lectures
  const [lectures, setLectures] = useState(
    Array.from({ length: 4 }, (_, i) => ({ sem: "", code: "", planned: "", conducted: "", score: "", hod: "" }))
  );
  const setLec = (i, k, v) => setLectures((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // A2 course file
  const [courseFile, setCourseFile] = useState({ course: "", title: "", details: "", score: "", hod: "" });

  // A3 innovative teaching
  const [innovScore, setInnovScore] = useState("");
  const [innovHod, setInnovHod] = useState("");

  // A4 project
  const [projects, setProjects] = useState([
    { label: "Project guided (3/batch)", score: "", hod: "", dir: "" },
    { label: "Industrial collaboration / Sponsorship (Max 5)", score: "", hod: "", dir: "" },
    { label: "Award received (Max 5 marks)", score: "", hod: "", dir: "" },
    { label: "Project outcome: events/publications (Max 5)", score: "", hod: "", dir: "" },
  ]);
  const setProj = (i, k, v) => setProjects((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // A5 qualification
  const [quals, setQuals] = useState([
    { label: "Higher Qualification achieved (5 Marks)", score: "", hod: "", dir: "" },
    { label: "Add-on Qualification / Certification (Max 5)", score: "", hod: "", dir: "" },
  ]);
  const setQual = (i, k, v) => setQuals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Student feedback
  const [feedback, setFeedback] = useState(
    Array.from({ length: 4 }, () => ({ code: "", fb1: "", fb2: "", avg: "", score: "", hod: "", dir: "" }))
  );
  const setFb = (i, k, v) => setFeedback((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Dept activities
  const [deptActs, setDeptActs] = useState(
    Array.from({ length: 4 }, () => ({ activity: "", nature: "", score: "", hod: "", dir: "" }))
  );
  const setDept = (i, k, v) => setDeptActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // University activities
  const [uniActs, setUniActs] = useState(
    Array.from({ length: 4 }, () => ({ activity: "", nature: "", score: "", hod: "", dir: "" }))
  );
  const setUni = (i, k, v) => setUniActs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Society
  const societyLabels = ["Induction Program", "Unnat Bharat Abhiyan", "Yoga Classes", "Blood Donation",
    "Techno Social activities", "NSS", "Social visits", "Project of Social Impact", "Any other activity"];
  const [society, setSociety] = useState(societyLabels.map((l) => ({ label: l, details: "", score: "", hod: "", dir: "" })));
  const setSoc = (i, k, v) => setSociety((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Industry connect
  const [industry, setIndustry] = useState(
    Array.from({ length: 3 }, () => ({ name: "", details: "", score: "", hod: "", dir: "" }))
  );
  const setInd = (i, k, v) => setIndustry((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // ACR
  const acrLabels = [
    "Self-motivation and Proactiveness",
    "Punctuality",
    "Target based work",
    "Effectiveness",
    "Obedience",
  ];
  const [acr, setAcr] = useState(acrLabels.map((l) => ({ label: l, hod: "", dir: "" })));
  const setAcrRow = (i, k, v) => setAcr((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // PART B
  const [journals, setJournals] = useState(Array.from({ length: 4 }, () => ({ title: "", journal: "", issn: "", index: "", score: "", hod: "", dir: "" })));
  const setJour = (i, k, v) => setJournals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [books, setBooks] = useState(Array.from({ length: 3 }, () => ({ title: "", book: "", issn: "", pub: "", coauth: "", first: "", score: "", hod: "", dir: "" })));
  const setBook = (i, k, v) => setBooks((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [ict, setIct] = useState(Array.from({ length: 3 }, () => ({ title: "", desc: "", type: "", quad: "", score: "", hod: "", dir: "" })));
  const setIctRow = (i, k, v) => setIct((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [research, setResearch] = useState(Array.from({ length: 3 }, () => ({ degree: "ME/PhD", name: "", thesis: "", score: "", hod: "", dir: "" })));
  const setRes = (i, k, v) => setResearch((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [projects2, setProjects2] = useState(Array.from({ length: 3 }, () => ({ title: "", agency: "", date: "", amount: "", role: "", status: "", score: "", hod: "", dir: "" })));
  const setPrj2 = (i, k, v) => setProjects2((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [patents, setPatents] = useState(Array.from({ length: 3 }, () => ({ title: "", type: "", date: "", status: "", fileNo: "", score: "", hod: "", dir: "" })));
  const setPat = (i, k, v) => setPatents((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [awards, setAwards] = useState(Array.from({ length: 3 }, () => ({ title: "", date: "", agency: "", level: "", score: "", hod: "", dir: "" })));
  const setAwd = (i, k, v) => setAwards((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [confs, setConfs] = useState(Array.from({ length: 4 }, () => ({ title: "", type: "", org: "", level: "", score: "", hod: "", dir: "" })));
  const setConf = (i, k, v) => setConfs((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [proposals, setProposals] = useState(Array.from({ length: 3 }, () => ({ title: "", duration: "", agency: "", amount: "", score: "", hod: "", dir: "" })));
  const setProp = (i, k, v) => setProposals((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [products, setProducts] = useState(Array.from({ length: 3 }, () => ({ details: "", used: "", score: "", hod: "", dir: "" })));
  const setProd = (i, k, v) => setProducts((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [fdps, setFdps] = useState(Array.from({ length: 4 }, () => ({ program: "", duration: "", org: "", score: "", hod: "", dir: "" })));
  const setFdp = (i, k, v) => setFdps((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const [training, setTraining] = useState(Array.from({ length: 3 }, () => ({ company: "", duration: "", nature: "", score: "", hod: "", dir: "" })));
  const setTrain = (i, k, v) => setTraining((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Summary scores (auto from Part A fields + Part B fields)
  const n = (v) => parseFloat(v) || 0;

  const totalLecScore = lectures.reduce((a, r) => a + n(r.score), 0);
  const courseFileScore = n(courseFile.score);
  const innovTotal = n(innovScore);
  const projectTotal = projects.reduce((a, r) => a + n(r.score), 0);
  const qualTotal = quals.reduce((a, r) => a + n(r.score), 0);
  const teachingProcessRaw = totalLecScore + courseFileScore + innovTotal + projectTotal + qualTotal;
  const teachingProcessScaled = Math.min(25, +(teachingProcessRaw * 25 / 100).toFixed(1));

  const stuFeedbackScore = feedback.reduce((a, r) => a + n(r.score), 0);
  const deptScore = deptActs.reduce((a, r) => a + n(r.score), 0);
  const uniScore = uniActs.reduce((a, r) => a + n(r.score), 0);
  const societyScore = society.reduce((a, r) => a + n(r.score), 0);
  const industryScore = industry.reduce((a, r) => a + n(r.score), 0);
  const acrScore = acr.reduce((a, r) => a + n(r.hod), 0);

  const partATotal = Math.min(200, teachingProcessScaled + stuFeedbackScore + deptScore + uniScore + societyScore + industryScore + acrScore);

  const journalScore = journals.reduce((a, r) => a + n(r.score), 0);
  const bookScore = books.reduce((a, r) => a + n(r.score), 0);
  const ictScore = ict.reduce((a, r) => a + n(r.score), 0);
  const researchScore = research.reduce((a, r) => a + n(r.score), 0);
  const projectBScore = projects2.reduce((a, r) => a + n(r.score), 0);
  const patentScore = patents.reduce((a, r) => a + n(r.score), 0);
  const awardScore = awards.reduce((a, r) => a + n(r.score), 0);
  const confScore = confs.reduce((a, r) => a + n(r.score), 0);
  const proposalScore = proposals.reduce((a, r) => a + n(r.score), 0);
  const productScore = products.reduce((a, r) => a + n(r.score), 0);
  const fdpScore = fdps.reduce((a, r) => a + n(r.score), 0);
  const trainScore = training.reduce((a, r) => a + n(r.score), 0);

  const partBTotal = journalScore + bookScore + ictScore + researchScore + projectBScore +
    patentScore + awardScore + confScore + proposalScore + productScore + fdpScore + trainScore;

  const grandTotal = partATotal + partBTotal;

  // Documents
  const [docs, setDocs] = useState({});

  const DOC_KEYS = ["lecture", "courseFile", "innov", "project", "qual", "feedback",
    "dept", "uni", "society", "industry", "acr", "journals", "books", "ict",
    "research", "patents", "awards", "conf", "proposal", "selfdev"];
  const uploadedCount = DOC_KEYS.filter((k) => docs[k]).length;

  // Remarks
  const [remarks, setRemarks] = useState({ hod: "", dir: "", dean: "", vc: "" });

  return (
    <div style={S.page}>
      <div style={S.sheet}>

        {/* ── HEADER ── */}
        <div style={S.uniName}>D Y PATIL INTERNATIONAL UNIVERSITY</div>
        <div style={S.uniSub}>Akurdi, Pune</div>
        <div style={S.formTitle}>Faculty Appraisal Form</div>
        <div style={S.yearRow}>Academic Year : <input value={info.ay} onChange={(e) => inf("ay")(e.target.value)}
          style={{ border: "none", borderBottom: "1px solid #555", fontSize: 13, fontWeight: "bold", fontFamily: "'Times New Roman'", width: 100, textAlign: "center" }} /></div>

        {/* Faculty Info */}
        <table style={S.infoTable}>
          <tbody>
            {[["Name of Faculty", "name"], ["Educational Qualifications", "qual"], ["Present Designation", "desig"]].map(([label, key]) => (
              <tr key={key}>
                <td style={{ ...S.th, width: "38%", textAlign: "left" }}>{label}</td>
                <td style={S.td}><TI val={info[key]} onChange={inf(key)} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ════════════════════════════════════════ PART A ════════════════════════════════════════ */}
        <div style={S.partHeader}>PART A</div>

        {/* A. Teaching Process */}
        <div style={S.secHeader}>A. Teaching Process</div>

        {/* A(i) Lectures */}
        <div style={S.subSecHeader}>(i) Lectures, Tutorials, Practicals, Mini/Major project etc. (Max marks 50)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Semester</th>
              <th style={S.th}>Course Code / Name</th>
              <th style={S.th}>No. of Classes (as per course structure)</th>
              <th style={S.th}>No. of actually conducted classes</th>
              <th style={{ ...S.th, colspan: 3 }}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={5}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Signature</th>
            </tr>
          </thead>
          <tbody>
            {lectures.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.sem} onChange={(v) => setLec(i, "sem", v)} /></td>
                <td style={S.td}><TI val={r.code} onChange={(v) => setLec(i, "code", v)} /></td>
                <td style={S.tdCenter}><TI val={r.planned} onChange={(v) => setLec(i, "planned", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.conducted} onChange={(v) => setLec(i, "conducted", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setLec(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setLec(i, "hod", v)} center /></td>
                <td style={S.scoreCell}></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={5}>Total</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{totalLecScore}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={8} style={{ ...S.td, fontSize: 11 }}>
                Document: <DocCell id="lecture" docs={docs} setDocs={setDocs} />
              </td>
            </tr>
          </tbody>
        </table>
        <div style={S.noteText}>* Lecture (L), Seminar (S), Tutorial (T), Practical (P), Contact Hours (C)</div>

        {/* A(ii) Course File */}
        <div style={S.subSecHeader}>(ii) Course file (Max. marks : 20)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Course / Paper</th>
              <th style={S.th}>Title</th>
              <th style={S.th}>Details (Yes/No) with proofs</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={4}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Signature</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.tdCenter}>1</td>
              <td style={S.td}><TI val={courseFile.course} onChange={(v) => setCourseFile((p) => ({ ...p, course: v }))} /></td>
              <td style={S.td}><TI val={courseFile.title} onChange={(v) => setCourseFile((p) => ({ ...p, title: v }))} /></td>
              <td style={S.td}><TI val={courseFile.details} onChange={(v) => setCourseFile((p) => ({ ...p, details: v }))} /></td>
              <td style={S.scoreCell}><TI val={courseFile.score} onChange={(v) => setCourseFile((p) => ({ ...p, score: v }))} center /></td>
              <td style={S.scoreCell}><TI val={courseFile.hod} onChange={(v) => setCourseFile((p) => ({ ...p, hod: v }))} center /></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={7} style={S.td}><DocCell id="courseFile" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* A(iii) Innovative teaching */}
        <div style={S.subSecHeader}>(iii) Use of participatory and innovative teaching-learning methodologies (max marks 10)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Short Description</th>
              <th style={S.th}>Details (Yes/No) with proofs</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={3}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Signature</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.tdCenter}>1</td>
              <td style={{ ...S.td, fontSize: 11, color: "#444" }}>
                Blended learning, Virtual Lab, Conceptual videos, LMS, Project Based Learning, OCW, Quiz,
                Group Discussion, Flip classroom, Any other innovative methods
              </td>
              <td style={S.td}></td>
              <td style={S.scoreCell}><TI val={innovScore} onChange={setInnovScore} center /></td>
              <td style={S.scoreCell}><TI val={innovHod} onChange={setInnovHod} center /></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td style={S.tdBold} colSpan={3}>Total Score (Max : 10)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{n(innovScore)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={6} style={S.td}><DocCell id="innov" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* A(iv) Project */}
        <div style={S.subSecHeader}>(iv) Project (Max marks: 10)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Project</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={2}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}>{r.label}</td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setProj(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setProj(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setProj(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={2}>Total marks (Max : 10)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{projectTotal.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={5} style={S.td}><DocCell id="project" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* A(v) Qualification */}
        <div style={S.subSecHeader}>(v) Qualification Enhancement (10 Marks)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Description</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={2}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {quals.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}>{r.label}</td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setQual(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setQual(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setQual(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={2}>Total Marks (Max 10)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{qualTotal.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={5} style={S.td}><DocCell id="qual" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* Teaching Process Summary */}
        <table style={S.t}>
          <tbody>
            <tr style={{ background: "#e8f0fe" }}>
              <td style={S.tdBold} colSpan={2}>Marks obtained in Teaching Process (Max Point 25)</td>
            </tr>
            <tr>
              <td style={S.tdBold}>Total marks out of 100 (i+ii+iii+iv+v)</td>
              <td style={S.tdBold}>Marks Scaled to out of 25</td>
            </tr>
            <tr>
              <td style={S.tdCenter}>{teachingProcessRaw.toFixed(1)}</td>
              <td style={S.tdCenter}><strong>{teachingProcessScaled}</strong></td>
            </tr>
          </tbody>
        </table>

        {/* B. Student Feedback */}
        <div style={S.secHeader}>B. Students' Feedback (Max marks 10)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Course Code / Name</th>
              <th style={S.th} colSpan={3}>Average Student Feedback (scale of 5)</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={2}></th>
              <th style={S.th}>First</th>
              <th style={S.th}>Second</th>
              <th style={S.th}>Average</th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {feedback.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.code} onChange={(v) => setFb(i, "code", v)} /></td>
                <td style={S.tdCenter}><TI val={r.fb1} onChange={(v) => setFb(i, "fb1", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.fb2} onChange={(v) => setFb(i, "fb2", v)} center /></td>
                <td style={S.tdCenter}>
                  {r.fb1 && r.fb2 ? ((n(r.fb1) + n(r.fb2)) / 2).toFixed(2) : <TI val={r.avg} onChange={(v) => setFb(i, "avg", v)} center />}
                </td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setFb(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setFb(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setFb(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={5}>Total (Average)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{stuFeedbackScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={8} style={S.td}><DocCell id="feedback" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* C. Departmental Activities */}
        <div style={S.secHeader}>C. Departmental / School Activities (Max marks 20)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Activity</th>
              <th style={S.th}>Nature of Activity</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={3}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {deptActs.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.activity} onChange={(v) => setDept(i, "activity", v)} /></td>
                <td style={S.td}><TI val={r.nature} onChange={(v) => setDept(i, "nature", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setDept(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setDept(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setDept(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={3}>Total (Max 20)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{deptScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={6} style={S.td}><DocCell id="dept" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* D. University Activities */}
        <div style={S.secHeader}>D. University Level Activities (Max marks 30)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>Sr.No.</th>
              <th style={S.th}>Activity</th>
              <th style={S.th}>Nature of Activity</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={3}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {uniActs.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.activity} onChange={(v) => setUni(i, "activity", v)} /></td>
                <td style={S.td}><TI val={r.nature} onChange={(v) => setUni(i, "nature", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setUni(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setUni(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setUni(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={3}>Total</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{uniScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={6} style={S.td}><DocCell id="uni" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* E. Society */}
        <div style={S.secHeader}>E. Contribution to Society (Max marks 10)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>Sr.No.</th>
              <th style={S.th}>Activity</th>
              <th style={S.th}>Details of Activity</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={3}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {society.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}>{r.label}</td>
                <td style={S.td}><TI val={r.details} onChange={(v) => setSoc(i, "details", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setSoc(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setSoc(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setSoc(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={3}>Total (Maximum 10 Marks)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{societyScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={6} style={S.td}><DocCell id="society" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* F. Industry Connect */}
        <div style={S.secHeader}>F. Industry Connect Activity (Max. marks 5)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>Sr.No.</th>
              <th style={S.th}>Name of the Industry</th>
              <th style={S.th}>Details of Activity</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={3}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {industry.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.name} onChange={(v) => setInd(i, "name", v)} /></td>
                <td style={S.td}><TI val={r.details} onChange={(v) => setInd(i, "details", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setInd(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setInd(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setInd(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={6} style={S.td}><DocCell id="industry" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* G. ACR */}
        <div style={S.secHeader}>G. Annual Confidential Report (Max. marks 25)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.N.</th>
              <th style={S.th}>Subject</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={2}></th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
              <th style={S.th}>Signature</th>
            </tr>
          </thead>
          <tbody>
            {acr.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><strong>{r.label}</strong></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setAcrRow(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setAcrRow(i, "dir", v)} center /></td>
                <td style={S.scoreCell}></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={2}>Total score</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{acrScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={5} style={S.td}><DocCell id="acr" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* PART A SUMMARY */}
        <div style={S.secHeader}>PART A Score Summary</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Particular</th>
              <th style={S.th}>Max</th>
              <th style={S.th}>Faculty Score</th>
              <th style={S.th}>HoD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["A", "Teaching Process (i+ii+iii+iv+v)", 100, teachingProcessRaw.toFixed(1)],
              ["B", "Students' Feedback", 10, stuFeedbackScore.toFixed(1)],
              ["C", "Departmental Activities", 20, deptScore.toFixed(1)],
              ["D", "University Activity", 30, uniScore.toFixed(1)],
              ["E", "Contribution to Society", 10, societyScore.toFixed(1)],
              ["F", "Industry Connect", 5, industryScore.toFixed(1)],
              ["G", "Annual Confidential Report", 25, acrScore.toFixed(1)],
            ].map(([sn, label, max, val]) => (
              <tr key={sn}>
                <td style={S.tdCenter}><strong>{sn}</strong></td>
                <td style={S.td}>{label}</td>
                <td style={S.tdCenter}>{max}</td>
                <td style={S.tdCenter}><strong>{val}</strong></td>
                <td style={S.scoreCell}></td>
                <td style={S.scoreCell}></td>
              </tr>
            ))}
            <tr style={S.summaryTotalRow}>
              <td style={S.tdBold} colSpan={2}>PART A Total Score out of 200</td>
              <td style={S.tdCenter}><strong>200</strong></td>
              <td style={S.tdCenter}><strong style={{ color: "#1e3a5f", fontSize: 14 }}>{partATotal.toFixed(1)}</strong></td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
          </tbody>
        </table>

        {/* ════════════════════════════════════════ PART B ════════════════════════════════════════ */}
        <div style={S.partHeader}>PART B — RESEARCH AND ACADEMIC CONTRIBUTIONS</div>

        {/* B1 Journals */}
        <div style={S.secHeader}>1. Published Papers in Journals (Max. marks 120)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>Sr.No.</th>
              <th style={S.th}>Title with page Nos.</th>
              <th style={S.th}>Journal details</th>
              <th style={S.th}>ISSN/ISBN No.</th>
              <th style={S.th}>Indexing (Scopus/SCI/SCIE/UGC)</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={5}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {journals.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setJour(i, "title", v)} /></td>
                <td style={S.td}><TI val={r.journal} onChange={(v) => setJour(i, "journal", v)} /></td>
                <td style={S.tdCenter}><TI val={r.issn} onChange={(v) => setJour(i, "issn", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.index} onChange={(v) => setJour(i, "index", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setJour(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setJour(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setJour(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={8} style={S.td}><DocCell id="journals" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B2 Books */}
        <div style={S.secHeader}>2. Articles / Chapters published in Books (Max. marks 50)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>Sr.No.</th>
              <th style={S.th}>Title with page Nos.</th>
              <th style={S.th}>Book Title, editor & publisher</th>
              <th style={S.th}>ISSN/ISBN No.</th>
              <th style={S.th}>Type of Publisher</th>
              <th style={S.th}>Co-authors from DYPIU</th>
              <th style={S.th}>First Author?</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={7}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {books.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setBook(i, "title", v)} /></td>
                <td style={S.td}><TI val={r.book} onChange={(v) => setBook(i, "book", v)} /></td>
                <td style={S.tdCenter}><TI val={r.issn} onChange={(v) => setBook(i, "issn", v)} center /></td>
                <td style={S.td}><TI val={r.pub} onChange={(v) => setBook(i, "pub", v)} /></td>
                <td style={S.tdCenter}><TI val={r.coauth} onChange={(v) => setBook(i, "coauth", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.first} onChange={(v) => setBook(i, "first", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setBook(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setBook(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setBook(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={10} style={S.td}><DocCell id="books" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B3 ICT */}
        <div style={S.secHeader}>3. ICT mediated Teaching Learning Pedagogy (Max. marks 20)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Title</th>
              <th style={S.th}>Short Description / Contribution</th>
              <th style={S.th}>Type of Pedagogy / Modules / E-content</th>
              <th style={S.th}>No. of Quadrants</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={5}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {ict.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setIctRow(i, "title", v)} /></td>
                <td style={S.td}><TI val={r.desc} onChange={(v) => setIctRow(i, "desc", v)} /></td>
                <td style={S.td}><TI val={r.type} onChange={(v) => setIctRow(i, "type", v)} /></td>
                <td style={S.tdCenter}><TI val={r.quad} onChange={(v) => setIctRow(i, "quad", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setIctRow(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setIctRow(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setIctRow(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={4}></td>
              <td style={S.tdBold}>Total</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{ictScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={8} style={S.td}><DocCell id="ict" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B4a Research Guidance */}
        <div style={S.secHeader}>4a. Research Guidance (Max. marks 30 : PhD – 20, PG – 10)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>Sr.No.</th>
              <th style={S.th}>Degree</th>
              <th style={S.th}>Name of Students</th>
              <th style={S.th}>Thesis Submitted / Degree Awarded (with date)</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={4}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {research.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.tdCenter}><TI val={r.degree} onChange={(v) => setRes(i, "degree", v)} center /></td>
                <td style={S.td}><TI val={r.name} onChange={(v) => setRes(i, "name", v)} /></td>
                <td style={S.td}><TI val={r.thesis} onChange={(v) => setRes(i, "thesis", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setRes(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setRes(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setRes(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={7} style={S.td}><DocCell id="research" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B4b Research Projects */}
        <div style={S.secHeader}>4b & 4c. Ongoing / Completed Research Projects & Consultancy (Max. 45)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Title of Research Project</th>
              <th style={S.th}>Funding Agency</th>
              <th style={S.th}>Date of Sanction</th>
              <th style={S.th}>Grant (Rs. Lakhs)</th>
              <th style={S.th}>PI/Co-PI/Consultant</th>
              <th style={S.th}>Status</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={7}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {projects2.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setPrj2(i, "title", v)} /></td>
                <td style={S.td}><TI val={r.agency} onChange={(v) => setPrj2(i, "agency", v)} /></td>
                <td style={S.tdCenter}><TI val={r.date} onChange={(v) => setPrj2(i, "date", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.amount} onChange={(v) => setPrj2(i, "amount", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.role} onChange={(v) => setPrj2(i, "role", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.status} onChange={(v) => setPrj2(i, "status", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setPrj2(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setPrj2(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setPrj2(i, "dir", v)} center /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* B5a Patents */}
        <div style={S.secHeader}>5a. IPR (Patent / Copyrights / Design / Trademarks) – Max. 40 marks</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Title</th>
              <th style={S.th}>National / International</th>
              <th style={S.th}>Date of Filing</th>
              <th style={S.th}>Status (Published/Granted)</th>
              <th style={S.th}>Patent File No.</th>
              <th style={S.th} colSpan={3}>Research Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={6}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {patents.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setPat(i, "title", v)} /></td>
                <td style={S.tdCenter}><TI val={r.type} onChange={(v) => setPat(i, "type", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.date} onChange={(v) => setPat(i, "date", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.status} onChange={(v) => setPat(i, "status", v)} center /></td>
                <td style={S.tdCenter}><TI val={r.fileNo} onChange={(v) => setPat(i, "fileNo", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setPat(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setPat(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setPat(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={9} style={S.td}><DocCell id="patents" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B5b Awards */}
        <div style={S.secHeader}>5b. Research Awards / Fellowships (Max. 10 marks)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Title of Fellowship / Award</th>
              <th style={S.th}>Date of Award</th>
              <th style={S.th}>Awarding Agency</th>
              <th style={S.th}>International / National</th>
              <th style={S.th} colSpan={3}>Research Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={5}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {awards.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setAwd(i, "title", v)} /></td>
                <td style={S.tdCenter}><TI val={r.date} onChange={(v) => setAwd(i, "date", v)} center /></td>
                <td style={S.td}><TI val={r.agency} onChange={(v) => setAwd(i, "agency", v)} /></td>
                <td style={S.tdCenter}><TI val={r.level} onChange={(v) => setAwd(i, "level", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setAwd(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setAwd(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setAwd(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td colSpan={8} style={S.td}><DocCell id="awards" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B6 Conferences */}
        <div style={S.secHeader}>6. Invited Lectures / Paper Presentations / Conferences / FDP (Max. 30 marks)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>S.No.</th>
              <th style={S.th}>Title / Academic Session with date</th>
              <th style={S.th}>Lecture / Resource Person / Paper / Full Paper</th>
              <th style={S.th}>Organization</th>
              <th style={S.th}>International / National / State / University</th>
              <th style={S.th} colSpan={3}>Research Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={5}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {confs.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setConf(i, "title", v)} /></td>
                <td style={S.tdCenter}><TI val={r.type} onChange={(v) => setConf(i, "type", v)} center /></td>
                <td style={S.td}><TI val={r.org} onChange={(v) => setConf(i, "org", v)} /></td>
                <td style={S.tdCenter}><TI val={r.level} onChange={(v) => setConf(i, "level", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setConf(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setConf(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setConf(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={5}>Total Score (Maximum Score 30)</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{confScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={8} style={S.td}><DocCell id="conf" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B7 Research Proposal */}
        <div style={S.secHeader}>7. Submitted Research Proposal (Max. 10 marks)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Title of Proposal</th>
              <th style={S.th}>Duration</th>
              <th style={S.th}>Funding Agency</th>
              <th style={S.th}>Grant Amount Requested</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={5}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i === 0 ? "01" : `0${i + 1}`}</td>
                <td style={S.td}><TI val={r.title} onChange={(v) => setProp(i, "title", v)} /></td>
                <td style={S.tdCenter}><TI val={r.duration} onChange={(v) => setProp(i, "duration", v)} center /></td>
                <td style={S.td}><TI val={r.agency} onChange={(v) => setProp(i, "agency", v)} /></td>
                <td style={S.tdCenter}><TI val={r.amount} onChange={(v) => setProp(i, "amount", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setProp(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setProp(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setProp(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={5}>Total score</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{proposalScore.toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={8} style={S.td}><DocCell id="proposal" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* B8 Self Development */}
        <div style={S.secHeader}>8. Self Development — FDP / Industrial Training (Max. 10 marks)</div>
        <div style={{ fontSize: 12, marginBottom: 6 }}>a) FDP of one week or more</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Program</th>
              <th style={S.th}>Duration</th>
              <th style={S.th}>Organized by</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={4}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {fdps.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i + 1}</td>
                <td style={S.td}><TI val={r.program} onChange={(v) => setFdp(i, "program", v)} /></td>
                <td style={S.tdCenter}><TI val={r.duration} onChange={(v) => setFdp(i, "duration", v)} center /></td>
                <td style={S.td}><TI val={r.org} onChange={(v) => setFdp(i, "org", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setFdp(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setFdp(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setFdp(i, "dir", v)} center /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 12, marginBottom: 6 }}>b) Industrial Training (Max. 5 marks)</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 32 }}>SN</th>
              <th style={S.th}>Company / Industry</th>
              <th style={S.th}>Duration</th>
              <th style={S.th}>Nature of Training</th>
              <th style={S.th} colSpan={3}>API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={4}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            {training.map((r, i) => (
              <tr key={i}>
                <td style={S.tdCenter}>{i === 0 ? "01" : `0${i + 1}`}</td>
                <td style={S.td}><TI val={r.company} onChange={(v) => setTrain(i, "company", v)} /></td>
                <td style={S.tdCenter}><TI val={r.duration} onChange={(v) => setTrain(i, "duration", v)} center /></td>
                <td style={S.td}><TI val={r.nature} onChange={(v) => setTrain(i, "nature", v)} /></td>
                <td style={S.scoreCell}><TI val={r.score} onChange={(v) => setTrain(i, "score", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.hod} onChange={(v) => setTrain(i, "hod", v)} center /></td>
                <td style={S.scoreCell}><TI val={r.dir} onChange={(v) => setTrain(i, "dir", v)} center /></td>
              </tr>
            ))}
            <tr>
              <td style={S.tdBold} colSpan={4}>Total score</td>
              <td style={{ ...S.scoreCell, fontWeight: "bold" }}>{(fdpScore + trainScore).toFixed(1)}</td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr>
              <td colSpan={7} style={S.td}><DocCell id="selfdev" docs={docs} setDocs={setDocs} /></td>
            </tr>
          </tbody>
        </table>

        {/* ═══════════════ FINAL SUMMARY ═══════════════ */}
        <div style={{ ...S.partHeader, marginTop: 32 }}>IV. SUMMARY OF API SCORES FOR AY {info.ay}</div>
        <table style={S.t}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: 40 }}>Sr.No.</th>
              <th style={S.th}>Criteria</th>
              <th style={{ ...S.th, width: 70 }}>Max Score</th>
              <th style={S.th} colSpan={3}>Total - API Score</th>
            </tr>
            <tr>
              <th style={S.th} colSpan={3}></th>
              <th style={S.th}>Faculty</th>
              <th style={S.th}>HOD</th>
              <th style={S.th}>Director</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: "#dbeafe" }}>
              <td style={S.tdBold}>I</td>
              <td style={S.tdBold} colSpan={5}>360 Degree Feedback</td>
            </tr>
            {[
              ["A", "Teaching Process (i+ii+iii+iv+v)", 100, teachingProcessRaw.toFixed(1)],
              ["B", "Students' Feedback", 10, stuFeedbackScore.toFixed(1)],
              ["C", "Departmental Activities", 20, deptScore.toFixed(1)],
              ["D", "University Activity", 30, uniScore.toFixed(1)],
              ["E", "Contribution to Society", 10, societyScore.toFixed(1)],
              ["F", "Industry Connect", 5, industryScore.toFixed(1)],
              ["G", "Annual Confidential Report", 25, acrScore.toFixed(1)],
            ].map(([sn, label, max, val]) => (
              <tr key={sn}>
                <td style={S.tdCenter}><strong>{sn}</strong></td>
                <td style={S.td}>{label}</td>
                <td style={S.tdCenter}>{max}</td>
                <td style={S.tdCenter}><strong>{val}</strong></td>
                <td style={S.scoreCell}></td>
                <td style={S.scoreCell}></td>
              </tr>
            ))}
            <tr style={S.summaryTotalRow}>
              <td style={S.tdBold} colSpan={2}>Marks obtained in Part A</td>
              <td style={S.tdCenter}><strong>200</strong></td>
              <td style={S.tdCenter}><strong style={{ color: "#1e3a5f", fontSize: 14 }}>{partATotal.toFixed(1)}</strong></td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr style={{ background: "#dbeafe" }}>
              <td style={S.tdBold}>II</td>
              <td style={S.tdBold} colSpan={5}>Part B — Research and Academic Contribution</td>
            </tr>
            {[
              ["1", "Research papers / journal publication", 120, journalScore.toFixed(1)],
              ["2", "Books authored / edited / book chapter", 50, bookScore.toFixed(1)],
              ["3", "ICT, Teaching learning Pedagogy", 20, ictScore.toFixed(1)],
              ["4", "Research guide / PG guide / Consultancy", 75, (researchScore + projectBScore).toFixed(1)],
              ["5", "Patents, Awards, Fellowship", 50, (patentScore + awardScore).toFixed(1)],
              ["6", "Conference attended / paper presented / session chair", 30, confScore.toFixed(1)],
              ["7", "Research proposal", 20, (proposalScore + productScore).toFixed(1)],
              ["8", "Self Development", 10, (fdpScore + trainScore).toFixed(1)],
            ].map(([sn, label, max, val]) => (
              <tr key={sn}>
                <td style={S.tdCenter}><strong>{sn}</strong></td>
                <td style={S.td}>{label}</td>
                <td style={S.tdCenter}>{max}</td>
                <td style={S.tdCenter}><strong>{val}</strong></td>
                <td style={S.scoreCell}></td>
                <td style={S.scoreCell}></td>
              </tr>
            ))}
            <tr style={S.summaryTotalRow}>
              <td style={S.tdBold} colSpan={2}>Total score Part B</td>
              <td style={S.tdCenter}><strong>375</strong></td>
              <td style={S.tdCenter}><strong style={{ color: "#1e3a5f", fontSize: 14 }}>{partBTotal.toFixed(1)}</strong></td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
            <tr style={S.summaryFinalRow}>
              <td style={S.tdBold} colSpan={2}>GRAND TOTAL (Part A + Part B)</td>
              <td style={S.tdCenter}><strong>575</strong></td>
              <td style={S.tdCenter}><strong style={{ color: "#065f46", fontSize: 16 }}>{grandTotal.toFixed(1)}</strong></td>
              <td style={S.scoreCell}></td>
              <td style={S.scoreCell}></td>
            </tr>
          </tbody>
        </table>

        {/* Document status */}
        <div style={{ border: "1px solid #cbd5e1", borderRadius: 4, padding: "10px 16px", marginBottom: 20, background: uploadedCount === DOC_KEYS.length ? "#f0fdf4" : "#fffbeb", fontSize: 12 }}>
          <strong>Documents Uploaded:</strong> {uploadedCount} / {DOC_KEYS.length}
          {uploadedCount < DOC_KEYS.length && <span style={{ color: "#92400e", marginLeft: 8 }}>⚠ {DOC_KEYS.length - uploadedCount} document(s) still pending in the sections above.</span>}
          {uploadedCount === DOC_KEYS.length && <span style={{ color: "#15803d", marginLeft: 8 }}>✔ All documents verified.</span>}
        </div>

        {/* List of Enclosures */}
        <div style={{ fontSize: 12, marginBottom: 16 }}>
          <strong>List of Enclosures:</strong>
          {[1, 2, 3, 4].map((n) => <div key={n} style={{ marginLeft: 16, marginTop: 4 }}>{n}. ___________________________</div>)}
        </div>

        {/* Declaration */}
        <div style={{ fontSize: 12, marginBottom: 20, lineHeight: 1.7 }}>
          I certify that the information provided is correct as per records available with the university and / or documents enclosed along with the duly filled PBAS proforma.
        </div>

        <div style={S.sigRow}>
          <div style={S.sigLine}>Signature of the Faculty</div>
          <div style={S.sigLine}>Place</div>
          <div style={S.sigLine}>Date</div>
        </div>

        {/* Remarks */}
        <div style={{ marginTop: 32 }}>
          <div style={{ ...S.secHeader }}>Remarks by Authorities</div>
          {[
            ["1. Remark by Head of Department", "hod", "Total and grade approved by HOD — Name and Sign"],
            ["2. Remark by School Director", "dir", "Total and grade approved by School Director — Signature"],
            ["3. Remarks by Dean", "dean", "Total and Marks approved by Dean — Signature"],
            ["4. Approval by Vice Chancellor", "vc", "Total Marks and Grade approved"],
          ].map(([label, key, sub]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: "bold", fontSize: 12, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{sub}</div>
              <textarea value={remarks[key]} onChange={(e) => setRemarks((p) => ({ ...p, [key]: e.target.value }))}
                rows={2} style={{ ...S.remarksBox, width: "100%", resize: "vertical", fontFamily: "'Times New Roman'", fontSize: 12 }} />
            </div>
          ))}
        </div>

        {/* Submit */}
        <div style={S.submitWrap}>
          <button style={uploadedCount === DOC_KEYS.length ? S.submitBtn : S.disabledBtn}
            disabled={uploadedCount < DOC_KEYS.length}>
            {uploadedCount === DOC_KEYS.length
              ? "✔  Submit Appraisal Form"
              : `Upload ${DOC_KEYS.length - uploadedCount} more document(s) to submit`}
          </button>
        </div>

      </div>
    </div>
  );
}
