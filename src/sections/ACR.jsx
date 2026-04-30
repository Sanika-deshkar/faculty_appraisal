import React, { useState } from "react";

const ACR = ({ setScore }) => {
  const [score, setLocalScore] = useState("");

  const calculate = () => {
    setScore(Number(score));
  };

  return (
    <div>
      <h4>Annual Confidential Report (ACR)</h4>

      <input
        type="number"
        placeholder="Enter Score (Max 25)"
        value={score}
        onChange={(e) => setLocalScore(e.target.value)}
      />

      <button onClick={calculate}>Set Score</button>
    </div>
  );
};

export default ACR;