import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRole } from "@/App";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Mail, Loader2, Copy, Check } from "lucide-react";

type SettingsSection = "account" | "notifications" | "email";

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
  { key: "account", label: "Account" },
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
