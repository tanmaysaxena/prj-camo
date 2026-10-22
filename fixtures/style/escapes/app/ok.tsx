// camo-ok: brand logo colour is fixed by the trademark
export const a = "#fff";
export const b = "#eee"; // camo-ok: legacy export format needs literal hex
// camo-ok:
export const c = "#ddd";
export const d = "#ccc"; // camo-ok(raw-element): scoped to another rule, so this colour is still reported
export function F() {
  return (
    <>
      {/* camo-ok(raw-element): wrapper component */}
      <button>x</button>
      <button>y</button>
    </>
  );
}
