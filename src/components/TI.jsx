import React from "react";

const TI = ({ val, onChange, type = "normal" }) => {
  const role = localStorage.getItem("role");

  const canEdit =
    (type === "normal" && role === "faculty") ||
    (type === "facultyScore" && role === "faculty") ||
    (type === "hodScore" && role === "hod") ||
    (type === "directorScore" && role === "director");

  return (
    <input
      value={val || ""}
      onChange={(e) => canEdit && onChange(e.target.value)}
      disabled={!canEdit}
      style={{ width: "90%" }}
    />
  );
};

export default TI;