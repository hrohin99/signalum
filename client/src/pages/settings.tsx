import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LogOut, User, Pencil, Package, Mail, Search, Bell, GripVertical, X, Plus, Loader2, Crosshair } from "lucide-react";
import { ComingSoonCard } from "@/components/coming-soon-card";
import type { WorkspaceCapability } from "@shared/schema";

function CapabilitiesCard() {
  const { toast } = useToast();
  const [newCapName, setNewCapName] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data: capData, isLoading } = useQuery<{ capabilities: WorkspaceCapability[] }>({
    queryKey: ["/api/capabilities"],
  });

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
      setShowAddInput(false);
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

  const handleSuggestionClick = (suggestion: string) => {
    addMutation.mutate(suggestion);
  };

  const handleEditSave = () => {
    if (editingId && editingName.trim()) {
      updateMutation.mutate({ id: editingId, name: editingName.trim() });
    }
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const items = [...capabilities];
    const [moved] = items.splice(dragIndex, 1);
    items.splice(index, 0, moved);
    reorderMutation.mutate(items.map(i => i.id));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  useEffect(() => {
    if (showAddInput && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddInput]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-[#1e3a5f]" />
          </div>
          <div>
            <h3 className="font-medium text-foreground" data-testid="text-capabilities-header">Market Capabilities</h3>
            <p className="text-sm text-[#1e3a5f]">Define the capabilities that matter in your market. Watchloom will track these across all your competitors.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 space-y-1">
            {capabilities.length === 0 && !showAddInput && (
              <div className="space-y-3">
                {suggestionsLoading ? (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Generating suggestions...</span>
                  </div>
                ) : suggestionsData?.suggestions && suggestionsData.suggestions.length > 0 ? (
                  <div className="py-2">
                    <p className="text-xs text-muted-foreground mb-2">Suggested for your market:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestionsData.suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestionClick(suggestion)}
                          disabled={addMutation.isPending}
                          className="px-3 py-1.5 rounded-full text-sm bg-slate-100 text-slate-500 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] transition-colors cursor-pointer border border-slate-200"
                          data-testid={`button-suggestion-${i}`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {capabilities.map((cap, index) => (
              <div
                key={cap.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg group transition-colors ${
                  dragOverIndex === index ? "bg-[#1e3a5f]/5 border border-[#1e3a5f]/20" : "hover:bg-slate-50 border border-transparent"
                }`}
                data-testid={`row-capability-${cap.id}`}
              >
                <GripVertical className="w-4 h-4 text-slate-300 cursor-grab flex-shrink-0" />
                {editingId === cap.id ? (
                  <Input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditSave();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={handleEditSave}
                    className="h-7 text-sm flex-1"
                    data-testid="input-edit-capability"
                  />
                ) : (
                  <span className="text-sm flex-1" data-testid={`text-capability-name-${cap.id}`}>{cap.name}</span>
                )}
                <button
                  onClick={() => { setEditingId(cap.id); setEditingName(cap.name); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-[#1e3a5f] transition-opacity"
                  data-testid={`button-edit-capability-${cap.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(cap.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
                  data-testid={`button-delete-capability-${cap.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {showAddInput ? (
              <div className="flex items-center gap-2 px-2 py-1">
                <Input
                  ref={addInputRef}
                  value={newCapName}
                  onChange={(e) => setNewCapName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") { setShowAddInput(false); setNewCapName(""); }
                  }}
                  placeholder="e.g. Passive liveness detection"
                  className="h-8 text-sm flex-1"
                  data-testid="input-new-capability"
                />
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newCapName.trim() || addMutation.isPending}
                  className="h-8 bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
                  data-testid="button-save-capability"
                >
                  {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            ) : (
              capabilities.length < 15 && (
                <button
                  onClick={() => setShowAddInput(true)}
                  className="flex items-center gap-1.5 text-[#1e3a5f] hover:text-[#1e3a5f]/80 text-sm px-2 py-2 transition-colors"
                  data-testid="button-add-capability"
                >
                  <Plus className="w-4 h-4" />
                  Add capability
                </button>
              )
            )}

            {capabilities.length >= 15 && (
              <p className="text-xs text-muted-foreground px-2 pt-1">Maximum of 15 capabilities reached.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

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

  const hasSavedProduct = !!productData?.productContext;

  const { data: digestData } = useQuery<{ weeklyDigestEnabled: boolean }>({
    queryKey: ["/api/settings/weekly-digest"],
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
        description: data.weeklyDigestEnabled
          ? "You'll receive a Monday morning summary email."
          : "You won't receive weekly digest emails.",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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
        description: "Watchloom will now use this for competitive insights.",
        variant: "default",
        className: "bg-green-50 border-green-200 text-green-800",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving product context",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    saveProductMutation.mutate();
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and workspace preferences.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                <User className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Account</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">User ID</Label>
                <p className="text-sm font-mono mt-1" data-testid="text-user-id">{user?.id}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Email</Label>
                <p className="text-sm mt-1" data-testid="text-user-email">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <div>
                <h3 className="font-medium text-foreground" data-testid="text-notifications-header">Notifications</h3>
                <p className="text-sm text-muted-foreground">Manage how you receive updates.</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-border" data-testid="row-weekly-digest">
              <div className="flex-1 mr-4">
                <Label htmlFor="weekly-digest" className="text-sm font-medium cursor-pointer">Weekly digest email</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get a weekly Monday morning summary of everything that changed across your workspace.
                </p>
              </div>
              <Switch
                id="weekly-digest"
                checked={digestData?.weeklyDigestEnabled ?? false}
                onCheckedChange={(checked) => digestMutation.mutate(checked)}
                disabled={digestMutation.isPending}
                data-testid="switch-weekly-digest"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <div>
                <h3 className="font-medium text-foreground" data-testid="text-my-product-header">My Product</h3>
                <p className="text-sm text-[#1e3a5f]">Help Watchloom give you personalised competitive insights by describing what you offer.</p>
              </div>
            </div>

            {!isLoadingProduct && !hasSavedProduct && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 my-4" data-testid="banner-product-context">
                <Pencil className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  Add your product details so Watchloom can generate personalised competitive intelligence.
                </p>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="productName" className="text-sm font-medium">Product name</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Watchloom, Acme Platform"
                  className="mt-1"
                  data-testid="input-product-name"
                />
              </div>

              <div>
                <Label htmlFor="description" className="text-sm font-medium">What it does</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your product or service in plain English"
                  rows={3}
                  className="mt-1"
                  data-testid="input-product-description"
                />
              </div>

              <div>
                <Label htmlFor="targetCustomer" className="text-sm font-medium">Who it is for</Label>
                <Textarea
                  id="targetCustomer"
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="Describe your target customer and their main pain point"
                  rows={3}
                  className="mt-1"
                  data-testid="input-target-customer"
                />
              </div>

              <div>
                <Label htmlFor="strengths" className="text-sm font-medium">Key strengths</Label>
                <Textarea
                  id="strengths"
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  placeholder="What does your product do better than anyone else?"
                  rows={3}
                  className="mt-1"
                  data-testid="input-strengths"
                />
              </div>

              <div>
                <Label htmlFor="weaknesses" className="text-sm font-medium">Key weaknesses or gaps</Label>
                <Textarea
                  id="weaknesses"
                  value={weaknesses}
                  onChange={(e) => setWeaknesses(e.target.value)}
                  placeholder="Where do you have honest limitations or gaps?"
                  rows={3}
                  className="mt-1"
                  data-testid="input-weaknesses"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
                disabled={saveProductMutation.isPending || !productName.trim()}
                data-testid="button-save-product"
              >
                {saveProductMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <CapabilitiesCard />

        <ComingSoonCard
          featureName="email_capture"
          title="Email Capture"
          description="Forward any competitor newsletter or announcement to your personal Watchloom address and it files automatically."
          icon={<Mail className="w-5 h-5 text-[#1e3a5f]" />}
        />

        <ComingSoonCard
          featureName="search"
          title="Search Your Intelligence"
          description="Ask questions across all your captured intelligence. Find anything across every topic, category, and update instantly."
          icon={<Search className="w-5 h-5 text-[#1e3a5f]" />}
        />

        <Button
          variant="outline"
          onClick={signOut}
          className="text-destructive"
          data-testid="button-settings-sign-out"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
