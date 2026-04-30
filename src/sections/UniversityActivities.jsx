import React, { useState } from "react";

const UniversityActivities = ({ setScore }) => {
  const [count, setCount] = useState("");

  const calculate = () => {
    setScore(Number(count) * 10);
  };

  return (
    <div>
      <h4>University Activities</h4>

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

export default UniversityActivities;