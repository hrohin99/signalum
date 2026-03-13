import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface WorkspaceCap {
  id: string;
  name: string;
  displayOrder: number;
}

interface CompetitorCap {
  capabilityId: string;
  status: string;
}

interface EntityCap {
  id: string;
  capability_name: string;
  us_has: boolean;
  assessment: string;
}

const ASSESSMENT_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  advantage:  { bg: '#EAF3DE', color: '#27500A', label: 'Advantage' },
  parity:     { bg: '#E6F1FB', color: '#0C447C', label: 'Parity' },
  gap_risk:   { bg: '#FAEEDA', color: '#633806', label: 'Gap risk' },
  behind:     { bg: '#FCEBEB', color: '#791F1F', label: 'Behind' },
};

export function CapabilityMatrixCard({
  entityId,
  userRole,
  previewMode = false,
  onSwitchToProfile,
}: {
  entityId: string;
  userRole: string;
  previewMode?: boolean;
  onSwitchToProfile?: () => void;
}) {
  const canEdit = userRole === 'admin' || userRole === 'sub_admin';
  const queryClient = useQueryClient();

  const { data: capsData } = useQuery<{ capabilities: WorkspaceCap[] }>({
    queryKey: ['/api/capabilities'],
  });

  const { data: compCapData } = useQuery<{ competitorCapabilities: CompetitorCap[] }>({
    queryKey: ['/api/competitor-capabilities', entityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/competitor-capabilities/${encodeURIComponent(entityId)}`);
      return res.json();
    }
  });

  const { data: entityCaps = [] } = useQuery<EntityCap[]>({
    queryKey: ['/api/entities', entityId, 'capabilities'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/capabilities`);
      return res.json();
    }
  });

  const saveMutation = useMutation({
    mutationFn: async ({ capId, capability_name, us_has, assessment }: { capId?: string; capability_name: string; us_has: boolean; assessment: string }) => {
      if (capId) {
        const res = await apiRequest("PUT", `/api/entities/${encodeURIComponent(entityId)}/capabilities/${capId}`, {
          capability_name,
          capability_description: null,
          competitor_has: true,
          us_has,
          assessment,
        });
        return res.json();
      } else {
        const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/capabilities`, {
          capability_name,
          capability_description: null,
          competitor_has: true,
          us_has,
          assessment,
        });
        return res.json();
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/entities', entityId, 'capabilities'] }),
  });

  const workspaceCaps = capsData?.capabilities || [];
  const competitorCaps = compCapData?.competitorCapabilities || [];

  const getCompetitorHas = (capId: string) => {
    const found = competitorCaps.find(cc => cc.capabilityId === capId);
    return found?.status === 'yes' || found?.status === 'partial';
  };

  const getEntityCap = (capName: string): EntityCap | undefined => {
    return entityCaps.find(ec => ec.capability_name === capName);
  };

  const handleUpdate = (capName: string, field: 'us_has' | 'assessment', value: boolean | string) => {
    const existing = getEntityCap(capName);
    const us_has = field === 'us_has' ? (value as boolean) : (existing?.us_has ?? false);
    const assessment = field === 'assessment' ? (value as string) : (existing?.assessment ?? 'parity');
    saveMutation.mutate({ capId: existing?.id, capability_name: capName, us_has, assessment });
  };

  const displayCaps = previewMode ? workspaceCaps.slice(0, 3) : workspaceCaps;

  if (workspaceCaps.length === 0) {
    return (
      <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }} data-testid="card-capability-matrix">
        <div style={{ padding: '13px 18px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>Capability matrix</span>
        </div>
        <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary, #94a3b8)' }}>
          No capabilities defined yet.{' '}
          {onSwitchToProfile && (
            <button onClick={onSwitchToProfile} style={{ color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>
              Add them in the Profile tab →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #e2e8f0)', borderRadius: 12, overflow: 'hidden' }} data-testid="card-capability-matrix">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>
          Capability matrix
        </span>
        {onSwitchToProfile && !previewMode && (
          <button onClick={onSwitchToProfile} style={{ fontSize: 12, color: '#534AB7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} data-testid="button-manage-capabilities">
            Manage in Profile tab →
          </button>
        )}
      </div>
      {!previewMode && (
        <div style={{ padding: '7px 18px', background: 'var(--color-background-secondary, #f8fafc)', borderTop: '0.5px solid var(--color-border-tertiary, #e2e8f0)', fontSize: 12, color: 'var(--color-text-tertiary, #94a3b8)' }}>
          Capabilities are managed in the Profile tab. The "Them" column is auto-populated from their tracked capabilities.
        </div>
      )}
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
            {displayCaps.map((cap) => {
              const competitorHas = getCompetitorHas(cap.id);
              const entityCap = getEntityCap(cap.name);
              const usHas = entityCap?.us_has ?? false;
              const assessment = entityCap?.assessment ?? 'parity';
              const style = ASSESSMENT_STYLES[assessment] || ASSESSMENT_STYLES.parity;
              return (
                <tr key={cap.id} data-testid={`row-capability-${cap.id}`}>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary, #1e293b)' }}>{cap.name}</div>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: competitorHas ? '#EAF3DE' : 'var(--color-background-secondary, #f8fafc)', fontSize: 11, fontWeight: 500, color: competitorHas ? '#3B6D11' : 'var(--color-text-tertiary, #94a3b8)' }}>
                      {competitorHas ? '✓' : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', textAlign: 'center' }}>
                    {canEdit && !previewMode ? (
                      <button
                        onClick={() => handleUpdate(cap.name, 'us_has', !usHas)}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: usHas ? '#EAF3DE' : 'var(--color-background-secondary, #f8fafc)', fontSize: 11, fontWeight: 500, color: usHas ? '#3B6D11' : 'var(--color-text-tertiary, #94a3b8)', border: '0.5px solid', borderColor: usHas ? '#93C47D' : 'var(--color-border-tertiary, #e2e8f0)', cursor: 'pointer' }}
                        data-testid={`button-us-has-${cap.id}`}
                      >
                        {usHas ? '✓' : '—'}
                      </button>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: usHas ? '#EAF3DE' : 'var(--color-background-secondary, #f8fafc)', fontSize: 11, fontWeight: 500, color: usHas ? '#3B6D11' : 'var(--color-text-tertiary, #94a3b8)' }}>
                        {usHas ? '✓' : '—'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary, #e2e8f0)', textAlign: 'center' }}>
                    {canEdit && !previewMode ? (
                      <select
                        value={assessment}
                        onChange={e => handleUpdate(cap.name, 'assessment', e.target.value)}
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 20, fontWeight: 500, background: style.bg, color: style.color, border: 'none', cursor: 'pointer', outline: 'none' }}
                        data-testid={`select-assessment-${cap.id}`}
                      >
                        <option value="advantage">Advantage</option>
                        <option value="parity">Parity</option>
                        <option value="gap_risk">Gap risk</option>
                        <option value="behind">Behind</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: style.bg, color: style.color }}>{style.label}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
