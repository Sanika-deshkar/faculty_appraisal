import React, { useState } from "react";

const IndustryConnect = ({ setScore }) => {
  const [companies, setCompanies] = useState("");

  const calculate = () => {
    setScore(Number(companies) * 5);
  };

  return (
    <div>
      <h4>Industry Connect</h4>

      <input
        type="number"
        placeholder="No. of Companies"
        value={companies}
        onChange={(e) => setCompanies(e.target.value)}
      />

      <button onClick={calculate}>Calculate</button>
    </div>
  );
};

export default IndustryConnect;