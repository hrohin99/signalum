import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRole } from "@/App";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Mail, X, Plus, Loader2, Copy, Check, GripVertical, Pencil } from "lucide-react";
import type { WorkspaceCapability } from "@shared/schema";

type SettingsSection = "account" | "product" | "capabilities" | "notifications" | "email";

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: "account", label: "Account" },
  { key: "product", label: "My product" },
  { key: "capabilities", label: "Capabilities" },
  { key: "notifications", label: "Notifications" },
  { key: "email", label: "Email capture" },
];

const inputStyle: React.CSSProperties = {
  border: "0.5px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "0.5px solid #e5e7eb",
  borderRadius: "12px",
};

function AccountSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");

  const { data: profileData } = useQuery<any>({
    queryKey: ["/api/workspace/profile"],
  });

  useEffect(() => {
    if (profileData) {
      setDisplayName(profileData.display_name || "");
      setRole(profileData.user_perspective || "");
    }
  }, [profileData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/workspace/profile", {
        displayName: displayName,
        userPerspective: role,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/profile"] });
      toast({
        title: "Account updated",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div style={cardStyle}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1" data-testid="text-account-header">Account</h3>
        <p className="text-sm text-gray-500 mb-5">Your personal account details.</p>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wide">Email</Label>
            <p className="text-sm mt-1" style={{ color: "#374151" }} data-testid="text-user-email">{user?.email}</p>
          </div>

          <div style={{ borderBottom: "0.5px solid #e5e7eb" }} />

          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wide">User ID</Label>
            <p className="text-sm mt-1 font-mono text-gray-600" data-testid="text-user-id">{user?.id}</p>
          </div>

          <div style={{ borderBottom: "0.5px solid #e5e7eb" }} />

          {isEditor ? (
            <>
              <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Display name</Label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  style={inputStyle}
                  className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                  data-testid="input-display-name"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Role</Label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Product Manager"
                  style={inputStyle}
                  className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                  data-testid="input-role"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wide">Display name</Label>
                <p className="text-sm mt-1 text-gray-700" data-testid="input-display-name">{displayName || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wide">Role</Label>
                <p className="text-sm mt-1 text-gray-700" data-testid="input-role">{role || "—"}</p>
              </div>
            </>
          )}
        </div>

        {isEditor && (
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full mt-6 text-white"
            style={{ background: "#534AB7", borderRadius: "8px" }}
            data-testid="button-save-account"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}

function IntelligenceProfileForm() {
  const { toast } = useToast();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const [userPerspective, setUserPerspective] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgGeographies, setOrgGeographies] = useState("");
  const [trackingTypes, setTrackingTypes] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [winFactors, setWinFactors] = useState("");
  const [vulnerability, setVulnerability] = useState("");
  const [earlyWarningSignal, setEarlyWarningSignal] = useState("");

  const { data: profileData } = useQuery<any>({
    queryKey: ["/api/workspace/profile"],
  });

  useEffect(() => {
    if (profileData) {
      setUserPerspective(profileData.user_perspective || "");
      setOrgDescription(profileData.org_description || "");
      const geos = Array.isArray(profileData.org_geographies)
        ? profileData.org_geographies.join(", ")
        : (profileData.org_geographies || "");
      setOrgGeographies(geos);
      const types = Array.isArray(profileData.tracking_types)
        ? profileData.tracking_types.join(", ")
        : (profileData.tracking_types || "");
      setTrackingTypes(types);
      const comps = Array.isArray(profileData.competitors)
        ? profileData.competitors.filter(Boolean).join(", ")
        : (typeof profileData.competitors === "string"
            ? profileData.competitors.replace(/^\{|\}$/g, "").replace(/"/g, "")
            : "");
      setCompetitors(comps);
      setWinFactors(profileData.win_factors || "");
      setVulnerability(profileData.vulnerability || "");
      setEarlyWarningSignal(profileData.early_warning_signal || "");
    }
  }, [profileData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/workspace/profile", {
        userPerspective: userPerspective,
        orgDescription: orgDescription,
        orgGeographies: orgGeographies.split(",").map((s: string) => s.trim()).filter(Boolean),
        trackingTypes: trackingTypes.split(",").map((s: string) => s.trim()).filter(Boolean),
        competitors: competitors,
        winFactors: winFactors,
        vulnerability: vulnerability,
        earlyWarningSignal: earlyWarningSignal,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/profile"] });
      toast({
        title: "Intelligence profile saved",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Your perspective</Label>
        {isEditor ? (
          <select value={userPerspective} onChange={e => setUserPerspective(e.target.value)}
            style={inputStyle} className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30">
            <option value="">Select your perspective</option>
            <option value="vendor">Product or Technology Vendor</option>
            <option value="business_owner">Business Owner</option>
            <option value="government">Government or Public Sector</option>
            <option value="analyst">Analyst or Consultant</option>
            <option value="sales">Sales or BD</option>
            <option value="legal_compliance">Legal or Compliance</option>
          </select>
        ) : <p className="text-sm text-gray-700">{userPerspective || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Organisation description</Label>
        {isEditor ? (
          <textarea value={orgDescription} onChange={e => setOrgDescription(e.target.value)}
            placeholder="Describe your organisation" rows={2}
            style={{ ...inputStyle, resize: "vertical" as const }}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{orgDescription || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Target geographies</Label>
        {isEditor ? (
          <input value={orgGeographies} onChange={e => setOrgGeographies(e.target.value)}
            placeholder="e.g. United Kingdom, North America (comma separated)" style={inputStyle}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{orgGeographies || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">What you're tracking</Label>
        {isEditor ? (
          <input value={trackingTypes} onChange={e => setTrackingTypes(e.target.value)}
            placeholder="e.g. competitors, regulations, standards (comma separated)" style={inputStyle}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{trackingTypes || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Competitors</Label>
        {isEditor ? (
          <input value={competitors} onChange={e => setCompetitors(e.target.value)}
            placeholder="e.g. iProov, Paravision, Mitek (comma separated)" style={inputStyle}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{competitors || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">We win on</Label>
        {isEditor ? (
          <textarea value={winFactors} onChange={e => setWinFactors(e.target.value)}
            placeholder="What gives you a competitive edge?" rows={2}
            style={{ ...inputStyle, resize: "vertical" as const }}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{winFactors || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">We're vulnerable on</Label>
        {isEditor ? (
          <textarea value={vulnerability} onChange={e => setVulnerability(e.target.value)}
            placeholder="Where could competitors attack you?" rows={2}
            style={{ ...inputStyle, resize: "vertical" as const }}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{vulnerability || "—"}</p>}
      </div>
      <div>
        <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Early warning signal</Label>
        {isEditor ? (
          <textarea value={earlyWarningSignal} onChange={e => setEarlyWarningSignal(e.target.value)}
            placeholder="What event should trigger an immediate alert?" rows={2}
            style={{ ...inputStyle, resize: "vertical" as const }}
            className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30" />
        ) : <p className="text-sm text-gray-700">{earlyWarningSignal || "—"}</p>}
      </div>
      {isEditor && (
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="w-full text-white" style={{ background: "#534AB7", borderRadius: "8px" }}>
          {saveMutation.isPending ? "Saving..." : "Save Intelligence Profile"}
        </Button>
      )}
    </div>
  );
}

function ProductSection() {
  const { toast } = useToast();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");

  const { data: productData, isLoading: isLoadingProduct } = useQuery<{ productContext: any }>({
    queryKey: ["/api/product-context"],
  });

  useEffect(() => {
    if (productData?.productContext) {
      const ctx = productData.productContext;
      setProductName(ctx.productName || "");
      setDescription(ctx.description || "");
      setTargetCustomer(ctx.targetCustomer || "");
      setStrengths(ctx.strengths || "");
      setWeaknesses(ctx.weaknesses || "");
    }
  }, [productData]);

  const saveProductMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/product-context", {
        productName,
        description,
        targetCustomer,
        strengths,
        weaknesses,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-context"] });
      toast({
        title: "Product context saved",
        description: "Signalum will now use this for competitive insights.",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving product context", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    saveProductMutation.mutate();
  };

  if (isLoadingProduct) {
    return (
      <div style={cardStyle} className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
    <div style={cardStyle}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1" data-testid="text-my-product-header">My Product</h3>
        <p className="text-sm text-gray-500 mb-5">Help Signalum give you personalised competitive insights by describing what you offer.</p>

        {isEditor ? (
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Product name</Label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Signalum, Acme Platform"
              style={inputStyle}
              className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              data-testid="input-product-name"
            />
          </div>

          <div style={{ borderBottom: "0.5px solid #e5e7eb" }} />

          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">What it does</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your product or service in plain English"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" as const }}
              className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              data-testid="input-product-description"
            />
          </div>

          <div>
            <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Who it is for</Label>
            <textarea
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
              placeholder="Describe your target customer and their main pain point"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" as const }}
              className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              data-testid="input-target-customer"
            />
          </div>

          <div style={{ borderBottom: "0.5px solid #e5e7eb" }} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Key strengths</Label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="What does your product do better than anyone else?"
                rows={4}
                style={{ ...inputStyle, resize: "vertical" as const }}
                className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                data-testid="input-strengths"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wide mb-1.5 block">Key weaknesses</Label>
              <textarea
                value={weaknesses}
                onChange={(e) => setWeaknesses(e.target.value)}
                placeholder="Where do you have honest limitations or gaps?"
                rows={4}
                style={{ ...inputStyle, resize: "vertical" as const }}
                className="w-full outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                data-testid="input-weaknesses"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full text-white"
            style={{ background: "#534AB7", borderRadius: "8px" }}
            disabled={saveProductMutation.isPending || !productName.trim()}
            data-testid="button-save-product"
          >
            {saveProductMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Product name</Label>
              <p className="text-sm mt-1 text-gray-700" data-testid="input-product-name">{productName || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wide">What it does</Label>
              <p className="text-sm mt-1 text-gray-700" data-testid="input-product-description">{description || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Who it is for</Label>
              <p className="text-sm mt-1 text-gray-700" data-testid="input-target-customer">{targetCustomer || "—"}</p>
            </div>
          </div>
        )}
      </div>
    </div>

    <div style={{...cardStyle, marginTop: "16px"}}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1">Intelligence Profile</h3>
        <p className="text-sm text-gray-500 mb-5">This context personalises every insight, briefing, and analysis Signalum generates for you. These were set during onboarding and can be updated here.</p>
        <IntelligenceProfileForm />
      </div>
    </div>
    </>
  );
}

const STATUS_STYLES_SETTINGS: Record<string, { bg: string; color: string; label: string; title: string }> = {
  yes: { bg: "#1a3a1a", color: "#4ade80", label: "✓", title: "Has this capability" },
  partial: { bg: "#3a2e00", color: "#fbbf24", label: "~", title: "Partial capability" },
  no: { bg: "#2a2a2a", color: "#94a3b8", label: "—", title: "Does not have this capability" },
  unknown: { bg: "#f1f5f9", color: "#94a3b8", label: "·", title: "Not set" },
};

const STATUS_CYCLE: Record<string, string> = { yes: "partial", partial: "no", no: "unknown", unknown: "yes" };

function CapabilitiesSection() {
  const { toast } = useToast();
  const { role: userRole } = useRole();
  const isEditor = userRole === "admin" || userRole === "sub_admin";
  const [newCapName, setNewCapName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data: capData, isLoading } = useQuery<{ capabilities: WorkspaceCapability[] }>({
    queryKey: ["/api/capabilities"],
  });

  const { data: ourCapData } = useQuery<{ ourProductCapabilities: Array<{ capabilityId: string; status: string }> }>({
    queryKey: ["/api/our-product-capabilities"],
  });

  const updateOurCapMutation = useMutation({
    mutationFn: async ({ capabilityId, status }: { capabilityId: string; status: string }) => {
      const res = await apiRequest("PUT", "/api/our-product-capabilities", { capabilityId, status });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/our-product-capabilities"] });
      setLocalStatuses(prev => { const next = { ...prev }; delete next[variables.capabilityId]; return next; });
    },
    onError: (error: Error, variables) => {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      setLocalStatuses(prev => { const next = { ...prev }; delete next[variables.capabilityId]; return next; });
    },
  });

  const getOurStatus = (capId: string) => {
    if (localStatuses[capId] !== undefined) return localStatuses[capId];
    const found = ourCapData?.ourProductCapabilities?.find(c => c.capabilityId === capId);
    return found?.status || "unknown";
  };

  const cycleOurStatus = (capId: string) => {
    const current = getOurStatus(capId);
    const next = STATUS_CYCLE[current] || "yes";
    setLocalStatuses(prev => ({ ...prev, [capId]: next }));
    updateOurCapMutation.mutate({ capabilityId: capId, status: next });
  };

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{ suggestions: string[] }>({
    queryKey: ["/api/capabilities/suggest"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/capabilities/suggest", {});
      return res.json();
    },
    enabled: !isLoading && (!capData?.capabilities || capData.capabilities.length === 0),
    staleTime: 5 * 60 * 1000,
  });

  const capabilities = capData?.capabilities || [];

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/capabilities", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capabilities"] });
      setNewCapName("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PUT", `/api/capabilities/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capabilities"] });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/capabilities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capabilities"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await apiRequest("PUT", "/api/capabilities/reorder", { orderedIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/capabilities"] });
    },
  });

  const handleAdd = () => {
    if (newCapName.trim()) {
      addMutation.mutate(newCapName.trim());
    }
  };

  const handleEditSave = () => {
    if (editingId && editingName.trim()) {
      updateMutation.mutate({ id: editingId, name: editingName.trim() });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    addMutation.mutate(suggestion);
  };

  const handleDragStart = (index: number) => { setDragIndex(index); };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index); };
  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); setDragOverIndex(null); return; }
    const items = [...capabilities];
    const [moved] = items.splice(dragIndex, 1);
    items.splice(index, 0, moved);
    reorderMutation.mutate(items.map(i => i.id));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  useEffect(() => {
    if (editingId && editInputRef.current) { editInputRef.current.focus(); }
  }, [editingId]);

  return (
    <div style={cardStyle}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1" data-testid="text-capabilities-header">Capabilities</h3>
        <p className="text-sm text-gray-500 mb-3">Define the capabilities that matter in your market. Click the status icon to set whether your product has each capability.</p>
        <div className="flex items-center gap-3 mb-1 px-6" style={{ paddingLeft: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>Capability</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", width: 80, textAlign: "center" }}>Our Product</div>
          {isEditor && <div style={{ width: 56 }} />}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-0">
            {isEditor && capabilities.length === 0 && suggestionsData?.suggestions && suggestionsData.suggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-400 mb-2">Suggested for your market:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestionsData.suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(suggestion)}
                      disabled={addMutation.isPending}
                      className="px-3 py-1.5 rounded-full text-sm bg-gray-50 text-gray-500 hover:bg-[#EEEDFE] hover:text-[#534AB7] transition-colors cursor-pointer"
                      style={{ border: "0.5px solid #e5e7eb" }}
                      data-testid={`button-suggestion-${i}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {suggestionsLoading && capabilities.length === 0 && (
              <div className="flex items-center gap-2 py-3 mb-4">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-400">Generating suggestions...</span>
              </div>
            )}

            {capabilities.map((cap, index) => {
              const ourStatus = getOurStatus(cap.id);
              const ourStyle = STATUS_STYLES_SETTINGS[ourStatus] || STATUS_STYLES_SETTINGS.unknown;
              return (
                <div
                  key={cap.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  className={`flex items-center gap-2 py-2.5 group transition-colors ${
                    dragOverIndex === index ? "bg-[#EEEDFE]/50" : ""
                  }`}
                  style={{ borderBottom: "0.5px solid #f3f4f6" }}
                  data-testid={`row-capability-${cap.id}`}
                >
                  <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />
                  {editingId === cap.id ? (
                    <input
                      ref={editInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditSave();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={handleEditSave}
                      style={{ ...inputStyle, height: "28px", fontSize: "13px" }}
                      className="flex-1 outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                      data-testid="input-edit-capability"
                    />
                  ) : (
                    <span className="text-sm text-gray-700 flex-1" data-testid={`text-capability-name-${cap.id}`}>{cap.name}</span>
                  )}
                  <div style={{ width: 80, display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => cycleOurStatus(cap.id)}
                      title={ourStyle.title}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: ourStyle.bg, color: ourStyle.color, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}
                      data-testid={`button-our-status-${cap.id}`}
                    >
                      {ourStyle.label}
                    </button>
                  </div>
                  {isEditor && (
                    <button
                      onClick={() => { setEditingId(cap.id); setEditingName(cap.name); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-[#534AB7] transition-opacity"
                      data-testid={`button-edit-capability-${cap.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isEditor && (
                    <button
                      onClick={() => deleteMutation.mutate(cap.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                      data-testid={`button-delete-capability-${cap.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {isEditor && (
              <div className="flex items-center gap-2 mt-4">
                <input
                  ref={addInputRef}
                  value={newCapName}
                  onChange={(e) => setNewCapName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                  placeholder="Add a capability..."
                  style={inputStyle}
                  className="flex-1 outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                  data-testid="input-new-capability"
                />
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newCapName.trim() || addMutation.isPending}
                  className="text-white h-9 px-4"
                  style={{ background: "#534AB7", borderRadius: "8px" }}
                  data-testid="button-save-capability"
                >
                  {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                    <span className="flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</span>
                  )}
                </Button>
              </div>
            )}

            {capabilities.length >= 15 && (
              <p className="text-xs text-gray-400 mt-2">Maximum of 15 capabilities reached.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsSection() {
  const { toast } = useToast();

  const { data: digestData } = useQuery<{ weeklyDigestEnabled: boolean }>({
    queryKey: ["/api/settings/weekly-digest"],
  });

  const [todaysBrief, setTodaysBrief] = useState(() => {
    try { return localStorage.getItem("settings_todays_brief") === "true"; } catch { return false; }
  });
  const [entitySuggestions, setEntitySuggestions] = useState(() => {
    try { return localStorage.getItem("settings_entity_suggestions") === "true"; } catch { return false; }
  });

  const digestMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/settings/weekly-digest", { enabled });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/weekly-digest"] });
      toast({
        title: data.weeklyDigestEnabled ? "Weekly digest enabled" : "Weekly digest disabled",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleTodaysBrief = (val: boolean) => {
    setTodaysBrief(val);
    try { localStorage.setItem("settings_todays_brief", String(val)); } catch {}
    toast({
      title: val ? "Today's brief enabled" : "Today's brief disabled",
      className: "bg-green-50 border-green-200 text-green-800",
    });
  };

  const handleEntitySuggestions = (val: boolean) => {
    setEntitySuggestions(val);
    try { localStorage.setItem("settings_entity_suggestions", String(val)); } catch {}
    toast({
      title: val ? "Entity suggestions enabled" : "Entity suggestions disabled",
      className: "bg-green-50 border-green-200 text-green-800",
    });
  };

  return (
    <div style={cardStyle}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1" data-testid="text-notifications-header">Notifications</h3>
        <p className="text-sm text-gray-500 mb-5">Manage how you receive updates.</p>

        <div>
          <div className="flex items-center justify-between py-4" style={{ borderBottom: "0.5px solid #e5e7eb" }} data-testid="row-weekly-digest">
            <div className="flex-1 mr-4">
              <Label className="text-sm font-medium cursor-pointer">Weekly digest email</Label>
              <p className="text-xs text-gray-400 mt-0.5">Monday morning summary of your workspace changes.</p>
            </div>
            <Switch
              checked={digestData?.weeklyDigestEnabled ?? false}
              onCheckedChange={(checked) => digestMutation.mutate(checked)}
              disabled={digestMutation.isPending}
              data-testid="switch-weekly-digest"
            />
          </div>

          <div className="flex items-center justify-between py-4" style={{ borderBottom: "0.5px solid #e5e7eb" }} data-testid="row-todays-brief">
            <div className="flex-1 mr-4">
              <Label className="text-sm font-medium cursor-pointer">Today's brief</Label>
              <p className="text-xs text-gray-400 mt-0.5">Get a daily brief of the most important updates.</p>
            </div>
            <Switch
              checked={todaysBrief}
              onCheckedChange={handleTodaysBrief}
              data-testid="switch-todays-brief"
            />
          </div>

          <div className="flex items-center justify-between py-4" data-testid="row-entity-suggestions">
            <div className="flex-1 mr-4">
              <Label className="text-sm font-medium cursor-pointer">New entity suggestions</Label>
              <p className="text-xs text-gray-400 mt-0.5">Get notified when new entities are suggested for tracking.</p>
            </div>
            <Switch
              checked={entitySuggestions}
              onCheckedChange={handleEntitySuggestions}
              data-testid="switch-entity-suggestions"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailCaptureSection() {
  const [copied, setCopied] = useState(false);

  const { data: captureData, isLoading } = useQuery<{ captureEmail: string }>({
    queryKey: ["/api/config/capture-email"],
  });

  const captureEmail = captureData?.captureEmail || "";

  const handleCopy = () => {
    navigator.clipboard.writeText(captureEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={cardStyle}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold" data-testid="text-email-capture-header">Email Capture</h3>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ background: "#16a34a", fontSize: "11px" }}
            data-testid="badge-email-live"
          >
            Live
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-5">Forward any competitor newsletter or announcement to your personal capture address and it files automatically.</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="flex-1 flex items-center px-3 py-2.5 bg-gray-50 rounded-lg font-mono text-sm text-gray-700 select-all"
              style={{ border: "0.5px solid #e5e7eb", borderRadius: "8px", fontSize: "13px" }}
              data-testid="text-capture-email"
            >
              <Mail className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
              <span className="truncate">{captureEmail}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-10 px-3 flex-shrink-0"
              style={{ borderRadius: "8px", border: "0.5px solid #e5e7eb" }}
              data-testid="button-copy-capture-email"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>("account");

  const renderSection = () => {
    switch (activeSection) {
      case "account": return <AccountSection />;
      case "product": return <ProductSection />;
      case "capabilities": return <CapabilitiesSection />;
      case "notifications": return <NotificationsSection />;
      case "email": return <EmailCaptureSection />;
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account and workspace preferences.</p>
      </div>

      <div className="flex gap-8">
        <nav className="flex-shrink-0" style={{ width: "180px" }}>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{
                  borderRadius: "8px",
                  background: activeSection === item.key ? "#EEEDFE" : "transparent",
                  color: activeSection === item.key ? "#534AB7" : "#6b7280",
                  fontWeight: activeSection === item.key ? 500 : 400,
                }}
                data-testid={`nav-${item.key}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-8 pt-4" style={{ borderTop: "0.5px solid #e5e7eb" }}>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:text-red-600 transition-colors w-full text-left"
              style={{ borderRadius: "8px" }}
              data-testid="button-settings-sign-out"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
