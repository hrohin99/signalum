import { MapPin } from "lucide-react";

interface TrackingFocusEmptyStateProps {
  topicName: string;
  onSetFocus: () => void;
}

const PURPLE = "#723988";

export function TrackingFocusEmptyState({ topicName, onSetFocus }: TrackingFocusEmptyStateProps) {
  return (
    <div
      data-testid="tracking-focus-empty-state"
      style={{
        background: "linear-gradient(135deg, #EEEDFE 0%, #F5F3FF 100%)",
        border: `1.5px solid ${PURPLE}30`,
        borderRadius: 12,
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: `${PURPLE}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MapPin size={18} style={{ color: PURPLE }} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>Set your tracking focus</p>
          <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
            Tell us what matters most so we can generate a targeted AI summary
          </p>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, margin: 0 }}>
        To generate an AI summary for <strong>{topicName}</strong>, choose the specific aspects you want to track. This shapes what our AI focuses on.
      </p>
      <button
        type="button"
        onClick={onSetFocus}
        data-testid="button-set-tracking-focus"
        style={{
          backgroundColor: PURPLE,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 18px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.88")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
      >
        Set tracking focus →
      </button>
    </div>
  );
}
