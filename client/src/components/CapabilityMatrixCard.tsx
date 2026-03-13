import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const ASSESSMENT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  advantage:  { bg: '#EAF3DE', color: '#27500A', label: 'Advantage' },
  parity:     { bg: '#E6F1FB', color: '#0C447C', label: 'Parity' },
  gap_risk:   { bg: '#FAEEDA', color: '#633806', label: 'Gap risk' },
  behind:     { bg: '#FCEBEB', color: '#791F1F', label: 'Behind' },
};

export function CapabilityMatrixCard({ entityId, userRole, previewMode = false }: { entityId: string; userRole: string; previewMode?: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ capability_name: '', capability_description: '', competitor_has: true, us_has: false, assessment: 'parity' });
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';
  const queryClient = useQueryClient();

  const { data: capabilities = [] } = useQuery<any[]>({
    queryKey: ['/api/entities', entityId, 'capabilities'],
    queryFn: async () => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/capabilities`);
      return res.json();
    }
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/capabilities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to add capability');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'capabilities'] });
      setShowForm(false);
      setForm({ capability_name: '', capability_description: '', competitor_has: true, us_has: false, assessment: 'parity' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (capId: string) => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/capabilities/${capId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete capability');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'capabilities'] })
  });

  const displayCaps = previewMode ? capabilities.slice(0, 3) : capabilities;

  return (
    <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }} data-testid="card-capability-matrix">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>
          Capability matrix
        </span>
        {canEdit && !previewMode && (
          <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }} data-testid="button-add-capability">+ Add row</button>
        )}
      </div>
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ fontSize: 11, fontWeight: 500, padding: '8px 14px', textAlign: 'left', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', color: 'var(--color-text-tertiary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40%' }}>Capability</th>
              <th style={{ fontSize: 11, fontWeight: 500, padding: '8px 14px', textAlign: 'center', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', color: 'var(--color-text-tertiary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '18%' }}>Them</th>
              <th style={{ fontSize: 11, fontWeight: 500, padding: '8px 14px', textAlign: 'center', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', color: 'var(--color-text-tertiary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '18%' }}>Us</th>
              <th style={{ fontSize: 11, fontWeight: 500, padding: '8px 14px', textAlign: 'center', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', color: 'var(--color-text-tertiary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '24%' }}>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {displayCaps.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }} data-testid="text-capabilities-empty">No capabilities added yet.</td></tr>
            )}
            {displayCaps.map((cap: any) => {
              const style = ASSESSMENT_STYLES[cap.assessment] || ASSESSMENT_STYLES.parity;
              return (
                <tr key={cap.id} data-testid={`row-capability-${cap.id}`}>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>{cap.capability_name}</div>
                    {cap.capability_description && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', marginTop: 2 }}>{cap.capability_description}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: cap.competitor_has ? '#EAF3DE' : 'var(--color-background-secondary, #f8fafc)', fontSize: 11, fontWeight: 500, color: cap.competitor_has ? '#3B6D11' : 'var(--color-text-tertiary, #94a3b8)' }}>
                      {cap.competitor_has ? '✓' : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: cap.us_has ? '#EAF3DE' : 'var(--color-background-secondary, #f8fafc)', fontSize: 11, fontWeight: 500, color: cap.us_has ? '#3B6D11' : 'var(--color-text-tertiary, #94a3b8)' }}>
                      {cap.us_has ? '✓' : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: style.bg, color: style.color }}>{style.label}</span>
                      {canEdit && !previewMode && (
                        <button onClick={() => { if (confirm('Remove this capability?')) deleteMutation.mutate(cap.id); }} style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} data-testid={`button-delete-capability-${cap.id}`}>×</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {showForm && canEdit && (
          <div style={{ padding: '14px 18px', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', background: 'var(--color-background-secondary, #f8fafc)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Capability name *" value={form.capability_name} onChange={e => setForm(f => ({ ...f, capability_name: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="input-capability-name" />
              <input placeholder="Description (optional)" value={form.capability_description} onChange={e => setForm(f => ({ ...f, capability_description: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="input-capability-description" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.competitor_has} onChange={e => setForm(f => ({ ...f, competitor_has: e.target.checked }))} data-testid="checkbox-competitor-has" />
                They have it
              </label>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary, #64748b)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={form.us_has} onChange={e => setForm(f => ({ ...f, us_has: e.target.checked }))} data-testid="checkbox-us-has" />
                We have it
              </label>
              <select value={form.assessment} onChange={e => setForm(f => ({ ...f, assessment: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="select-assessment">
                <option value="advantage">Advantage</option>
                <option value="parity">Parity</option>
                <option value="gap_risk">Gap risk</option>
                <option value="behind">Behind</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }} data-testid="button-cancel-capability">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.capability_name || addMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} data-testid="button-save-capability">
                {addMutation.isPending ? 'Saving...' : 'Add row'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
