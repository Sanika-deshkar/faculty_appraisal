import React, { useState } from "react";

const TeachingProcess = ({ setScore }) => {
  const [total, setTotal] = useState("");
  const [conducted, setConducted] = useState("");

  const calculateScore = () => {
    const t = Number(total);
    const c = Number(conducted);

    if (!t || !c) return;

    const percent = (c / t) * 100;
    let score = 0;

    if (percent < 70) score = 0;
    else if (percent === 100) score = 50;
    else if (percent >= 91) score = 47.5;
    else if (percent >= 81) score = 42.5;
    else score = 37.5;

    setScore(score);
  };

  return (
    <div>
      <h4>Teaching Process</h4>

      <input
        type="number"
        placeholder="Total Classes"
        value={total}
        onChange={(e) => setTotal(e.target.value)}
      />

      <input
        type="number"
        placeholder="Conducted Classes"
        value={conducted}
        onChange={(e) => setConducted(e.target.value)}
      />

      <button onClick={calculateScore}>Calculate</button>
    </div>
  );
};

export default TeachingProcess;