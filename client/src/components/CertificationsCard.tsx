import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: '#EAF3DE', color: '#27500A', label: 'Active' },
  renewal:  { bg: '#FAEEDA', color: '#633806', label: 'Renewal due' },
  expired:  { bg: '#FCEBEB', color: '#791F1F', label: 'Expired' },
  pending:  { bg: '#E6F1FB', color: '#0C447C', label: 'Pending' },
};

export function CertificationsCard({ entityId, userRole, previewMode = false }: { entityId: string; userRole: string; previewMode?: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ cert_name: '', cert_description: '', status: 'active', renewal_date: '' });
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';
  const queryClient = useQueryClient();

  const { data: certs = [] } = useQuery<any[]>({
    queryKey: ['/api/entities', entityId, 'certifications'],
    queryFn: async () => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/certifications`);
      return res.json();
    }
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/certifications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to add certification');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'certifications'] });
      setShowForm(false);
      setForm({ cert_name: '', cert_description: '', status: 'active', renewal_date: '' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (certId: string) => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/certifications/${certId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete certification');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'certifications'] })
  });

  const displayCerts = previewMode ? certs.slice(0, 3) : certs;

  return (
    <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }} data-testid="card-certifications">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>Certifications</span>
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-secondary, #64748b)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>{certs.length}</span>
        </div>
        {canEdit && !previewMode && (
          <button onClick={() => setShowForm(!showForm)} style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }} data-testid="button-add-certification">+ Add</button>
        )}
      </div>
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
        {displayCerts.length === 0 && !showForm && (
          <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }} data-testid="text-certifications-empty">No certifications logged yet.</div>
        )}
        {displayCerts.map((cert: any) => {
          const style = STATUS_STYLES[cert.status] || STATUS_STYLES.active;
          return (
            <div key={cert.id} style={{ padding: '11px 18px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }} data-testid={`item-certification-${cert.id}`}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>{cert.cert_name}</div>
                {cert.cert_description && <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748b)', marginTop: 2 }}>{cert.cert_description}</div>}
                {cert.renewal_date && <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', marginTop: 2 }}>Renewal: {cert.renewal_date}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: style.bg, color: style.color }}>{style.label}</span>
                {canEdit && !previewMode && (
                  <button onClick={() => { if (confirm('Remove this certification?')) deleteMutation.mutate(cert.id); }} style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} data-testid={`button-delete-certification-${cert.id}`}>×</button>
                )}
              </div>
            </div>
          );
        })}
        {showForm && canEdit && (
          <div style={{ padding: '14px 18px', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', background: 'var(--color-background-secondary, #f8fafc)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Certification name *" value={form.cert_name} onChange={e => setForm(f => ({ ...f, cert_name: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="input-cert-name" />
              <input placeholder="Description" value={form.cert_description} onChange={e => setForm(f => ({ ...f, cert_description: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="input-cert-description" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="select-cert-status">
                <option value="active">Active</option>
                <option value="renewal">Renewal due</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
              </select>
              <input placeholder="Renewal date (e.g. Q3 2026)" value={form.renewal_date} onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))} style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} data-testid="input-cert-renewal-date" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }} data-testid="button-cancel-certification">Cancel</button>
              <button onClick={() => addMutation.mutate(form)} disabled={!form.cert_name || addMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} data-testid="button-save-certification">
                {addMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
