import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function SoWhatIntelCard({ entityId, userRole }: { entityId: string; userRole: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';
  const queryClient = useQueryClient();

  const { data: intel, isLoading } = useQuery({
    queryKey: ['/api/entities', entityId, 'intelligence', 'so_what'],
    queryFn: async () => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/intelligence/so_what`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/intelligence/so_what`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'intelligence', 'so_what'] });
      setEditing(false);
    }
  });

  const regenerate = async () => {
    if (intel?.is_custom) {
      if (!confirm('You have a saved custom version. Regenerate will replace it — continue?')) return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/entities/${encodeURIComponent(entityId)}/intelligence/so_what/regenerate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to regenerate');
      queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'intelligence', 'so_what'] });
    } finally {
      setRegenerating(false);
    }
  };

  const content = intel?.content || '';

  return (
    <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }} data-testid="card-so-what-intel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>So what</span>
          {intel && !intel.is_custom && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC', fontWeight: 500 }}>AI drafted</span>
          )}
          {intel?.is_custom && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#EAF3DE', color: '#27500A', border: '0.5px solid #639922', fontWeight: 500 }}>Custom</span>
          )}
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={regenerate} disabled={regenerating} style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }} data-testid="button-regenerate-intel">
              {regenerating ? 'Generating...' : 'Regenerate'}
            </button>
            {!editing && (
              <button onClick={() => { setDraft(content); setEditing(true); }} style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }} data-testid="button-edit-intel">Edit</button>
            )}
          </div>
        )}
      </div>
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', padding: '16px 18px' }}>
        {isLoading && <p style={{ fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)', margin: 0 }}>Loading...</p>}
        {!isLoading && !content && !editing && (
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)', margin: 0 }}>
            No analysis yet.{canEdit && <> <button onClick={regenerate} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }} data-testid="button-generate-now">Generate now</button></>}
          </p>
        )}
        {!editing && content && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.75, margin: 0 }} data-testid="text-intel-content">{content}</p>
        )}
        {editing && (
          <>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={4}
              style={{ width: '100%', fontSize: 13, fontFamily: 'inherit', padding: '10px 12px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 8, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-primary, #1e293b)', resize: 'vertical', lineHeight: 1.75, boxSizing: 'border-box' }}
              data-testid="textarea-intel-edit"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setEditing(false)} style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }} data-testid="button-cancel-intel-edit">Cancel</button>
              <button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending} style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} data-testid="button-save-intel-edit">
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
