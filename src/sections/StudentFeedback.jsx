import React, { useState } from "react";

const StudentFeedback = ({ setScore }) => {
  const [feedback, setFeedback] = useState("");

  const calculate = () => {
    const value = Number(feedback);
    setScore(value / 10);
  };

  return (
    <div>
      <h4>Student Feedback</h4>

      <input
        type="number"
        placeholder="Feedback %"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />

      <button onClick={calculate}>Calculate</button>
    </div>
  );
};

export default StudentFeedback;