// LIMMIT Logo as base64 data URL for use in PDF and email generation
// This ensures the logo works consistently across all exports

export const LIMMIT_LOGO_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAAAoCAYAAADhWtJeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGFklEQVR4nO2dW3LbOBCG/07t+2hHm31kVuq8MisVO++szErlAJ4DxCfwHCB7guwJsidIvHcnN8nJJDNOMpPYliUSxAVAgwQliiKJJkGg+wMgkZREfOgGQDQAYBjQdq0+7RYCsXwYxGp3qAyAOWQYi4BYrN7ZIqDhSoHqQC1D8R3q/gqAY4K3QCwXzh3FcfRmYGN2Yo+iOLoB8A7AMYBXsAIDi6SfWH0F8SfuZREQTzZs9RuCHtC/ogq1i1T/VwC2AR3hfxMQ48j9x+T5IlDxKdAOFcSVT0KF2iVU8YEQRMC/E88gIEq4iydE7QL5+MBKFfkCgNe0gKcjIIhX/4cngK5q9TIhKtdrZzn+HqjPrIqPMWpZB+p1v6kh/Cf2JIpzQP0B/7tEq5/xNQCHpnWw4iuDmHoA7lMNbRKVAR32YKnYJGT9Sg6AVTzDpyNANZR4APCWFnDFq5g1bMWjJErsQEIOrgB4ROUC4CMqFxS7SLSLJDwCeEkLfgJqJMWr+CBsJVlXNRwlWdcFfAbwHMBzWsD/Eqvpvg/gBQB79M+ISfQYwCFt8BRQ4TFBDdugBa9gwa9oAY8APKIFPKYFvKMFXNMCbtEC7tACrtICntMC/qIFnNACTmgBZ7SAc1rABS3gkhZwRQt4TQu4oQXc0gLuaAH3tIC/aQEPtIBHWsATLeCZFvBCC3ilBfxDC1BwYVqLuBFxI+JGxI2I6z8dES8iXkS8iHgR8SLiRcSLiBcRLyJeRLyIeBHxIuJFxIuIFxEvIl5EvIh4EfEi4kXEi4gXES8iXkS8iHgR8SLiRcSLiBcRLyJeRLyIeBHxIuJFxIuIFxEvIl5EvIh4EfH+A+KmiNsiboq4KeKmiJsibgsukLy6TeQRWwCvYSuJu4C2qMKvxC7Ur1e0YNE+bCPJr6oEVLiFSVzXsInEXURBXBBxjy3I+wmAJ7CAd+z5XwCe0YLfsee7oAU/Y8/3TAv+hz3/Ky34H/b8b7SAB+z5j9nzP7Pnf2HP/4c9/5U9/w17/lv2/Hfs+e/Z8z+w539kz//Env+ZPf8Le/4De/5X9vzv7Pk/2PM/sed/Yc//yp7/jT3/B3v+T/b8X+z5v9nz/2DP/8me/5s9/y97/iN7/hN7/jN7/gt7/it7/ht7/jt7/j/s+R/Y8/9lz//Inv+JPf8ze/4X9vyv7Pnf2PP/Yc//lz3/P/b8/9jzP7Dnf2LP/8ye/4U9/yt7/jf2/H/Y8/9lz/+PPf8De/5H9vxP7Pmf2fO/sOd/Zc//xp7/D3v+v+z5/7Hn/8ee/4E9/yN7/if2/M/s+V/Y87+y539jz/+HPf9f9vz/2PP/Y8//wJ7/kT3/E3v+Z/b8L+z5X9nzv7Hn/8Oe/y97/n/s+f+x539gz//Inv+JPf8ze/4X9vyv7Pnf2PP/Yc//lz3/P/b8/9jzP7Dnf2TP/8Se/5k9/wt7/lf2/G/s+f+w5//Lnv8fe/5/7Pkf2PM/sud/Ys//zJ7/hT3/K3v+N/b8f9jz/2XP/489/z/2/A/s+R/Z8z+x539mz//Cnv+VPf8be/4/7Pn/suf/x57/H3v+B/b8j+z5n9jzP7Pnf2HP/8qe/409/x/2/H/Z8/9jz/+PPf8De/5H9vxP7Pmf2fO/sOd/Zc//xp7/D3v+v+z5/7Hn/8ee/4E9/yN7/if2/M/s+V/Y87+y539jz/+HPf9f9vz/2PP/Y8//wJ7/kT3/E3v+Z/b8L+z5X9nz/8+eTwiJeJGIiHiRiIh4kYiIeJGIiHiRiIh4kYiIeJGIiHiRiIh4kYiIeJGIiHiRiIh4kYiIeJGIiHiRiIh4kYiIeJGIiHiRiIh4kYiIeJGIiHiRiIh4kYiIeJGI6EPEi0RE";

// SVG version of the logo for better quality in web display
export const LIMMIT_LOGO_SVG = `
<svg viewBox="0 0 250 40" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="18" height="18" rx="3" fill="#009ee3"/>
  <rect x="20" y="0" width="18" height="18" rx="3" fill="#1a1a5c"/>
  <rect x="0" y="22" width="18" height="18" rx="3" fill="#1a1a5c"/>
  <rect x="20" y="22" width="18" height="18" rx="3" fill="#009ee3"/>
  <text x="50" y="32" font-family="Arial, sans-serif" font-weight="bold" font-size="32" fill="#1a1a5c">LIMMIT</text>
</svg>
`;

// React component for the logo
export const LimmitLogo = ({ height = 32, className = "" }: { height?: number; className?: string }) => (
  <svg viewBox="0 0 250 40" height={height} className={className}>
    <rect x="0" y="0" width="18" height="18" rx="3" fill="#009ee3"/>
    <rect x="20" y="0" width="18" height="18" rx="3" fill="#1a1a5c"/>
    <rect x="0" y="22" width="18" height="18" rx="3" fill="#1a1a5c"/>
    <rect x="20" y="22" width="18" height="18" rx="3" fill="#009ee3"/>
    <text x="50" y="32" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="32" fill="#1a1a5c">LIMMIT</text>
  </svg>
);

// HTML string for email and PDF generation
export const LIMMIT_LOGO_HTML = `
<div style="display:flex;align-items:center;gap:8px;">
  <div style="display:grid;grid-template-columns:18px 18px;gap:2px;">
    <div style="width:18px;height:18px;background:#009ee3;border-radius:3px;"></div>
    <div style="width:18px;height:18px;background:#1a1a5c;border-radius:3px;"></div>
    <div style="width:18px;height:18px;background:#1a1a5c;border-radius:3px;"></div>
    <div style="width:18px;height:18px;background:#009ee3;border-radius:3px;"></div>
  </div>
  <span style="font-family:Arial,sans-serif;font-weight:bold;font-size:24px;color:#1a1a5c;">LIMMIT</span>
</div>
`;

// Smaller version for headers
export const LIMMIT_LOGO_HTML_SMALL = `
<div style="display:flex;align-items:center;gap:6px;">
  <div style="display:grid;grid-template-columns:12px 12px;gap:2px;">
    <div style="width:12px;height:12px;background:#009ee3;border-radius:2px;"></div>
    <div style="width:12px;height:12px;background:#1a1a5c;border-radius:2px;"></div>
    <div style="width:12px;height:12px;background:#1a1a5c;border-radius:2px;"></div>
    <div style="width:12px;height:12px;background:#009ee3;border-radius:2px;"></div>
  </div>
  <span style="font-family:Arial,sans-serif;font-weight:bold;font-size:18px;color:#1a1a5c;">LIMMIT</span>
</div>
`;

// White version for dark backgrounds
export const LIMMIT_LOGO_HTML_WHITE = `
<div style="display:flex;align-items:center;gap:6px;">
  <div style="display:grid;grid-template-columns:12px 12px;gap:2px;">
    <div style="width:12px;height:12px;background:#009ee3;border-radius:2px;"></div>
    <div style="width:12px;height:12px;background:#ffffff;border-radius:2px;"></div>
    <div style="width:12px;height:12px;background:#ffffff;border-radius:2px;"></div>
    <div style="width:12px;height:12px;background:#009ee3;border-radius:2px;"></div>
  </div>
  <span style="font-family:Arial,sans-serif;font-weight:bold;font-size:18px;color:#ffffff;">LIMMIT</span>
</div>
`;
