import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = true, badge, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        overflow: "hidden",
      }}
      data-testid={`collapsible-section-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          borderBottom: open ? "0.5px solid #e2e8f0" : "none",
        }}
        data-testid={`collapsible-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{title}</span>
          {badge !== undefined && (
            <span
              style={{
                fontSize: 11,
                padding: "1px 7px",
                borderRadius: 999,
                background: "#f1f5f9",
                color: "#64748b",
                border: "0.5px solid #e2e8f0",
                fontWeight: 500,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          color="#94a3b8"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>
      {open && (
        <div style={{ padding: 16 }} data-testid={`collapsible-body-${title.toLowerCase().replace(/\s+/g, "-")}`}>
          {children}
        </div>
      )}
    </div>
  );
}
