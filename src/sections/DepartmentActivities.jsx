import React, { useState } from "react";

const DepartmentActivities = ({ setScore }) => {
  const [count, setCount] = useState("");

  const calculate = () => {
    setScore(Number(count) * 3);
  };

  return (
    <div>
      <h4>Department Activities</h4>

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

export default DepartmentActivities;