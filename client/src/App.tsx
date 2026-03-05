import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import LandingPage from "@/pages/landing";
import SignupPage from "@/pages/signup";
import SigninPage from "@/pages/signin";
import OnboardingPage from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import { Loader2 } from "lucide-react";
import { Switch, Route } from "wouter";

function AppContent() {
  const { user, session, loading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [autoOnboarding, setAutoOnboarding] = useState(false);

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
      .then(async (data) => {
        if (data && data.exists) {
          setHasCompletedOnboarding(true);
          localStorage.removeItem("pendingOnboarding");
          setCheckingOnboarding(false);
          return;
        }

        const pendingRaw = localStorage.getItem("pendingOnboarding");
        let onboardingRole: string | null = null;
        let onboardingText: string | null = null;

        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw);
            if (pending.trackingText && pending.role) {
              onboardingRole = pending.role;
              onboardingText = pending.trackingText;

              try {
                await apiRequest("POST", "/api/onboarding-context", {
                  role: pending.role,
                  trackingText: pending.trackingText,
                });
              } catch {
              }
            }
          } catch {
            localStorage.removeItem("pendingOnboarding");
          }
        }

        if (!onboardingRole || !onboardingText) {
          try {
            const contextRes = await fetch(`/api/onboarding-context/${user.id}`, {
              credentials: "include",
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (contextRes.ok) {
              const contextData = await contextRes.json();
              if (contextData.exists && contextData.trackingText) {
                onboardingRole = contextData.role || "other";
                onboardingText = contextData.trackingText;
              }
            }
          } catch {
          }
        }

        if (onboardingRole && onboardingText) {
          setAutoOnboarding(true);
          setCheckingOnboarding(false);

          const roleLabel =
            onboardingRole === "product_manager"
              ? "Product Manager"
              : onboardingRole === "analyst"
                ? "Analyst"
                : onboardingRole === "sales_bd"
                  ? "Sales & BD"
                  : onboardingRole === "executive"
                    ? "Executive"
                    : onboardingRole;

          const description = `Role: ${roleLabel}. ${onboardingText}`;

          try {
            const extractRes = await apiRequest("POST", "/api/extract", { description });
            const extraction = await extractRes.json();

            if (!extraction?.categories?.length) {
              throw new Error("No categories extracted");
            }

            await apiRequest("POST", "/api/workspace", {
              userId: user.id,
              categories: extraction.categories,
            });

            localStorage.removeItem("pendingOnboarding");
            setAutoOnboarding(false);
            setHasCompletedOnboarding(true);
            return;
          } catch {
            setAutoOnboarding(false);
            setHasCompletedOnboarding(false);
          }
          return;
        }

        setHasCompletedOnboarding(false);
        setCheckingOnboarding(false);
      })
      .catch(() => {
        setHasCompletedOnboarding(false);
        setCheckingOnboarding(false);
      });
  }, [user, session]);

  if (loading || checkingOnboarding || autoOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-6 h-6 text-[#1e3a5f] animate-spin mx-auto" />
          {autoOnboarding && (
            <p className="text-sm text-muted-foreground">
              Setting up your workspace...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/signup" component={SignupPage} />
        <Route path="/signin" component={SigninPage} />
        <Route component={LandingPage} />
      </Switch>
    );
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
