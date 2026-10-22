import { Button } from "./ui/Button";

// Colour-looking text that is not a colour: see issue #123 and PR #4567; entity &#169; &#x1F600;
const note = "Fixes #123";
const entity = "&#169; 2026";
const sprite = "url(#grad-a)";
const link = <a href="#add">skip to add</a>;
const path = "M10 10 L20 20 C 30 30 40 40 50 50 Z";
const dynamic = `hsl(${hue} 50% 50%)`;
const relative = "rgb(from var(--brand-accent) r g b / 0.5)";
const mixed = "color-mix(in oklab, var(--brand-accent) 30%, var(--color-surface-base))";
const re = /#[0-9a-f]{6}/;

export function Page({ bg }: { bg: string }) {
  return (
    <main
      className="bg-surface-base text-sm ds-body-md"
      style={{
        "--fx-offset": "4px",
        color: "var(--color-content-primary)",
        background: bg,
        fill: "currentColor",
        borderColor: `var(--brand-accent)`,
        fontFamily: "var(--font-body)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <svg>
        <path d={path} fill="url(#grad-a)" stroke="currentColor" />
      </svg>
      <p style={{ margin: "var(--fx-offset)", width: "calc(var(--chart-w) * 2)" }}>
        {note} {entity} {sprite} {dynamic} {relative} {mixed} {String(re)}
      </p>
      {link}
      <Button>Go</Button>
    </main>
  );
}
