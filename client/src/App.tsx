import { useState, useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LandingPage from "@/pages/landing";
import SignupPage from "@/pages/signup";
import SigninPage from "@/pages/signin";
import OnboardingPage from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import { Loader2, Shield } from "lucide-react";
import { Switch, Route, useLocation } from "wouter";

function AppContent() {
  const { user, session, loading } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [autoOnboarding, setAutoOnboarding] = useState(false);
  const [location, setLocation] = useLocation();
  const initialLoadComplete = useRef(false);
  const checkedUserId = useRef<string | null>(null);
  const onboardingInProgress = useRef(false);

  useEffect(() => {
    if (user && session) {
      const authRoutes = ["/signin", "/signup"];
      if (authRoutes.includes(location)) {
        setLocation("/");
      }
    }
  }, [user, session, location, setLocation]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        const landingRoutes = ["/signin", "/signup"];
        if (landingRoutes.includes(location)) {
          setLocation("/");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [location, setLocation]);

  useEffect(() => {
    if (!user || !session) {
      checkedUserId.current = null;
      onboardingInProgress.current = false;
      initialLoadComplete.current = false;
      setHasCompletedOnboarding(null);
      return;
    }

    if (checkedUserId.current === user.id) {
      return;
    }

    if (onboardingInProgress.current) {
      return;
    }
    onboardingInProgress.current = true;

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
          checkedUserId.current = user.id;
          onboardingInProgress.current = false;
          setHasCompletedOnboarding(true);
          localStorage.removeItem("pendingOnboarding");
          setCheckingOnboarding(false);
          initialLoadComplete.current = true;
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

            try {
              await apiRequest("POST", "/api/workspace", {
                userId: user.id,
                categories: extraction.categories,
              });
            } catch {
              const retryCheck = await fetch(`/api/workspace/${user.id}`, {
                credentials: "include",
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (retryCheck.ok) {
                const retryData = await retryCheck.json();
                if (retryData && retryData.exists) {
                  console.log("ONBOARDING: workspace already exists (created by concurrent request), continuing");
                } else {
                  throw new Error("Workspace creation failed and no workspace found");
                }
              } else {
                throw new Error("Workspace creation failed");
              }
            }

            try {
              await apiRequest("POST", "/api/historical-seeding");
            } catch {}

            console.log("ONBOARDING: auto-onboarding complete, invalidating workspace cache for user", user.id);
            queryClient.invalidateQueries({ queryKey: ["/api/workspace", user.id] });
            queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
            queryClient.removeQueries({ queryKey: ["/api/workspace", user.id] });
            localStorage.removeItem("pendingOnboarding");
            checkedUserId.current = user.id;
            onboardingInProgress.current = false;
            setAutoOnboarding(false);
            setHasCompletedOnboarding(true);
            initialLoadComplete.current = true;
            return;
          } catch {
            onboardingInProgress.current = false;
            setAutoOnboarding(false);
            setHasCompletedOnboarding(false);
            initialLoadComplete.current = true;
          }
          return;
        }

        onboardingInProgress.current = false;
        setHasCompletedOnboarding(false);
        setCheckingOnboarding(false);
        initialLoadComplete.current = true;
      })
      .catch(() => {
        onboardingInProgress.current = false;
        setHasCompletedOnboarding(false);
        setCheckingOnboarding(false);
        initialLoadComplete.current = true;
      });
  }, [user, session]);

  const showInitialSpinner = !initialLoadComplete.current && (loading || checkingOnboarding || autoOnboarding);

  if (showInitialSpinner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ backgroundColor: "#1e3a5f" }}
            >
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold" style={{ color: "#1e3a5f" }}>
              Watchloom
            </span>
          </div>
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
        onComplete={() => {
          console.log("ONBOARDING: complete, invalidating workspace cache for user", user.id);
          queryClient.invalidateQueries({ queryKey: ["/api/workspace", user.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
          queryClient.removeQueries({ queryKey: ["/api/workspace", user.id] });
          checkedUserId.current = user.id;
          onboardingInProgress.current = false;
          initialLoadComplete.current = true;
          setHasCompletedOnboarding(true);
        }}
      />
    );
  }

  return <Dashboard />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
