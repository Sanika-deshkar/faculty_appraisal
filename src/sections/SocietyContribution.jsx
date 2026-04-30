import React, { useState } from "react";

const SocietyContribution = ({ setScore }) => {
  const [count, setCount] = useState("");

  const calculate = () => {
    setScore(Number(count) * 5);
  };

  return (
    <div>
      <h4>Contribution to Society</h4>

      <input
        type="number"
        placeholder="No. of Activities"
        value={count}
        onChange={(e) => setCount(e.target.value)}
      />

      <button onClick={calculate}>Calculate</button>
    </div>
  );
};

export default SocietyContribution;