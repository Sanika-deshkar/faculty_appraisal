export default function AppraisalHeaderImage({ height = 52, style = {} }) {
  return (
    <img
      src="/image.png"
      alt="DYPIU"
      style={{
        height,
        width: "auto",
        maxWidth: "min(32vw, 260px)",
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
