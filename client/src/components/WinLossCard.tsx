import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface WinLossItem {
  id: string;
  workspace_id: string;
  entity_id: string;
  outcome: string;
  deal_name: string;
  description: string | null;
  quarter: string | null;
  sector: string | null;
  est_arr: string | null;
  sort_order: number;
  created_at: string;
}

const OUTCOME_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  win:  { bg: '#EAF3DE', color: '#27500A', label: 'Win' },
  loss: { bg: '#F5E6E6', color: '#7A1C1C', label: 'Loss' },
  draw: { bg: '#FAEEDA', color: '#633806', label: 'Draw' },
};

const EMPTY_FORM = { outcome: 'win', deal_name: '', description: '', quarter: '', sector: '', est_arr: '' };

const formRowStyle = { padding: '14px 18px', background: 'var(--color-background-secondary, #f8fafc)', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', flexDirection: 'column' as const, gap: 8 };
const inputStyle = { fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' };

export function WinLossCard({ entityId, userRole }: { entityId: string; userRole: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';

  const { data: items = [], isLoading } = useQuery<WinLossItem[]>({
    queryKey: [`/api/entities/${entityId}/win-loss`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/win-loss`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 500,
  });

  const wins = items.filter(i => i.outcome === 'win').length;
  const losses = items.filter(i => i.outcome === 'loss').length;

  function startEdit(item: WinLossItem) {
    setEditingId(item.id);
    setShowForm(false);
    setForm({ outcome: item.outcome, deal_name: item.deal_name, description: item.description || '', quarter: item.quarter || '', sector: item.sector || '', est_arr: item.est_arr || '' });
  }

  const addMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/win-loss`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/win-loss`] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof EMPTY_FORM }) => {
      const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/win-loss/${encodeURIComponent(id)}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/win-loss`] });
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/entities/${encodeURIComponent(entityId)}/win-loss/${encodeURIComponent(id)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/win-loss`] })
  });

  const countBadge = items.length > 0 ? `${wins}W · ${losses}L` : '0';

  return (
    <div data-testid="card-win-loss" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>Win / Loss tracker</span>
          <span data-testid="text-win-loss-count" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-secondary, #64748b)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>{countBadge}</span>
        </div>
        {canEdit && (
          <button data-testid="button-add-win-loss" onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }}>+ Add</button>
        )}
      </div>

      {showForm && canEdit && (
        <div style={formRowStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select data-testid="select-win-loss-outcome" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} style={inputStyle}>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="draw">Draw</option>
            </select>
            <input data-testid="input-win-loss-deal-name" placeholder="Deal or opportunity name *" value={form.deal_name} onChange={e => setForm(f => ({ ...f, deal_name: e.target.value }))} style={inputStyle} />
          </div>
          <textarea data-testid="input-win-loss-description" placeholder="What happened?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <input data-testid="input-win-loss-quarter" placeholder="e.g. Q2 2024" value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))} style={inputStyle} />
            <input data-testid="input-win-loss-sector" placeholder="e.g. UK Gov, Financial" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} style={inputStyle} />
            <input data-testid="input-win-loss-est-arr" placeholder="e.g. £800K ARR" value={form.est_arr} onChange={e => setForm(f => ({ ...f, est_arr: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button data-testid="button-cancel-win-loss" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
            <button data-testid="button-save-win-loss" onClick={() => addMutation.mutate(form)} disabled={!form.deal_name || addMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {addMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
        {isLoading && <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>Loading...</div>}
        {!isLoading && items.length === 0 && !showForm && (
          <div data-testid="text-win-loss-empty" style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>No win/loss entries logged yet.</div>
        )}
        {items.map((item) => {
          const os = OUTCOME_STYLES[item.outcome] || OUTCOME_STYLES.win;
          const isEditing = editingId === item.id;
          return (
            <div key={item.id}>
              {isEditing ? (
                <div style={formRowStyle}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select data-testid="select-win-loss-outcome" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} style={inputStyle}>
                      <option value="win">Win</option>
                      <option value="loss">Loss</option>
                      <option value="draw">Draw</option>
                    </select>
                    <input data-testid="input-win-loss-deal-name" placeholder="Deal or opportunity name *" value={form.deal_name} onChange={e => setForm(f => ({ ...f, deal_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <textarea data-testid="input-win-loss-description" placeholder="What happened?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <input data-testid="input-win-loss-quarter" placeholder="e.g. Q2 2024" value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))} style={inputStyle} />
                    <input data-testid="input-win-loss-sector" placeholder="e.g. UK Gov, Financial" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} style={inputStyle} />
                    <input data-testid="input-win-loss-est-arr" placeholder="e.g. £800K ARR" value={form.est_arr} onChange={e => setForm(f => ({ ...f, est_arr: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button data-testid="button-cancel-win-loss" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
                    <button data-testid="button-save-win-loss" onClick={() => editMutation.mutate({ id: item.id, data: form })} disabled={!form.deal_name || editMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                      {editMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={item.id} style={{ padding: '13px 18px', borderBottom: '0.5px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: os.bg, color: os.color, whiteSpace: 'nowrap', marginTop: 1 }}>{os.label}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>{item.deal_name}</div>
                      {item.description && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{item.description}</div>}
                      <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 8 }}>
                        {item.quarter && <span>{item.quarter}</span>}
                        {item.sector && <span>· {item.sector}</span>}
                        {item.est_arr && <span>· Est. {item.est_arr}</span>}
                      </div>
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => startEdit(item)} style={{ fontSize: 11, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}>Edit</button>
                        <button onClick={() => { if (confirm(`Remove ${item.deal_name}?`)) deleteMutation.mutate(item.id); }} style={{ fontSize: 11, color: '#94a3b8', border: '0.5px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}>Remove</button>
                      </div>
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
