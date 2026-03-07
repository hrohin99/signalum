import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

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
  createdAt: string;
  lastSignIn: string | null;
  topicCount: number;
  captureCount: number;
}

const moodEmoji: Record<string, string> = {
  happy: "😊",
  neutral: "😐",
  sad: "😞",
  love: "❤️",
  angry: "😠",
  frustrated: "😤",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const feedbackQuery = useQuery<FeedbackRow[]>({
    queryKey: ["/api/admin/feedback"],
    enabled: user?.email === ADMIN_EMAIL,
  });

  const featureQuery = useQuery<FeatureInterestSummary[]>({
    queryKey: ["/api/admin/feature-interest"],
    enabled: user?.email === ADMIN_EMAIL,
  });

  const usersQuery = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: user?.email === ADMIN_EMAIL,
  });

  if (!user || user.email !== ADMIN_EMAIL) {
    return null;
  }

  const isLoading = feedbackQuery.isLoading || featureQuery.isLoading || usersQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="admin-loading">
        <Loader2 className="w-6 h-6 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  const feedbackData = feedbackQuery.data || [];
  const featureData = featureQuery.data || [];
  const usersData = usersQuery.data || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-10" data-testid="admin-dashboard">
      <h1 className="text-2xl font-bold text-[#1e3a5f]" data-testid="text-admin-title">Admin Dashboard</h1>

      <section data-testid="section-feedback">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-[#1e3a5f]">Feedback</h2>
          <span className="text-sm text-muted-foreground" data-testid="text-feedback-count">
            {feedbackData.length} total
          </span>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm" data-testid="table-feedback">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Mood</th>
                <th className="text-left px-4 py-2 font-medium">Message</th>
                <th className="text-left px-4 py-2 font-medium">User Email</th>
              </tr>
            </thead>
            <tbody>
              {feedbackData.map((row) => (
                <tr key={row.id} className="border-t" data-testid={`row-feedback-${row.id}`}>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-2 text-lg">{moodEmoji[row.mood] || row.mood}</td>
                  <td className="px-4 py-2">{row.message}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.userEmail}</td>
                </tr>
              ))}
              {feedbackData.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No feedback yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section data-testid="section-feature-interest">
        <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Feature Interest</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {featureData.map((feature) => (
            <div
              key={feature.featureName}
              className="border rounded-lg p-4"
              data-testid={`card-feature-${feature.featureName.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <h3 className="font-semibold text-[#1e3a5f]">{feature.featureName}</h3>
              <p className="text-2xl font-bold mt-1" data-testid={`text-interest-count-${feature.featureName.toLowerCase().replace(/\s+/g, "-")}`}>
                {feature.count}
              </p>
              <p className="text-xs text-muted-foreground mt-1">interested users</p>
              {feature.emails.length > 0 && (
                <div className="mt-3 space-y-1">
                  {feature.emails.map((email) => (
                    <p key={email} className="text-xs text-muted-foreground truncate">{email}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section data-testid="section-users">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-[#1e3a5f]">Users</h2>
          <span className="text-sm text-muted-foreground" data-testid="text-users-count">
            {usersData.length} total
          </span>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm" data-testid="table-users">
            <thead>
              <tr className="bg-[#1e3a5f] text-white">
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="text-left px-4 py-2 font-medium">Last Sign In</th>
                <th className="text-left px-4 py-2 font-medium">Topics</th>
                <th className="text-left px-4 py-2 font-medium">Captures</th>
              </tr>
            </thead>
            <tbody>
              {usersData.map((u) => (
                <tr key={u.userId} className="border-t" data-testid={`row-user-${u.userId}`}>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{u.lastSignIn ? formatDate(u.lastSignIn) : "—"}</td>
                  <td className="px-4 py-2 text-center">{u.topicCount}</td>
                  <td className="px-4 py-2 text-center">{u.captureCount}</td>
                </tr>
              ))}
              {usersData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
