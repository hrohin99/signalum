import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface TrackingFocusStepProps {
  topicName: string;
  topicType: string;
  suggestionsPromise: Promise<{ suggestions: string[]; groundingContext: string }> | null;
  onSave: (selectedFocuses: string[], customFocus: string) => void;
  onSkip: () => void;
  initialSelectedFocuses?: string[];
  initialCustomFocus?: string;
}

const PURPLE = "#723988";
const PURPLE_BG = "#EEEDFE";

export function TrackingFocusStep({ topicName, topicType, suggestionsPromise, onSave, onSkip, initialSelectedFocuses, initialCustomFocus }: TrackingFocusStepProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [selectedFocuses, setSelectedFocuses] = useState<Set<string>>(new Set(initialSelectedFocuses ?? []));
  const [customFocus, setCustomFocus] = useState(initialCustomFocus ?? "");

  useEffect(() => {
    if (!suggestionsPromise) {
      setLoadingSuggestions(false);
      setSuggestions(initialSelectedFocuses ?? []);
      return;
    }
    setLoadingSuggestions(true);
    suggestionsPromise
      .then((data) => {
        const fetched = data.suggestions || [];
        const existingNotInFetched = (initialSelectedFocuses ?? []).filter(f => !fetched.includes(f));
        setSuggestions([...existingNotInFetched, ...fetched]);
      })
      .catch(() => {
        setSuggestions(initialSelectedFocuses ?? []);
      })
      .finally(() => {
        setLoadingSuggestions(false);
      });
  }, [suggestionsPromise]);

  const toggleFocus = (focus: string) => {
    setSelectedFocuses((prev) => {
      const next = new Set(prev);
      if (next.has(focus)) {
        next.delete(focus);
      } else {
        next.add(focus);
      }
      return next;
    });
  };

  const handleSave = () => {
    onSave(Array.from(selectedFocuses), customFocus.trim());
  };

  return (
    <div data-testid="tracking-focus-step">
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>
          What do you most want to track about <span style={{ color: PURPLE }}>{topicName}</span>?
        </h3>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          Select the areas most relevant to you. This shapes how we search and summarize.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }} data-testid="focus-suggestions-list">
        {loadingSuggestions ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 44,
                borderRadius: 8,
                background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
                backgroundSize: "200% 100%",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
              data-testid={`focus-skeleton-${i}`}
            />
          ))
        ) : suggestions.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94a3b8", padding: "12px 0" }}>
            No suggestions available. Add your own focus below.
          </p>
        ) : (
          suggestions.map((suggestion, i) => {
            const isSelected = selectedFocuses.has(suggestion);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleFocus(suggestion)}
                data-testid={`focus-option-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${isSelected ? PURPLE : "#e2e8f0"}`,
                  backgroundColor: isSelected ? PURPLE_BG : "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.1s ease",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    border: `2px solid ${isSelected ? PURPLE : "#cbd5e1"}`,
                    backgroundColor: isSelected ? PURPLE : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.1s ease",
                  }}
                >
                  {isSelected && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 13, color: isSelected ? PURPLE : "#334155", fontWeight: isSelected ? 500 : 400 }}>
                  {suggestion}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b", display: "block", marginBottom: 6 }}>
          Add your own focus (optional)
        </label>
        <Input
          placeholder="e.g. Impact on supply chain compliance..."
          value={customFocus}
          onChange={(e) => setCustomFocus(e.target.value)}
          data-testid="input-custom-focus"
          style={{ fontSize: 13 }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={onSkip}
          data-testid="button-skip-focus"
          style={{
            fontSize: 13,
            color: "#64748b",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px 0",
            textDecoration: "underline",
          }}
        >
          Skip for now
        </button>
        <Button
          onClick={handleSave}
          data-testid="button-set-focus-create"
          style={{
            backgroundColor: PURPLE,
            color: "#fff",
            border: "none",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Set focus & create topic
        </Button>
      </div>
      <style>{`
        @keyframes pulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
