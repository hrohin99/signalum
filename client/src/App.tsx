import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import AuthPage from "@/pages/auth";
import OnboardingPage from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import { Loader2 } from "lucide-react";

function AppContent() {
  const { user, session, loading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  useEffect(() => {
    if (!user || !session) {
      setHasCompletedOnboarding(null);
      return;
    }

    setCheckingOnboarding(true);
    fetch(`/api/workspace/${user.id}`, {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        setHasCompletedOnboarding(data && data.exists);
      })
      .catch(() => {
        setHasCompletedOnboarding(false);
      })
      .finally(() => {
        setCheckingOnboarding(false);
      });
  }, [user, session]);

  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-[#1e3a5f] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!hasCompletedOnboarding) {
    return (
      <OnboardingPage
        onComplete={() => setHasCompletedOnboarding(true)}
      />
    );
  }

  return <Dashboard />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
