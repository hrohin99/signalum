import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Product {
  id: string;
  workspace_id: string;
  entity_id: string;
  product_name: string;
  description: string | null;
  status: string;
  tags: string | null;
  sort_order: number;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  ga:         { bg: '#EAF3DE', color: '#27500A', label: 'GA' },
  beta:       { bg: '#FAEEDA', color: '#633806', label: 'Beta' },
  deprecated: { bg: '#F1EFE8', color: '#444441', label: 'Deprecated' },
};

const EMPTY_FORM = { product_name: '', description: '', status: 'ga', tags: '' };

export function ProductsCard({ entityId, userRole }: { entityId: string; userRole: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';
  console.log('showForm:', showForm);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['/api/entities', entityId, 'products'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/products`);
      return res.json();
    }
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/products`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'products'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof EMPTY_FORM }) => {
      const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/products/${encodeURIComponent(id)}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'products'] });
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/entities/${encodeURIComponent(entityId)}/products/${encodeURIComponent(id)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'products'] })
  });

  const FormRow = ({ onSubmit, onCancel, saving }: { onSubmit: () => void; onCancel: () => void; saving: boolean }) => (
    <div style={{ padding: '14px 18px', background: 'var(--color-background-secondary, #f8fafc)', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input data-testid="input-product-name" placeholder="Product name *" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
          style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} />
        <select data-testid="select-product-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }}>
          <option value="ga">Generally Available</option>
          <option value="beta">Beta</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>
      <textarea data-testid="input-product-description" placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
        style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)', resize: 'vertical', fontFamily: 'inherit' }} />
      <input data-testid="input-product-tags" placeholder="Tags (comma separated, e.g. liveness, biometric)" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
        style={{ fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button data-testid="button-cancel-product" onClick={onCancel} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
        <button data-testid="button-save-product" onClick={onSubmit} disabled={!form.product_name || saving}
          style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <div data-testid="card-products-solutions" style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>Products & solutions</span>
          <span data-testid="text-products-count" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-secondary, #64748b)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>{products.length}</span>
        </div>
        {canEdit && (
          <button data-testid="button-add-product" onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }}>+ Add</button>
        )}
      </div>

      {showForm && canEdit && (
        <FormRow
          onSubmit={() => addMutation.mutate(form)}
          onCancel={() => { setShowForm(false); setForm(EMPTY_FORM); }}
          saving={addMutation.isPending}
        />
      )}

      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
        {isLoading && <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>Loading...</div>}
        {!isLoading && products.length === 0 && !showForm && (
          <div data-testid="text-products-empty" style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>No products logged yet.</div>
        )}
        {products.map((p) => {
          const s = STATUS_STYLES[p.status] || STATUS_STYLES.ga;
          const isEditing = editingId === p.id;
          const tagList = p.tags ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
          return (
            <div key={p.id}>
              {isEditing ? (
                <FormRow
                  onSubmit={() => editMutation.mutate({ id: p.id, data: form })}
                  onCancel={() => { setEditingId(null); setForm(EMPTY_FORM); }}
                  saving={editMutation.isPending}
                />
              ) : (
                <div data-testid={`card-product-${p.id}`} style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span data-testid={`text-product-name-${p.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>{p.product_name}</span>
                      <span data-testid={`text-product-status-${p.id}`} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button data-testid={`button-edit-product-${p.id}`} onClick={() => { setEditingId(p.id); setShowForm(false); setForm({ product_name: p.product_name, description: p.description || '', status: p.status || 'ga', tags: p.tags || '' }); }}
                          style={{ fontSize: 11, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}>Edit</button>
                        <button data-testid={`button-remove-product-${p.id}`} onClick={() => { if (confirm(`Remove ${p.product_name}?`)) deleteMutation.mutate(p.id); }}
                          style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}
                          onMouseEnter={e => { (e.target as HTMLElement).style.color = '#A32D2D'; (e.target as HTMLElement).style.borderColor = '#F7C1C1'; (e.target as HTMLElement).style.background = '#FCEBEB'; }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--color-text-tertiary, #94a3b8)'; (e.target as HTMLElement).style.borderColor = 'var(--color-border-tertiary, #e2e8f0)'; (e.target as HTMLElement).style.background = 'transparent'; }}>Remove</button>
                      </div>
                    )}
                  </div>
                  {p.description && <div data-testid={`text-product-description-${p.id}`} style={{ fontSize: 13, color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.6 }}>{p.description}</div>}
                  {tagList.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {tagList.map((tag: string) => (
                        <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-secondary, #64748b)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
