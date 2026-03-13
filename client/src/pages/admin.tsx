import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Loader2, Search, Users, MessageSquare, BarChart3 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ADMIN_EMAIL = "hrohin99@gmail.com";

interface FeedbackRow {
  id: string;
  mood: string;
  message: string;
  createdAt: string;
  userEmail: string;
}

interface FeatureInterestSummary {
  featureName: string;
  count: number;
  emails: string[];
}

interface AdminUser {
  userId: string;
  email: string;
  role: string;
  createdAt: string;
  lastSignIn: string | null;
  topicCount: number;
}

interface AdminStats {
  feedback: FeedbackRow[];
  featureInterest: FeatureInterestSummary[];
  users: AdminUser[];
}

type Section = "users" | "feedback" | "feature_interest";

const moodLabels: Record<string, string> = {
  loving_it: "Loving it",
  its_okay: "It's okay",
  needs_work: "Needs work",
  frustrated: "Frustrated",
  happy: "Happy",
  neutral: "Neutral",
  sad: "Sad",
  love: "Love",
  angry: "Angry",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { bg: string; color: string; border?: string }> = {
    admin: { bg: "#EEEDFE", color: "#534AB7" },
    sub_admin: { bg: "#E6F1FB", color: "#185FA5" },
    read_only: { bg: "transparent", color: "#6b7280", border: "1px solid #d1d5db" },
    suspended: { bg: "#FCEBEB", color: "#A32D2D" },
  };
  const s = styles[role] || styles.read_only;
  const label = role === "sub_admin" ? "Sub-Admin" : role === "read_only" ? "Read Only" : role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <span
      data-testid={`badge-role-${role}`}
      style={{ background: s.bg, color: s.color, border: s.border || "none", fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: 500, whiteSpace: "nowrap" }}
    >
      {label}
    </span>
  );
}

function MoodBadge({ mood }: { mood: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    loving_it: { bg: "#EAF3DE", color: "#3B6D11" },
    love: { bg: "#EAF3DE", color: "#3B6D11" },
    happy: { bg: "#EAF3DE", color: "#3B6D11" },
    its_okay: { bg: "#FAEEDA", color: "#854F0B" },
    neutral: { bg: "#FAEEDA", color: "#854F0B" },
  };
  const c = colorMap[mood] || { bg: "#f3f4f6", color: "#6b7280" };
  const label = moodLabels[mood] || mood;
  return (
    <span
      data-testid={`badge-mood-${mood}`}
      style={{ background: c.bg, color: c.color, fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: 500 }}
    >
      {label}
    </span>
  );
}

function UsersSection({ users, currentEmail }: { users: AdminUser[]; currentEmail: string }) {
  const [showInvite, setShowInvite] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("read_only");
  const { toast } = useToast();

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      await apiRequest("POST", "/api/admin/invite-user", data);
    },
    onSuccess: () => {
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("read_only");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Invite sent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to send invite", variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Role updated" });
    },
    onError: () => {
      toast({ title: "Failed to update role", variant: "destructive" });
    },
  });

  const resetPwdMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
    },
    onSuccess: () => {
      toast({ title: "Password reset email sent" });
    },
    onError: () => {
      toast({ title: "Failed to send password reset", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "User deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete user", variant: "destructive" });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[18px] font-semibold text-[#111]" data-testid="text-users-title">Users</h2>
          <p className="text-[13px] text-[#888] mt-0.5">Manage access, roles and permissions.</p>
        </div>
        <button
          data-testid="button-invite-user"
          onClick={() => setShowInvite(!showInvite)}
          style={{ background: "#534AB7", color: "#fff", fontSize: "13px", padding: "7px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 500 }}
        >
          Invite user
        </button>
      </div>

      {showInvite && (
        <div
          data-testid="card-invite-form"
          style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}
        >
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[12px] font-medium text-[#555] mb-1">Email address</label>
              <input
                data-testid="input-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                style={{ width: "100%", padding: "7px 10px", fontSize: "13px", border: "0.5px solid #d1d5db", borderRadius: "8px", outline: "none" }}
              />
            </div>
            <div style={{ width: "160px" }}>
              <label className="block text-[12px] font-medium text-[#555] mb-1">Role</label>
              <select
                data-testid="select-invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", fontSize: "13px", border: "0.5px solid #d1d5db", borderRadius: "8px", outline: "none", background: "#fff" }}
              >
                <option value="sub_admin">Sub-Admin</option>
                <option value="read_only">Read Only</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4" style={{ borderTop: "0.5px solid #e5e7eb", paddingTop: "14px" }}>
            <button
              data-testid="button-cancel-invite"
              onClick={() => { setShowInvite(false); setInviteEmail(""); }}
              style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#555" }}
            >
              Cancel
            </button>
            <button
              data-testid="button-send-invite"
              disabled={inviteMutation.isPending || !inviteEmail}
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              style={{ background: "#534AB7", color: "#fff", fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 500, opacity: inviteMutation.isPending ? 0.6 : 1 }}
            >
              {inviteMutation.isPending ? "Sending..." : "Send invite"}
            </button>
          </div>
        </div>
      )}

      <div
        data-testid="card-users-table"
        style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px", overflow: "hidden" }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "0.5px solid #e5e7eb" }}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#333]">All users</span>
            <span
              data-testid="badge-users-count"
              style={{ background: "#f3f4f6", fontSize: "11px", padding: "1px 7px", borderRadius: "10px", color: "#666", fontWeight: 500 }}
            >
              {users.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aaa]" />
            <input
              data-testid="input-search-users"
              type="text"
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "28px", padding: "5px 10px 5px 28px", fontSize: "12px", border: "0.5px solid #d1d5db", borderRadius: "6px", outline: "none", width: "200px" }}
            />
          </div>
        </div>

        <table className="w-full text-[12px]" data-testid="table-users">
          <thead>
            <tr style={{ borderBottom: "0.5px solid #e5e7eb" }}>
              <th className="text-left px-4 py-2.5 font-medium text-[#888] text-[11px]">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-[#888] text-[11px]">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-[#888] text-[11px]">Joined</th>
              <th className="text-left px-4 py-2.5 font-medium text-[#888] text-[11px]">Last active</th>
              <th className="text-left px-4 py-2.5 font-medium text-[#888] text-[11px]">Topics</th>
              <th className="text-left px-4 py-2.5 font-medium text-[#888] text-[11px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u, idx) => {
              const isCurrentAdmin = u.email === currentEmail;
              return (
                <tr key={u.userId || idx} style={{ borderBottom: "0.5px solid #f3f4f6" }} data-testid={`row-user-${u.userId}`}>
                  <td className="px-4 py-2.5 text-[13px]">{u.email}</td>
                  <td className="px-4 py-2.5">
                    {isCurrentAdmin ? (
                      <RoleBadge role="admin" />
                    ) : (
                      <select
                        data-testid={`select-role-${u.userId}`}
                        value={u.role}
                        onChange={(e) => roleMutation.mutate({ userId: u.userId, role: e.target.value })}
                        style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}
                      >
                        <option value="admin">Admin</option>
                        <option value="sub_admin">Sub-Admin</option>
                        <option value="read_only">Read Only</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{u.lastSignIn ? formatDate(u.lastSignIn) : "—"}</td>
                  <td className="px-4 py-2.5 text-center">{u.topicCount}</td>
                  <td className="px-4 py-2.5">
                    {isCurrentAdmin ? (
                      <span className="text-[11px] text-[#aaa]">—</span>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          data-testid={`button-reset-pwd-${u.userId}`}
                          onClick={() => resetPwdMutation.mutate(u.userId)}
                          className="admin-action-btn"
                        >
                          Reset pwd
                        </button>
                        {u.role !== "suspended" && (
                          <button
                            data-testid={`button-suspend-${u.userId}`}
                            onClick={() => roleMutation.mutate({ userId: u.userId, role: "suspended" })}
                            className="admin-action-btn admin-action-btn-destructive"
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          data-testid={`button-delete-${u.userId}`}
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete ${u.email}? This cannot be undone.`)) {
                              deleteMutation.mutate(u.userId);
                            }
                          }}
                          className="admin-action-btn admin-action-btn-destructive"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#aaa] text-[13px]">
                  {searchQuery ? "No matching users" : "No users yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeedbackSection({ feedback }: { feedback: FeedbackRow[] }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[18px] font-semibold text-[#111]" data-testid="text-feedback-title">Feedback</h2>
        <p className="text-[13px] text-[#888] mt-0.5">{feedback.length} responses collected.</p>
      </div>

      <div
        data-testid="card-feedback-list"
        style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px", overflow: "hidden" }}
      >
        {feedback.length === 0 && (
          <div className="px-5 py-8 text-center text-[13px] text-[#aaa]">No feedback yet</div>
        )}
        {feedback.map((row, idx) => (
          <div
            key={row.id}
            data-testid={`row-feedback-${row.id}`}
            style={{ padding: "14px 20px", borderBottom: idx < feedback.length - 1 ? "0.5px solid #f3f4f6" : "none" }}
          >
            <div className="flex items-center gap-2">
              <MoodBadge mood={row.mood} />
              <span className="text-[12px] text-[#999]">{formatDate(row.createdAt)}</span>
              <span className="text-[12px] text-[#bbb]" style={{ marginLeft: "auto" }}>{row.userEmail}</span>
            </div>
            <p className="mt-2" style={{ fontSize: "14px", lineHeight: 1.65, color: "#333" }}>{row.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureInterestSection({ features }: { features: FeatureInterestSummary[] }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-[18px] font-semibold text-[#111]" data-testid="text-feature-title">Feature interest</h2>
        <p className="text-[13px] text-[#888] mt-0.5">What users are asking for.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <div
            key={feature.featureName}
            data-testid={`card-feature-${feature.featureName.toLowerCase().replace(/\s+/g, "-")}`}
            style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px", padding: "14px 16px" }}
          >
            <p style={{ fontSize: "12px", color: "#999", fontWeight: 400 }}>{feature.featureName}</p>
            <p style={{ fontSize: "22px", fontWeight: 500, color: "#111", marginTop: "4px" }} data-testid={`text-interest-count-${feature.featureName.toLowerCase().replace(/\s+/g, "-")}`}>
              {feature.count}
            </p>
            <p style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>interested users</p>
          </div>
        ))}
        {features.length === 0 && (
          <div className="col-span-3 text-center text-[13px] text-[#aaa] py-8">No feature interest data yet</div>
        )}
      </div>
    </div>
  );
}

const NAV_ITEMS: { key: Section; label: string; icon: typeof Users }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "feedback", label: "Feedback", icon: MessageSquare },
  { key: "feature_interest", label: "Feature interest", icon: BarChart3 },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<Section>("users");

  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const statsQuery = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: user?.email === ADMIN_EMAIL,
  });

  if (!user || user.email !== ADMIN_EMAIL) {
    return null;
  }

  if (statsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="admin-loading">
        <Loader2 className="w-6 h-6 animate-spin text-[#534AB7]" />
      </div>
    );
  }

  if (statsQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" data-testid="admin-error">
        <p className="text-[14px] text-[#888]">Failed to load admin data.</p>
        <button
          data-testid="button-retry"
          onClick={() => statsQuery.refetch()}
          style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid #d1d5db", background: "#fff", cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }

  const feedbackData = statsQuery.data?.feedback || [];
  const featureData = statsQuery.data?.featureInterest || [];
  const usersData = statsQuery.data?.users || [];

  return (
    <div className="flex h-full" data-testid="admin-dashboard">
      <style>{`
        .admin-action-btn {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 4px;
          border: 0.5px solid #d1d5db;
          background: #fff;
          cursor: pointer;
          color: #555;
          transition: border-color 0.15s;
        }
        .admin-action-btn:hover {
          border-color: #999;
        }
        .admin-action-btn-destructive:hover {
          border-color: #ef4444 !important;
          color: #ef4444;
        }
        .admin-nav-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          color: #666;
          cursor: pointer;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          transition: background 0.15s;
        }
        .admin-nav-item:hover {
          background: #f9fafb;
        }
        .admin-nav-item.active {
          background: #EEEDFE;
          color: #534AB7;
          font-weight: 500;
        }
      `}</style>

      <div
        style={{ width: "170px", minWidth: "170px", borderRight: "0.5px solid #e5e7eb", padding: "20px 12px" }}
      >
        <p style={{ fontSize: "11px", fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.5px", padding: "0 12px", marginBottom: "8px" }}>
          Admin
        </p>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            data-testid={`nav-${item.key}`}
            className={`admin-nav-item ${activeSection === item.key ? "active" : ""}`}
            onClick={() => setActiveSection(item.key)}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6 max-w-5xl">
        {activeSection === "users" && (
          <UsersSection users={usersData} currentEmail={user.email || ""} />
        )}
        {activeSection === "feedback" && (
          <FeedbackSection feedback={feedbackData} />
        )}
        {activeSection === "feature_interest" && (
          <FeatureInterestSection features={featureData} />
        )}
      </div>
    </div>
  );
}
