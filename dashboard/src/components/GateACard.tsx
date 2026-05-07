// GateACard — shipped to / as part of FORGE-363 Mission Control
// Previously inlined in page.tsx; extracted as a reusable component.

type Props = {
  mergesThisWeek: number;
  approvalRate: number;
  total4w: number;
  band: "A" | "B" | "C";
};

export default function GateACard({ mergesThisWeek, approvalRate, total4w, band }: Props) {
  const bandColor = band === "A" ? "#3fb950" : band === "B" ? "#d29922" : "#f85149";
  const bandLabel = band === "A" ? "A-week" : band === "B" ? "B-week" : "C-week";

  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-2"
      style={{ backgroundColor: "#161b22", borderColor: "#30363d" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider" style={{ color: "#8b949e" }}>
          Gate-A This Week
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{
            color: bandColor,
            backgroundColor: `${bandColor}15`,
            border: `1px solid ${bandColor}40`,
          }}
        >
          {bandLabel}
        </span>
      </div>
      <div className="flex items-baseline gap-4">
        <div>
          <div className="text-3xl font-bold tabular-nums" style={{ color: bandColor }}>
            {mergesThisWeek}
          </div>
          <div className="text-xs" style={{ color: "#8b949e" }}>
            merges · target ≥5
          </div>
        </div>
        <div className="border-l pl-4" style={{ borderColor: "#30363d" }}>
          <div
            className="text-3xl font-bold tabular-nums"
            style={{ color: total4w > 0 ? bandColor : "#8b949e" }}
          >
            {total4w > 0 ? `${approvalRate}%` : "—"}
          </div>
          <div className="text-xs" style={{ color: "#8b949e" }}>
            1st-pass approval · 4w rolling · target ≥85%
          </div>
        </div>
      </div>
    </div>
  );
}
