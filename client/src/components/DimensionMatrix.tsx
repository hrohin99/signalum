import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CompetitorStatus {
  entity_name: string;
  status: string;
  source: string;
}

interface DimensionItem {
  name: string;
  our_status: string | null;
  competitors: CompetitorStatus[];
}

interface Dimension {
  id: string;
  name: string;
  priority: string;
  display_order: number;
  items: DimensionItem[];
}

interface MatrixData {
  dimensions: Dimension[];
  competitors: string[];
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  yes:     { bg: '#EAF3DE', color: '#27500A', label: 'Yes' },
  partial: { bg: '#FAEEDA', color: '#633806', label: 'Partial' },
  no:      { bg: '#FCEBEB', color: '#791F1F', label: 'No' },
  unknown: { bg: '#F3F4F6', color: '#6B7280', label: '—' },
};

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#FCEBEB', color: '#791F1F' },
  medium: { bg: '#FAEEDA', color: '#633806' },
  low:    { bg: '#F3F4F6', color: '#6B7280' },
};

function StatusPill({ status }: { status: string | null }) {
  const key = status && STATUS_STYLES[status] ? status : 'unknown';
  const style = STATUS_STYLES[key];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  );
}

const DEFAULT_VISIBLE_COUNT = 4;

export function DimensionMatrix() {
  const { data, isLoading, isError } = useQuery<MatrixData>({
    queryKey: ['/api/matrix/dimensions'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/matrix/dimensions");
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  const allCompetitors = data?.competitors ?? [];
  const [selectedCompetitors, setSelectedCompetitors] = useState<Set<string> | null>(null);

  const activeSet = useMemo(() => {
    if (selectedCompetitors !== null) return selectedCompetitors;
    const initial = new Set(allCompetitors.slice(0, DEFAULT_VISIBLE_COUNT));
    return initial;
  }, [selectedCompetitors, allCompetitors]);

  const visibleCompetitors = allCompetitors.filter((c) => activeSet.has(c));

  function toggleAll() {
    if (activeSet.size === allCompetitors.length) {
      setSelectedCompetitors(new Set());
    } else {
      setSelectedCompetitors(new Set(allCompetitors));
    }
  }

  function toggleCompetitor(name: string) {
    const next = new Set(activeSet);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setSelectedCompetitors(next);
  }

  if (isLoading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
        <div style={{ height: 20, background: '#F3F4F6', borderRadius: 4, width: 200, marginBottom: 16 }} />
        <div style={{ height: 200, background: '#F9FAFB', borderRadius: 8 }} />
      </div>
    );
  }

  if (isError || !data) {
    return null;
  }

  if (data.dimensions.length === 0) {
    return null;
  }

  const allSelected = activeSet.size === allCompetitors.length;

  return (
    <div
      data-testid="dimension-matrix"
      style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>Capability matrix</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {Object.entries(STATUS_STYLES).map(([key, s]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B7280' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.bg, border: `1px solid ${s.color}`, display: 'inline-block' }} />
                {s.label === '—' ? 'Unknown' : s.label}
              </span>
            ))}
          </div>
        </div>

        {allCompetitors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              data-testid="chip-all"
              onClick={toggleAll}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: allSelected ? '#534AB7' : '#F9FAFB',
                borderColor: allSelected ? '#534AB7' : '#E5E7EB',
                color: allSelected ? '#fff' : '#374151',
              }}
            >
              All
            </button>
            {allCompetitors.map((name) => {
              const active = activeSet.has(name);
              return (
                <button
                  key={name}
                  data-testid={`chip-competitor-${name}`}
                  onClick={() => toggleCompetitor(name)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    border: '1px solid',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: active ? '#534AB7' : '#F9FAFB',
                    borderColor: active ? '#534AB7' : '#E5E7EB',
                    color: active ? '#fff' : '#374151',
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        {visibleCompetitors.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            Select competitors above to compare
          </div>
        ) : (
          <table
            data-testid="dimension-matrix-table"
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              minWidth: 500 + visibleCompetitors.length * 120,
            }}
          >
            <colgroup>
              <col style={{ width: 200 }} />
              <col style={{ width: 110 }} />
              {visibleCompetitors.map((c) => (
                <col key={c} style={{ width: 120 }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Capability
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#534AB7', background: '#F5F3FF', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Us
                </th>
                {visibleCompetitors.map((name) => (
                  <th
                    key={name}
                    data-testid={`col-header-${name}`}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#374151',
                      letterSpacing: '0.05em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={name}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.dimensions.map((dim) => {
                const pStyle = PRIORITY_STYLES[dim.priority] || PRIORITY_STYLES.medium;
                return [
                  <tr
                    key={`group-${dim.id}`}
                    data-testid={`group-row-${dim.id}`}
                    style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', borderTop: '1px solid #E5E7EB' }}
                  >
                    <td
                      colSpan={2 + visibleCompetitors.length}
                      style={{ padding: '8px 16px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{dim.name}</span>
                        <span
                          style={{
                            padding: '1px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 500,
                            background: pStyle.bg,
                            color: pStyle.color,
                            textTransform: 'capitalize',
                          }}
                        >
                          {dim.priority}
                        </span>
                      </div>
                    </td>
                  </tr>,
                  ...dim.items.map((item) => {
                    const competitorStatusMap = new Map(
                      item.competitors.map((c) => [c.entity_name, c.status])
                    );
                    return (
                      <tr
                        key={`item-${dim.id}-${item.name}`}
                        data-testid={`item-row-${item.name}`}
                        style={{ borderBottom: '1px solid #F3F4F6' }}
                      >
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#374151', fontWeight: 400 }}>
                          {item.name}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', background: '#FAFAFE' }}>
                          <StatusPill status={item.our_status} />
                        </td>
                        {visibleCompetitors.map((compName) => (
                          <td key={compName} style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <StatusPill status={competitorStatusMap.get(compName) ?? null} />
                          </td>
                        ))}
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
