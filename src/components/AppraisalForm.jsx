import React, { useState } from "react";

// Sections
import TeachingProcess from "../sections/TeachingProcess";
import StudentFeedback from "../sections/StudentFeedback";
import DepartmentActivities from "../sections/DepartmentActivities";
import UniversityActivities from "../sections/UniversityActivities";
import SocietyContribution from "../sections/SocietyContribution";
import IndustryConnect from "../sections/IndustryConnect";
import ACR from "../sections/ACR";
import Research from "../sections/Research";

// Component
import SummaryTable from "../components/SummaryTable";

function AppraisalForm() {
  // 🔹 PART A STATES
  const [teachingScore, setTeachingScore] = useState(0);
  const [feedbackScore, setFeedbackScore] = useState(0);
  const [deptScore, setDeptScore] = useState(0);
  const [uniScore, setUniScore] = useState(0);
  const [societyScore, setSocietyScore] = useState(0);
  const [industryScore, setIndustryScore] = useState(0);
  const [acrScore, setAcrScore] = useState(0);

  // 🔹 PART B STATES
  const [researchScore, setResearchScore] = useState(0);
  const [bookScore, setBookScore] = useState(0);
  const [ictScore, setIctScore] = useState(0);
  const [guideScore, setGuideScore] = useState(0);
  const [patentScore, setPatentScore] = useState(0);
  const [confScore, setConfScore] = useState(0);
  const [proposalScore, setProposalScore] = useState(0);
  const [selfDevScore, setSelfDevScore] = useState(0);

  // 🔥 TOTAL CALCULATIONS
  const partATotal =
    teachingScore +
    feedbackScore +
    deptScore +
    uniScore +
    societyScore +
    industryScore +
    acrScore;

  const finalScore =
    partATotal +
    researchScore +
    bookScore +
    ictScore +
    guideScore +
    patentScore +
    confScore +
    proposalScore +
    selfDevScore;

  const handleSubmit = () => {
    alert("Form Submitted Successfully!");
    // later: send data to backend
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Faculty Appraisal Form</h2>

      {/* 🔥 SUMMARY TABLE (TOP) */}
      <SummaryTable
        teachingScore={teachingScore}
        feedbackScore={feedbackScore}
        deptScore={deptScore}
        uniScore={uniScore}
        societyScore={societyScore}
        industryScore={industryScore}
        acrScore={acrScore}
        partATotal={partATotal}
        researchScore={researchScore}
        bookScore={bookScore}
        ictScore={ictScore}
        guideScore={guideScore}
        patentScore={patentScore}
        confScore={confScore}
        proposalScore={proposalScore}
        selfDevScore={selfDevScore}
        finalScore={finalScore}
      />

      <hr />

      {/* 🟦 PART A */}
      <h3>PART A</h3>

      <TeachingProcess setScore={setTeachingScore} />

      <StudentFeedback setScore={setFeedbackScore} />

      <DepartmentActivities setScore={setDeptScore} />

      <UniversityActivities setScore={setUniScore} />

      <SocietyContribution setScore={setSocietyScore} />

      <IndustryConnect setScore={setIndustryScore} />

      <ACR setScore={setAcrScore} />

      <hr />

      {/* 🟩 PART B */}
      <h3>PART B - Research & Academic Contribution</h3>

      <Research
        setResearchScore={setResearchScore}
        setBookScore={setBookScore}
        setIctScore={setIctScore}
        setGuideScore={setGuideScore}
        setPatentScore={setPatentScore}
        setConfScore={setConfScore}
        setProposalScore={setProposalScore}
        setSelfDevScore={setSelfDevScore}
      />

      <hr />

      {/* 🔥 FINAL SCORE */}
      <h2>Total Score: {finalScore} / 375</h2>

      {/* OPTIONAL PROGRESS BAR */}
      <progress value={finalScore} max="375" />

      <br /><br />

      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

export default AppraisalForm;