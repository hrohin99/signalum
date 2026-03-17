import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function FundingOverviewPreview({ entityId }: { entityId: string }) {
  const { data: allItems = [] } = useQuery<FundingItem[]>({
    queryKey: [`/api/entities/${entityId}/funding`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/funding`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: 2,
    retryDelay: 500,
  });
  const summary = allItems.find(i => i.round_name === '__summary__');
  const stats = [
    { label: 'Total raised', value: summary?.total_raised },
    { label: 'Stage', value: summary?.stage },
    { label: 'Founded', value: summary?.founded },
  ];
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Funding</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {stats.map(({ label, value }) => (
          <div key={label} style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{value || '—'}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      {!summary && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>See Commercial tab to manage</div>
      )}
    </div>
  );
}

interface FundingItem {
  id: string;
  workspace_id: string;
  entity_id: string;
  total_raised: string | null;
  stage: string | null;
  founded: string | null;
  status: string | null;
  round_name: string | null;
  round_amount: string | null;
  round_lead: string | null;
  round_year: string | null;
  sort_order: number;
  created_at: string;
}

const EMPTY_SUMMARY = { total_raised: '', stage: '', founded: '', status: 'Private' };
const EMPTY_ROUND = { round_name: '', round_amount: '', round_lead: '', round_year: '' };

const formRowStyle = { padding: '14px 18px', background: 'var(--color-background-secondary, #f8fafc)', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', flexDirection: 'column' as const, gap: 8 };
const inputStyle = { fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' };

export function FundingCard({ entityId, userRole }: { entityId: string; userRole: string }) {
  const [showSummaryEdit, setShowSummaryEdit] = useState(false);
  const [summaryForm, setSummaryForm] = useState(EMPTY_SUMMARY);

  const [showRoundForm, setShowRoundForm] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [roundForm, setRoundForm] = useState(EMPTY_ROUND);

  const canEdit = userRole === 'admin' || userRole === 'sub_admin';

  const { data: allItems = [], isLoading } = useQuery<FundingItem[]>({
    queryKey: [`/api/entities/${entityId}/funding`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/funding`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: 2,
    retryDelay: 500,
  });

  const summary = allItems.find(i => i.round_name === '__summary__');
  const rounds = allItems.filter(i => i.round_name !== '__summary__');

  function startEditSummary() {
    setSummaryForm({
      total_raised: summary?.total_raised || '',
      stage: summary?.stage || '',
      founded: summary?.founded || '',
      status: summary?.status || 'Private',
    });
    setShowSummaryEdit(true);
  }

  function startEditRound(item: FundingItem) {
    setEditingRoundId(item.id);
    setShowRoundForm(false);
    setRoundForm({ round_name: item.round_name || '', round_amount: item.round_amount || '', round_lead: item.round_lead || '', round_year: item.round_year || '' });
  }

  const saveSummaryMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_SUMMARY) => {
      const payload = { ...data, round_name: '__summary__' };
      if (summary) {
        const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/funding/${encodeURIComponent(summary.id)}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/funding`, payload);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/funding`] });
      setShowSummaryEdit(false);
    }
  });

  const addRoundMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_ROUND) => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/funding`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/funding`] });
      setShowRoundForm(false);
      setRoundForm(EMPTY_ROUND);
    }
  });

  const editRoundMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof EMPTY_ROUND }) => {
      const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/funding/${encodeURIComponent(id)}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/funding`] });
      setEditingRoundId(null);
      setRoundForm(EMPTY_ROUND);
    }
  });

  const deleteRoundMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/entities/${encodeURIComponent(entityId)}/funding/${encodeURIComponent(id)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/funding`] })
  });

  return (
    <div data-testid="card-funding" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>Funding & Financials</span>
          <span data-testid="text-funding-rounds-count" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-secondary, #64748b)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>{rounds.length} rounds</span>
        </div>
        {canEdit && !showSummaryEdit && (
          <button data-testid="button-edit-funding-summary" onClick={startEditSummary}
            style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }}>Edit summary</button>
        )}
      </div>

      {/* Stat grid */}
      {!showSummaryEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '0.5px solid #e2e8f0', borderTop: '0.5px solid #e2e8f0' }}>
          {[
            { label: 'Total raised', value: summary?.total_raised },
            { label: 'Stage', value: summary?.stage },
            { label: 'Founded', value: summary?.founded },
            { label: 'Status', value: summary?.status },
          ].map(({ label, value }, idx) => (
            <div key={label} style={{ padding: '14px 18px', borderRight: idx < 3 ? '0.5px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>{value || '—'}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Summary edit form */}
      {showSummaryEdit && canEdit && (
        <div style={formRowStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input data-testid="input-funding-total-raised" placeholder="Total raised (e.g. $45M)" value={summaryForm.total_raised} onChange={e => setSummaryForm(f => ({ ...f, total_raised: e.target.value }))} style={inputStyle} />
            <input data-testid="input-funding-stage" placeholder="Stage (e.g. Series C)" value={summaryForm.stage} onChange={e => setSummaryForm(f => ({ ...f, stage: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input data-testid="input-funding-founded" placeholder="Founded (e.g. 2018)" value={summaryForm.founded} onChange={e => setSummaryForm(f => ({ ...f, founded: e.target.value }))} style={inputStyle} />
            <input data-testid="input-funding-status" placeholder="Status (e.g. Private, Public)" value={summaryForm.status} onChange={e => setSummaryForm(f => ({ ...f, status: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button data-testid="button-cancel-funding-summary" onClick={() => setShowSummaryEdit(false)} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
            <button data-testid="button-save-funding-summary" onClick={() => saveSummaryMutation.mutate(summaryForm)} disabled={saveSummaryMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {saveSummaryMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Rounds section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: '0.5px solid #e2e8f0' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Funding rounds</span>
        {canEdit && (
          <button data-testid="button-add-funding-round" onClick={() => { setShowRoundForm(true); setEditingRoundId(null); setRoundForm(EMPTY_ROUND); }}
            style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}>+ Add round</button>
        )}
      </div>

      {/* Add round form */}
      {showRoundForm && canEdit && (
        <div style={formRowStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input data-testid="input-round-name" placeholder="Round name (e.g. Series C)" value={roundForm.round_name} onChange={e => setRoundForm(f => ({ ...f, round_name: e.target.value }))} style={inputStyle} />
            <input data-testid="input-round-amount" placeholder="Amount (e.g. $20M)" value={roundForm.round_amount} onChange={e => setRoundForm(f => ({ ...f, round_amount: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input data-testid="input-round-lead" placeholder="Lead investor (e.g. Amadeus Capital)" value={roundForm.round_lead} onChange={e => setRoundForm(f => ({ ...f, round_lead: e.target.value }))} style={inputStyle} />
            <input data-testid="input-round-year" placeholder="Year (e.g. 2023)" value={roundForm.round_year} onChange={e => setRoundForm(f => ({ ...f, round_year: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button data-testid="button-cancel-round" onClick={() => { setShowRoundForm(false); setRoundForm(EMPTY_ROUND); }} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
            <button data-testid="button-save-round" onClick={() => addRoundMutation.mutate(roundForm)} disabled={!roundForm.round_name || addRoundMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {addRoundMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Rounds list */}
      <div>
        {isLoading && <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>Loading...</div>}
        {!isLoading && rounds.length === 0 && !showRoundForm && (
          <div data-testid="text-funding-rounds-empty" style={{ padding: '16px 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>No funding rounds logged yet.</div>
        )}
        {rounds.map((item) => {
          const isEditing = editingRoundId === item.id;
          return (
            <div key={item.id}>
              {isEditing ? (
                <div style={formRowStyle}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input data-testid="input-round-name" placeholder="Round name (e.g. Series C)" value={roundForm.round_name} onChange={e => setRoundForm(f => ({ ...f, round_name: e.target.value }))} style={inputStyle} />
                    <input data-testid="input-round-amount" placeholder="Amount (e.g. $20M)" value={roundForm.round_amount} onChange={e => setRoundForm(f => ({ ...f, round_amount: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input data-testid="input-round-lead" placeholder="Lead investor (e.g. Amadeus Capital)" value={roundForm.round_lead} onChange={e => setRoundForm(f => ({ ...f, round_lead: e.target.value }))} style={inputStyle} />
                    <input data-testid="input-round-year" placeholder="Year (e.g. 2023)" value={roundForm.round_year} onChange={e => setRoundForm(f => ({ ...f, round_year: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button data-testid="button-cancel-round" onClick={() => { setEditingRoundId(null); setRoundForm(EMPTY_ROUND); }} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
                    <button data-testid="button-save-round" onClick={() => editRoundMutation.mutate({ id: item.id, data: roundForm })} disabled={!roundForm.round_name || editRoundMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                      {editRoundMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 18px', borderBottom: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.round_name} — {item.round_amount}</div>
                    {item.round_lead && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Lead: {item.round_lead}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {item.round_year && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b' }}>{item.round_year}</span>}
                    {canEdit && (
                      <>
                        <button onClick={() => startEditRound(item)} style={{ fontSize: 11, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', background: 'transparent' }}>Edit</button>
                        <button onClick={() => { if (confirm('Remove?')) deleteRoundMutation.mutate(item.id); }} style={{ fontSize: 11, color: '#94a3b8', border: '0.5px solid #e2e8f0', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', background: 'transparent' }}>Remove</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
