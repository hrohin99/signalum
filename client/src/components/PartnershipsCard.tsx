import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

interface Partnership {
  id: string;
  workspace_id: string;
  entity_id: string;
  partner_name: string;
  partner_industry: string | null;
  partner_country: string | null;
  relationship_type: string;
  program_description: string | null;
  active_since: string | null;
  context_note: string | null;
  created_at: string;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  joint_venture: "Joint ventures",
  strategic_partner: "Strategic partnerships",
  integration: "Integrations",
  reseller: "Reseller / OEM",
  oem: "Reseller / OEM",
};

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  joint_venture:    { bg: "#EEEDFE", color: "#3C3489" },
  strategic_partner:{ bg: "#E6F1FB", color: "#0C447C" },
  integration:      { bg: "#FAEEDA", color: "#633806" },
  reseller:         { bg: "#EAF3DE", color: "#27500A" },
  oem:              { bg: "#FBEAF0", color: "#72243E" },
};

const BADGE_LABEL: Record<string, string> = {
  joint_venture: "Joint venture",
  strategic_partner: "Strategic partner",
  integration: "Integration",
  reseller: "Reseller",
  oem: "OEM",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

const RELATIONSHIP_TYPES = [
  { value: "joint_venture", label: "Joint venture" },
  { value: "strategic_partner", label: "Strategic partner" },
  { value: "integration", label: "Integration" },
  { value: "reseller", label: "Reseller" },
  { value: "oem", label: "OEM" },
];

export function PartnershipsCard({
  entityId,
  userRole,
}: {
  entityId: string;
  userRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formPartnerName, setFormPartnerName] = useState("");
  const [formIndustry, setFormIndustry] = useState("");
  const [formCountry, setFormCountry] = useState("");
  const [formRelationshipType, setFormRelationshipType] = useState("strategic_partner");
  const [formProgramDescription, setFormProgramDescription] = useState("");
  const [formActiveSince, setFormActiveSince] = useState("");
  const [formContextNote, setFormContextNote] = useState("");

  const isReadOnly = userRole === "read_only";

  const { data, isLoading } = useQuery<{ partnerships: Partnership[] }>({
    queryKey: ["/api/entities", entityId, "partnerships"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/entities/${encodeURIComponent(entityId)}/partnerships`);
      return res.json();
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
  });

  const partnerships = data?.partnerships || [];

  const createMutation = useMutation({
    mutationFn: async (body: {
      partnerName: string;
      partnerIndustry?: string;
      partnerCountry?: string;
      relationshipType: string;
      programDescription?: string;
      activeSince?: string;
      contextNote?: string;
    }) => {
      const res = await apiRequest("POST", `/api/entities/${encodeURIComponent(entityId)}/partnerships`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "partnerships"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (partnershipId: string) => {
      await apiRequest("DELETE", `/api/entities/${encodeURIComponent(entityId)}/partnerships/${partnershipId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities", entityId, "partnerships"] });
    },
  });

  function resetForm() {
    setFormPartnerName("");
    setFormIndustry("");
    setFormCountry("");
    setFormRelationshipType("strategic_partner");
    setFormProgramDescription("");
    setFormActiveSince("");
    setFormContextNote("");
    setShowForm(false);
  }

  function handleSave() {
    if (!formPartnerName.trim() || !formRelationshipType) return;
    createMutation.mutate({
      partnerName: formPartnerName.trim(),
      partnerIndustry: formIndustry.trim() || undefined,
      partnerCountry: formCountry.trim() || undefined,
      relationshipType: formRelationshipType,
      programDescription: formProgramDescription.trim() || undefined,
      activeSince: formActiveSince.trim() || undefined,
      contextNote: formContextNote.trim() || undefined,
    });
  }

  function handleDelete(partnershipId: string, partnerName: string) {
    if (!confirm(`Remove "${partnerName}" from partnerships?`)) return;
    deleteMutation.mutate(partnershipId);
  }

  const groupOrder = ["joint_venture", "strategic_partner", "integration", "reseller", "oem"];
  const grouped: Record<string, Partnership[]> = {};
  for (const p of partnerships) {
    const key = p.relationship_type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  const renderedSectionKeys: string[] = [];
  const groupedForDisplay: { sectionLabel: string; items: Partnership[] }[] = [];
  for (const key of groupOrder) {
    if (!grouped[key]) continue;
    const label = RELATIONSHIP_LABELS[key];
    if (renderedSectionKeys.includes(label)) continue;
    renderedSectionKeys.push(label);
    const allItemsForLabel = groupOrder
      .filter((k) => RELATIONSHIP_LABELS[k] === label && grouped[k])
      .flatMap((k) => grouped[k]);
    groupedForDisplay.push({ sectionLabel: label, items: allItemsForLabel });
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "0.5px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
      data-testid="card-partnerships"
    >
      <button
        className="w-full flex items-center justify-between px-5 py-4"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-partnerships-toggle"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1e3a5f]">Partnerships &amp; alliances</span>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: "#f1f5f9", color: "#64748b" }}
            data-testid="badge-partnerships-count"
          >
            {partnerships.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <button
              className="text-xs font-medium text-[#1e3a5f] flex items-center gap-0.5 px-2 py-1 rounded hover:bg-[#1e3a5f]/5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (!open) setOpen(true);
                setShowForm((v) => !v);
              }}
              data-testid="button-partnerships-add"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {showForm && (
            <div className="px-5 py-4 border-b border-slate-100 space-y-3 bg-slate-50/60">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Partner name *</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
                    value={formPartnerName}
                    onChange={(e) => setFormPartnerName(e.target.value)}
                    placeholder="Acme Corp"
                    data-testid="input-partnership-partner-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Relationship type *</label>
                  <select
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 bg-white"
                    value={formRelationshipType}
                    onChange={(e) => setFormRelationshipType(e.target.value)}
                    data-testid="select-partnership-relationship-type"
                  >
                    {RELATIONSHIP_TYPES.map((rt) => (
                      <option key={rt.value} value={rt.value}>{rt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Industry</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
                    value={formIndustry}
                    onChange={(e) => setFormIndustry(e.target.value)}
                    placeholder="e.g. Fintech"
                    data-testid="input-partnership-industry"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Country</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
                    value={formCountry}
                    onChange={(e) => setFormCountry(e.target.value)}
                    placeholder="e.g. United States"
                    data-testid="input-partnership-country"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Active since</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
                    value={formActiveSince}
                    onChange={(e) => setFormActiveSince(e.target.value)}
                    placeholder="e.g. 2022"
                    data-testid="input-partnership-active-since"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Context note</label>
                  <input
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30"
                    value={formContextNote}
                    onChange={(e) => setFormContextNote(e.target.value)}
                    placeholder="Brief note"
                    data-testid="input-partnership-context-note"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Program description</label>
                <textarea
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 resize-none"
                  rows={3}
                  value={formProgramDescription}
                  onChange={(e) => setFormProgramDescription(e.target.value)}
                  placeholder="Describe the partnership program…"
                  data-testid="textarea-partnership-description"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  onClick={resetForm}
                  data-testid="button-partnership-cancel"
                >
                  Cancel
                </button>
                <button
                  className="text-sm px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 transition-colors disabled:opacity-50"
                  onClick={handleSave}
                  disabled={!formPartnerName.trim() || createMutation.isPending}
                  data-testid="button-partnership-save"
                >
                  {createMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : partnerships.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400" data-testid="text-partnerships-empty">
              No partnerships logged yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {groupedForDisplay.map(({ sectionLabel, items }) => (
                <div key={sectionLabel}>
                  <div className="px-5 pt-3 pb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {sectionLabel}
                    </span>
                  </div>
                  {items.map((p) => {
                    const badge = BADGE_STYLES[p.relationship_type] || BADGE_STYLES.strategic_partner;
                    const badgeLabel = BADGE_LABEL[p.relationship_type] || p.relationship_type;
                    const inits = initials(p.partner_name);
                    return (
                      <div
                        key={p.id}
                        className="px-5 py-3 flex items-start gap-3 group"
                        data-testid={`item-partnership-${p.id}`}
                      >
                        <div
                          className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold"
                          style={{
                            width: 32,
                            height: 32,
                            background: badge.bg,
                            color: badge.color,
                          }}
                          aria-hidden
                        >
                          {inits}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-800" data-testid={`text-partnership-name-${p.id}`}>
                              {p.partner_name}
                            </span>
                            {(p.partner_industry || p.partner_country) && (
                              <span className="text-xs text-slate-400">
                                {[p.partner_industry, p.partner_country].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            <span
                              className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ background: badge.bg, color: badge.color }}
                              data-testid={`badge-partnership-type-${p.id}`}
                            >
                              {badgeLabel}
                            </span>
                          </div>
                          {p.program_description && (
                            <div
                              className="text-xs text-slate-600 rounded-md px-3 py-2 my-1"
                              style={{
                                background: "#f8fafc",
                                borderLeft: `3px solid ${badge.color}`,
                              }}
                              data-testid={`text-partnership-description-${p.id}`}
                            >
                              {p.program_description}
                            </div>
                          )}
                          {(p.active_since || p.context_note) && (
                            <div
                              className="text-slate-400"
                              style={{ fontSize: 11 }}
                              data-testid={`text-partnership-meta-${p.id}`}
                            >
                              {[
                                p.active_since ? `Active since ${p.active_since}` : null,
                                p.context_note,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </div>
                        {!isReadOnly && (
                          <button
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
                            onClick={() => handleDelete(p.id, p.partner_name)}
                            data-testid={`button-delete-partnership-${p.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
