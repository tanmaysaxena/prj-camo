export function Inline({ tint }: { tint: string }) {
  return (
    <div
      style={{
        color: "#f00",
        background: "var(--color-surface-base)",
        borderColor: "red",
        outlineColor: tint,
        width: 10,
      }}
    />
  );
}
