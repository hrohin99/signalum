import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface GeoPresence {
  id: string;
  workspace_id: string;
  entity_id: string;
  region: string;
  iso_code: string | null;
  presence_type: string;
  channels: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

const PRESENCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: '#EAF3DE', color: '#27500A', label: 'Active' },
  expanding: { bg: '#E0EDFF', color: '#1A3F6F', label: 'Expanding' },
  limited:   { bg: '#FAEEDA', color: '#633806', label: 'Limited' },
  exited:    { bg: '#F1EFE8', color: '#444441', label: 'Exited' },
};

const COUNTRY_FLAGS: Record<string, string> = {
  'united states': '🇺🇸', 'usa': '🇺🇸', 'us': '🇺🇸',
  'united kingdom': '🇬🇧', 'uk': '🇬🇧', 'gb': '🇬🇧',
  'canada': '🇨🇦', 'ca': '🇨🇦',
  'germany': '🇩🇪', 'de': '🇩🇪',
  'france': '🇫🇷', 'fr': '🇫🇷',
  'japan': '🇯🇵', 'jp': '🇯🇵',
  'china': '🇨🇳', 'cn': '🇨🇳',
  'india': '🇮🇳', 'in': '🇮🇳',
  'australia': '🇦🇺', 'au': '🇦🇺',
  'brazil': '🇧🇷', 'br': '🇧🇷',
  'south korea': '🇰🇷', 'kr': '🇰🇷', 'korea': '🇰🇷',
  'mexico': '🇲🇽', 'mx': '🇲🇽',
  'italy': '🇮🇹', 'it': '🇮🇹',
  'spain': '🇪🇸', 'es': '🇪🇸',
  'netherlands': '🇳🇱', 'nl': '🇳🇱',
  'switzerland': '🇨🇭', 'ch': '🇨🇭',
  'sweden': '🇸🇪', 'se': '🇸🇪',
  'norway': '🇳🇴', 'no': '🇳🇴',
  'denmark': '🇩🇰', 'dk': '🇩🇰',
  'finland': '🇫🇮', 'fi': '🇫🇮',
  'singapore': '🇸🇬', 'sg': '🇸🇬',
  'ireland': '🇮🇪', 'ie': '🇮🇪',
  'israel': '🇮🇱', 'il': '🇮🇱',
  'south africa': '🇿🇦', 'za': '🇿🇦',
  'new zealand': '🇳🇿', 'nz': '🇳🇿',
  'argentina': '🇦🇷', 'ar': '🇦🇷',
  'portugal': '🇵🇹', 'pt': '🇵🇹',
  'poland': '🇵🇱', 'pl': '🇵🇱',
  'austria': '🇦🇹', 'at': '🇦🇹',
  'belgium': '🇧🇪', 'be': '🇧🇪',
  'russia': '🇷🇺', 'ru': '🇷🇺',
  'turkey': '🇹🇷', 'tr': '🇹🇷',
  'saudi arabia': '🇸🇦', 'sa': '🇸🇦',
  'uae': '🇦🇪', 'united arab emirates': '🇦🇪', 'ae': '🇦🇪',
  'indonesia': '🇮🇩', 'id': '🇮🇩',
  'thailand': '🇹🇭', 'th': '🇹🇭',
  'vietnam': '🇻🇳', 'vn': '🇻🇳',
  'malaysia': '🇲🇾', 'my': '🇲🇾',
  'philippines': '🇵🇭', 'ph': '🇵🇭',
  'colombia': '🇨🇴', 'co': '🇨🇴',
  'chile': '🇨🇱', 'cl': '🇨🇱',
  'egypt': '🇪🇬', 'eg': '🇪🇬',
  'nigeria': '🇳🇬', 'ng': '🇳🇬',
  'taiwan': '🇹🇼', 'tw': '🇹🇼',
  'hong kong': '🇭🇰', 'hk': '🇭🇰',
  'europe': '🇪🇺', 'eu': '🇪🇺',
  'latin america': '🌎', 'latam': '🌎',
  'asia pacific': '🌏', 'apac': '🌏',
  'middle east': '🌍', 'mena': '🌍',
  'africa': '🌍',
  'global': '🌐',
  'north america': '🌎',
};

export function getRegionFlag(name: string): string {
  const lower = name.toLowerCase().trim();
  return COUNTRY_FLAGS[lower] || '🌐';
}

export function getRegionISOCode(name: string): string {
  const lower = name.toLowerCase().trim();
  const ISO_CODES: Record<string, string> = {
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'gb': 'GB',
    'canada': 'CA', 'ca': 'CA', 'germany': 'DE', 'de': 'DE',
    'france': 'FR', 'fr': 'FR', 'japan': 'JP', 'jp': 'JP',
    'china': 'CN', 'cn': 'CN', 'india': 'IN', 'in': 'IN',
    'australia': 'AU', 'au': 'AU', 'brazil': 'BR', 'br': 'BR',
    'south korea': 'KR', 'kr': 'KR', 'korea': 'KR',
    'mexico': 'MX', 'mx': 'MX', 'italy': 'IT', 'it': 'IT',
    'spain': 'ES', 'es': 'ES', 'netherlands': 'NL', 'nl': 'NL',
    'switzerland': 'CH', 'ch': 'CH', 'sweden': 'SE', 'se': 'SE',
    'norway': 'NO', 'no': 'NO', 'denmark': 'DK', 'dk': 'DK',
    'finland': 'FI', 'fi': 'FI', 'singapore': 'SG', 'sg': 'SG',
    'ireland': 'IE', 'ie': 'IE', 'israel': 'IL', 'il': 'IL',
    'south africa': 'ZA', 'za': 'ZA', 'new zealand': 'NZ', 'nz': 'NZ',
    'argentina': 'AR', 'ar': 'AR', 'portugal': 'PT', 'pt': 'PT',
    'poland': 'PL', 'pl': 'PL', 'austria': 'AT', 'at': 'AT',
    'belgium': 'BE', 'be': 'BE', 'russia': 'RU', 'ru': 'RU',
    'turkey': 'TR', 'tr': 'TR', 'saudi arabia': 'SA', 'sa': 'SA',
    'uae': 'AE', 'united arab emirates': 'AE', 'ae': 'AE',
    'indonesia': 'ID', 'id': 'ID', 'thailand': 'TH', 'th': 'TH',
    'vietnam': 'VN', 'vn': 'VN', 'malaysia': 'MY', 'my': 'MY',
    'philippines': 'PH', 'ph': 'PH', 'colombia': 'CO', 'co': 'CO',
    'chile': 'CL', 'cl': 'CL', 'egypt': 'EG', 'eg': 'EG',
    'nigeria': 'NG', 'ng': 'NG', 'taiwan': 'TW', 'tw': 'TW',
    'hong kong': 'HK', 'hk': 'HK',
    'europe': 'EU', 'eu': 'EU', 'latin america': 'LATAM', 'latam': 'LATAM',
    'asia pacific': 'APAC', 'apac': 'APAC', 'middle east': 'MENA', 'mena': 'MENA',
    'africa': 'AFR', 'global': 'GLB', 'north america': 'NA',
  };
  return ISO_CODES[lower] || name.substring(0, 2).toUpperCase();
}

const EMPTY_FORM = { region: '', presence_type: 'active', channels: '', notes: '' };

const formRowStyle = { padding: '14px 18px', background: 'var(--color-background-secondary, #f8fafc)', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', flexDirection: 'column' as const, gap: 8 };
const inputStyle = { fontSize: 13, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary, #cbd5e1)', borderRadius: 6, background: 'var(--color-background-primary, #fff)', color: 'var(--color-text-primary, #1e293b)' };

export function GeoPresenceCard({ entityId, userRole }: { entityId: string; userRole: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';

  const { data: geoPresence = [], isLoading } = useQuery<GeoPresence[]>({
    queryKey: [`/api/entities/${entityId}/geo-presence`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/geo-presence`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 2,
    retryDelay: 500
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/geo-presence`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/geo-presence`] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof EMPTY_FORM }) => {
      if (id.startsWith('perplexity-')) {
        const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/geo-presence`, data);
        return res.json();
      }
      const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/geo-presence/${encodeURIComponent(id)}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/geo-presence`] });
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith('perplexity-')) return;
      await apiRequest("DELETE", `/api/entities/${encodeURIComponent(entityId)}/geo-presence/${encodeURIComponent(id)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/entities/${entityId}/geo-presence`] })
  });

  return (
    <div data-testid="card-geo-presence" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>Geographic presence</span>
          <span data-testid="text-geo-count" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'var(--color-background-secondary, #f8fafc)', color: 'var(--color-text-secondary, #64748b)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
            {geoPresence.length} {geoPresence.length === 1 ? 'market' : 'markets'}
          </span>
        </div>
        {canEdit && (
          <button data-testid="button-add-geo" onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            style={{ fontSize: 12, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', background: 'transparent' }}>+ Add</button>
        )}
      </div>

      {showForm && canEdit && (
        <div style={formRowStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input data-testid="input-geo-region-name" placeholder="Country / region name *" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} style={inputStyle} />
            <select data-testid="select-geo-presence-type" value={form.presence_type} onChange={e => setForm(f => ({ ...f, presence_type: e.target.value }))} style={inputStyle}>
              <option value="active">Active</option>
              <option value="expanding">Expanding</option>
              <option value="limited">Limited</option>
              <option value="exited">Exited</option>
            </select>
          </div>
          <input data-testid="input-geo-channels" placeholder="Channels (e.g. Direct, Partners, Online)" value={form.channels} onChange={e => setForm(f => ({ ...f, channels: e.target.value }))} style={inputStyle} />
          <textarea data-testid="input-geo-notes" placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button data-testid="button-cancel-geo" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
            <button data-testid="button-save-geo" onClick={() => addMutation.mutate(form)}
              disabled={!form.region || addMutation.isPending}
              style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {addMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
        {isLoading && <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>Loading...</div>}
        {!isLoading && geoPresence.length === 0 && !showForm && (
          <div data-testid="text-geo-empty" style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>No geographic data logged yet.</div>
        )}
        {editingId && geoPresence.filter(g => g.id === editingId).map(g => (
          <div key={g.id}>
            <div style={formRowStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input data-testid="input-geo-region-name" placeholder="Country / region name *" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} style={inputStyle} />
                <select data-testid="select-geo-presence-type" value={form.presence_type} onChange={e => setForm(f => ({ ...f, presence_type: e.target.value }))} style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="expanding">Expanding</option>
                  <option value="limited">Limited</option>
                  <option value="exited">Exited</option>
                </select>
              </div>
              <input data-testid="input-geo-channels" placeholder="Channels (e.g. Direct, Partners, Online)" value={form.channels} onChange={e => setForm(f => ({ ...f, channels: e.target.value }))} style={inputStyle} />
              <textarea data-testid="input-geo-notes" placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button data-testid="button-cancel-geo" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}
                  style={{ fontSize: 12, padding: '4px 14px', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, background: 'transparent', color: 'var(--color-text-secondary, #64748b)', cursor: 'pointer' }}>Cancel</button>
                <button data-testid="button-save-geo" onClick={() => editMutation.mutate({ id: g.id, data: form })}
                  disabled={!form.region || editMutation.isPending}
                  style={{ fontSize: 12, padding: '4px 14px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  {editMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ))}
        {geoPresence.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
            {geoPresence.filter(g => g.id !== editingId).map((g) => {
              const s = PRESENCE_STYLES[g.presence_type] || PRESENCE_STYLES.active;
              const flag = getRegionFlag(g.region);
              const isoCode = g.iso_code || getRegionISOCode(g.region);
              return (
                <div key={g.id} data-testid={`card-geo-${g.id}`} style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRight: '0.5px solid var(--color-border-tertiary, #e2e8f0)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16 }}>{flag}</span>
                    <span data-testid={`text-geo-name-${g.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>{g.region}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', fontFamily: 'monospace' }}>{isoCode}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span data-testid={`text-geo-type-${g.id}`} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, fontWeight: 500, background: s.bg, color: s.color }}>{s.label}</span>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button data-testid={`button-edit-geo-${g.id}`} onClick={() => { setEditingId(g.id); setShowForm(false); setForm({ region: g.region, presence_type: g.presence_type || 'active', channels: g.channels || '', notes: g.notes || '' }); }}
                          style={{ fontSize: 11, color: '#534AB7', border: '0.5px solid #AFA9EC', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}>Edit</button>
                        <button data-testid={`button-remove-geo-${g.id}`} onClick={() => { if (confirm(`Remove ${g.region}?`)) deleteMutation.mutate(g.id); }}
                          style={{ fontSize: 11, color: 'var(--color-text-tertiary, #94a3b8)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', background: 'transparent' }}
                          onMouseEnter={e => { (e.target as HTMLElement).style.color = '#A32D2D'; (e.target as HTMLElement).style.borderColor = '#F7C1C1'; (e.target as HTMLElement).style.background = '#FCEBEB'; }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--color-text-tertiary, #94a3b8)'; (e.target as HTMLElement).style.borderColor = 'var(--color-border-tertiary, #e2e8f0)'; (e.target as HTMLElement).style.background = 'transparent'; }}>Remove</button>
                      </div>
                    )}
                  </div>
                  {g.channels && <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748b)' }}>Channels: {g.channels}</div>}
                  {g.notes && <div data-testid={`text-geo-notes-${g.id}`} style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748b)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{g.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
