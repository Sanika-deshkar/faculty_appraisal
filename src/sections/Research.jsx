import React, { useState } from "react";

const Research = ({
  setResearchScore,
  setBookScore,
  setIctScore,
  setGuideScore,
  setPatentScore,
  setConfScore,
  setProposalScore,
  setSelfDevScore,
}) => {
  const [papers, setPapers] = useState("");
  const [books, setBooks] = useState("");

  const calculate = () => {
    setResearchScore(Number(papers) * 10);
    setBookScore(Number(books) * 5);
    setIctScore(10);
    setGuideScore(15);
    setPatentScore(10);
    setConfScore(5);
    setProposalScore(5);
    setSelfDevScore(5);
  };

  return (
    <div>
      <h4>Research & Academic Contribution</h4>

      <input
        type="number"
        placeholder="No. of Research Papers"
        value={papers}
        onChange={(e) => setPapers(e.target.value)}
      />

      <input
        type="number"
        placeholder="No. of Books"
        value={books}
        onChange={(e) => setBooks(e.target.value)}
      />

      <button onClick={calculate}>Calculate Research Score</button>
    </div>
  );
};

export default Research;