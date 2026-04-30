export default function SummaryTable({
  teachingScore, feedbackScore, deptScore, uniScore,
  societyScore, industryScore, acrScore, partATotal,
  researchScore, bookScore, ictScore, guideScore,
  patentScore, confScore, proposalScore, selfDevScore, finalScore
}) {
  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h3>Score Summary</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f4f6fb" }}>
            <th style={th}>Section</th>
            <th style={th}>Score</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Teaching Process", teachingScore],
            ["Student Feedback", feedbackScore],
            ["Department Activities", deptScore],
            ["University Activities", uniScore],
            ["Society Contribution", societyScore],
            ["Industry Connect", industryScore],
            ["ACR", acrScore],
            ["Part A Total", partATotal],
            ["Research", researchScore],
            ["Books", bookScore],
            ["ICT", ictScore],
            ["Guidance", guideScore],
            ["Patents", patentScore],
            ["Conferences", confScore],
            ["Proposals", proposalScore],
            ["Self Development", selfDevScore],
          ].map(([label, score]) => (
            <tr key={label}>
              <td style={td}>{label}</td>
              <td style={td}>{score}</td>
            </tr>
          ))}
          <tr style={{ background: "#667eea", color: "white" }}>
            <td style={td}><strong>Final Total</strong></td>
            <td style={td}><strong>{finalScore} / 375</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e2e8f0" };
const td = { padding: "8px 12px", borderBottom: "1px solid #edf2f7" };