// ─── HOD-editable score input ─────────────────────────────────────────────────
export function HodInput({ val, onChange }) {
  return (
    <input
      type="number"
      min="0"
      step="0.5"
      value={val ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 58,
        height: 30,
        boxSizing: "border-box",
        textAlign: "center",
        border: "1.5px solid #6366f1",
        borderRadius: 5,
        padding: "5px 6px",
        fontSize: 11,
        fontFamily: "Georgia, serif",
        outline: "none",
        background: "#f0f4ff",
      }}
    />
  );
}

