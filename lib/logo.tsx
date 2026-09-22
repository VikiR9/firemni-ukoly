import Image from "next/image";

// One supplied asset for the workspace, client offers and exports.
export const LIMMIT_LOGO_SRC = "/limmit-logo.png";

export function LimmitLogo({ height = 36, className = "", variant = "dark" }: {
  height?: number;
  className?: string;
  variant?: "dark" | "light";
}) {
  return (
    <span className={className} role="img" aria-label="LIMMIT" style={{
      display: "inline-flex", alignItems: "center", gap: 9, flexShrink: 0,
      color: variant === "light" ? "#ffffff" : "#182d35",
    }}>
      <Image src={LIMMIT_LOGO_SRC} alt="" width={height} height={height}
        style={{ width: height, height, flexShrink: 0, borderRadius: 5 }} />
      <span aria-hidden="true" style={{ fontFamily: "Arial, sans-serif", fontSize: height * .64,
        fontWeight: 800, lineHeight: 1, letterSpacing: 1 }}>LIMMIT</span>
    </span>
  );
}
