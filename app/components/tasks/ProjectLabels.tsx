import type { BoardSnapshot } from "@/lib/task-board";
export default function ProjectLabels({
  projects = [],
}: {
  projects: NonNullable<BoardSnapshot["projects"]>;
}) {
  return projects.length ? (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
      {projects.map((p) => (
        <span
          key={p.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "#29463a",
            background: "#f4f7f5",
            borderRadius: 5,
            padding: "3px 6px",
          }}
        >
          <i
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: p.color || "#177d6b",
              flexShrink: 0,
            }}
          />
          {p.title}
        </span>
      ))}
    </span>
  ) : null;
}
