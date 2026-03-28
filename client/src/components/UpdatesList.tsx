import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ChevronRight, Globe, Pencil, Briefcase, ExternalLink, ChevronDown } from "lucide-react";
import type { Capture } from "@shared/schema";

type TimeFilter = "all" | "week" | "month" | "90days";
type CategoryFilter = "all" | "Product launch" | "Contract win" | "Partnership" | "Certification" | "R&D signal" | "Case study" | "Conference" | "Pricing" | "Other";

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "90days", label: "Last 90 days" },
];

const CATEGORIES: CategoryFilter[] = [
  "all",
  "Product launch",
  "Contract win",
  "Partnership",
  "Certification",
  "R&D signal",
  "Case study",
  "Conference",
  "Pricing",
  "Other",
];

function getSignalStrength(cap: Capture): "high" | "medium" | "low" | null {
  if (!cap.matchReason) return null;
  const match = cap.matchReason.match(/\[(high|medium|low)\]/);
  return match ? (match[1] as "high" | "medium" | "low") : null;
}

function getNewsDate(cap: Capture): Date | null {
  if (!cap.matchReason) return null;
  const match = cap.matchReason.match(/\[news_date:([^\]]+)\]/);
  if (!match) return null;
  const d = new Date(match[1]);
  return isNaN(d.getTime()) ? null : d;
}

function getDisplayDate(cap: Capture): Date {
  return getNewsDate(cap) ?? new Date(cap.createdAt);
}

function getCategory(cap: Capture): string {
  const text = (cap.content || "").toLowerCase();
  if (/launch|release|announces/i.test(text)) return "Product launch";
  if (/contract|selected|awarded|wins/i.test(text)) return "Contract win";
  if (/partner|integration|alliance/i.test(text)) return "Partnership";
  if (/certif(ied|ication)|compliance/i.test(text)) return "Certification";
  if (/patent|r&d|research/i.test(text)) return "R&D signal";
  if (/case study|deployed|zero fraud/i.test(text)) return "Case study";
  if (/keynote|conference|summit/i.test(text)) return "Conference";
  if (/price|pricing|plan|tier|per month|per year|per seat|per user|subscription/i.test(text)) return "Pricing";
  return "Other";
}

function getSourceUrl(cap: Capture): string | null {
  const match = cap.content.match(/\n\nSource: (https?:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

function getSourceDomain(cap: Capture): string | null {
  const url = getSourceUrl(cap);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function getCaptureTitle(cap: Capture): string {
  const firstLine = cap.content.split("\n")[0].trim();
  return firstLine.length > 0 ? firstLine : cap.content.slice(0, 80);
}

function getCaptureBody(cap: Capture): string {
  return cap.content.replace(/\n\nSource:.*$/, "").trim();
}

function SignalDot({ cap }: { cap: Capture }) {
  const strength = getSignalStrength(cap);
  let color = "#85B7EB";
  if (strength === "high") color = "#E24B4A";
  else if (strength === "medium") color = "#EF9F27";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        marginTop: 4,
      }}
      data-testid={`signal-dot-${cap.id}`}
    />
  );
}

function UpdateCard({
  cap,
  dimensionNames,
}: {
  cap: Capture;
  dimensionNames: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const category = getCategory(cap);
  const sourceDomain = getSourceDomain(cap);
  const sourceUrl = getSourceUrl(cap);
  const title = getCaptureTitle(cap);
  const body = getCaptureBody(cap);
  const date = getDisplayDate(cap);
  const isHiring = cap.matchReason?.includes("[signal_type:hiring_signal]");

  const matchedDimension = dimensionNames.find((dimName) =>
    cap.content.toLowerCase().includes(dimName.toLowerCase())
  );

  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        cursor: "pointer",
        backgroundColor: "var(--color-background-primary, #fff)",
        borderBottom: "0.5px solid var(--color-border-tertiary, #e2e8f0)",
        padding: "10px 12px",
        minWidth: 0,
      }}
      className="hover:bg-slate-50 transition-colors"
      data-testid={`update-card-${cap.id}`}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <SignalDot cap={cap} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                flex: 1,
                fontSize: 14,
                fontWeight: 500,
                color: "#1e293b",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
              data-testid={`update-title-${cap.id}`}
            >
              {title}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>{dateStr}</span>
            <ChevronRight
              size={16}
              color="#94a3b8"
              style={{
                flexShrink: 0,
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap", minWidth: 0 }}>
            {sourceDomain && (
              <span
                style={{
                  fontSize: 11,
                  color: "#3b82f6",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 160,
                  flexShrink: 1,
                }}
                data-testid={`update-source-${cap.id}`}
              >
                {isHiring ? "Hiring signal" : sourceDomain}
              </span>
            )}
            {matchedDimension && (
              <span
                style={{
                  fontSize: 10,
                  backgroundColor: "#534AB7",
                  color: "#fff",
                  padding: "1px 7px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                data-testid={`update-dim-tag-${cap.id}`}
              >
                {matchedDimension}
              </span>
            )}
            <span
              style={{
                fontSize: 10,
                backgroundColor: "#f1f5f9",
                color: "#64748b",
                border: "0.5px solid #e2e8f0",
                padding: "1px 7px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              data-testid={`update-category-${cap.id}`}
            >
              {category}
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 8,
            marginBottom: 4,
            backgroundColor: "var(--color-background-secondary, #f8fafc)",
            borderRadius: "var(--border-radius-md, 8px)",
            padding: 12,
          }}
          data-testid={`update-expanded-${cap.id}`}
        >
          <p
            style={{
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.5,
              marginBottom: 10,
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {body}
          </p>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              borderTop: "0.5px solid #e2e8f0",
              paddingTop: 8,
            }}
          >
            <button
              style={{
                fontSize: 11,
                padding: "4px 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "#fff",
                color: "#1e293b",
                cursor: "pointer",
              }}
              onClick={() => {}}
              data-testid={`button-save-battlecard-${cap.id}`}
            >
              Save to battlecard
            </button>
            <button
              style={{
                fontSize: 11,
                padding: "4px 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                background: "#fff",
                color: "#1e293b",
                cursor: "pointer",
              }}
              onClick={() => {}}
              data-testid={`button-add-briefing-${cap.id}`}
            >
              Add to briefing
            </button>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#1e293b",
                  cursor: "pointer",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                data-testid={`button-open-source-${cap.id}`}
              >
                <ExternalLink size={10} />
                Open source
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function UpdatesList({
  captures,
  entityType,
}: {
  captures: Capture[];
  entityType?: string;
}) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [categoryOpen, setCategoryOpen] = useState(false);

  const { data: dimensionsRaw } = useQuery<{ id: string; name: string; items?: { name: string }[] }[]>({
    queryKey: ["/api/dimensions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dimensions");
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const dimensionNames: string[] = [];
  if (Array.isArray(dimensionsRaw)) {
    for (const dim of dimensionsRaw) {
      if (dim.items && Array.isArray(dim.items)) {
        for (const item of dim.items) {
          if (item.name) dimensionNames.push(item.name);
        }
      } else if (dim.name) {
        dimensionNames.push(dim.name);
      }
    }
  }

  const now = new Date();

  const filtered = captures.filter((cap) => {
    const date = getDisplayDate(cap);
    if (timeFilter === "week") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      if (date < cutoff) return false;
    } else if (timeFilter === "month") {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
      if (date < cutoff) return false;
    } else if (timeFilter === "90days") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 90);
      if (date < cutoff) return false;
    }
    if (categoryFilter !== "all") {
      if (getCategory(cap) !== categoryFilter) return false;
    }
    return true;
  });

  const hasCategoryFilter = categoryFilter !== "all";

  return (
    <div data-testid="updates-list">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TIME_FILTERS.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeFilter(tf.value)}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 999,
                border: timeFilter === tf.value ? "none" : "1px solid #e2e8f0",
                backgroundColor: timeFilter === tf.value ? "#534AB7" : "#fff",
                color: timeFilter === tf.value ? "#fff" : "#64748b",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontWeight: timeFilter === tf.value ? 500 : 400,
              }}
              data-testid={`time-filter-${tf.value}`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div
          style={{
            width: "0.5px",
            height: 20,
            backgroundColor: "#e2e8f0",
            flexShrink: 0,
          }}
        />

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setCategoryOpen((o) => !o)}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 6,
              border: hasCategoryFilter ? "1.5px solid #534AB7" : "1px solid #e2e8f0",
              backgroundColor: hasCategoryFilter ? "#534AB7" : "#fff",
              color: hasCategoryFilter ? "#fff" : "#64748b",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontWeight: hasCategoryFilter ? 500 : 400,
            }}
            data-testid="category-filter-button"
          >
            Category: {categoryFilter === "all" ? "All" : categoryFilter}
            <ChevronDown size={12} />
          </button>
          {categoryOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                backgroundColor: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                zIndex: 50,
                minWidth: 160,
                overflow: "hidden",
              }}
              data-testid="category-dropdown"
            >
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategoryFilter(cat);
                    setCategoryOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "7px 14px",
                    fontSize: 12,
                    color: categoryFilter === cat ? "#534AB7" : "#1e293b",
                    backgroundColor: categoryFilter === cat ? "#f5f3ff" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: categoryFilter === cat ? 500 : 400,
                  }}
                  data-testid={`category-option-${cat}`}
                >
                  {cat === "all" ? "All categories" : cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "32px 16px",
            color: "#94a3b8",
            fontSize: 13,
            border: "1px dashed #e2e8f0",
            borderRadius: 10,
          }}
          data-testid="updates-empty"
        >
          No updates match the selected filters.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {filtered.map((cap) => (
            <UpdateCard key={cap.id} cap={cap} dimensionNames={dimensionNames} />
          ))}
        </div>
      )}
    </div>
  );
}
