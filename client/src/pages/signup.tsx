import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle } from "react-icons/si";
import { Shield, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { Link } from "wouter";

export default function SignupPage() {
  const { user, session, signUp, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);

  useEffect(() => {
    if (user && session) {
      window.location.href = "/";
    }
  }, [user, session]);

  if (user && session) {
    return null;
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      localStorage.removeItem("watchloom_tracking_intent");

      const { error, emailSent } = await signUp(email, password, {
        role: "pending",
        trackingText: "",
      });
      setIsLoading(false);

      if (error) {
        toast({
          title: "Signup Error",
          description: error.message,
          variant: "destructive",
        });
      } else if (emailSent) {
        setAccountCreated(true);
      } else {
        toast({
          title: "Account created",
          description:
            "Your account was created but we couldn't send the verification email. Please try signing in directly.",
          variant: "destructive",
        });
      }
    } catch {
      setIsLoading(false);
      toast({
        title: "Signup Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResendEmail = async () => {
    setResendingEmail(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, emailRedirectTo: window.location.origin }),
      });
      if (res.ok) {
        toast({
          title: "Email sent",
          description: "We sent a new verification email to your inbox.",
        });
      } else {
        toast({
          title: "Could not resend",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Could not resend",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
    setResendingEmail(false);
  };

  const handleGoogleSignIn = async () => {
    localStorage.removeItem("watchloom_tracking_intent");
    const { error } = await signInWithGoogle();
    if (error) {
      toast({
        title: "Authentication Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: "#f8fafc", fontFamily: "'DM Sans', sans-serif" }}
    >
      <div
        className="w-full max-w-[480px] rounded-xl border p-8 md:p-10"
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#e2e8f0",
        }}
      >
        {!accountCreated && (
          <div className="flex items-center gap-2 mb-6">
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
        )}

        {!accountCreated && (
          <div>
            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: "#1e3a5f" }}
              data-testid="text-signup-headline"
            >
              Create your account
            </h2>
            <p className="text-sm mb-6" style={{ color: "#64748b" }}>
              Sign up to get started. We'll personalise your workspace next.
            </p>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">
                  Full name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-11"
                  data-testid="input-full-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                  data-testid="input-signup-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 pr-10"
                    data-testid="input-signup-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "#94a3b8" }}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 text-white font-semibold mt-2"
                style={{ backgroundColor: "#1e3a5f" }}
                data-testid="button-create-account"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" style={{ borderColor: "#e2e8f0" }} />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3" style={{ color: "#94a3b8" }}>
                  or
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              onClick={handleGoogleSignIn}
              data-testid="button-google-signup"
            >
              <SiGoogle className="w-4 h-4 mr-2" />
              Sign up with Google
            </Button>

            <p
              className="text-center text-xs mt-6"
              style={{ color: "#94a3b8" }}
            >
              Already have an account?{" "}
              <Link href="/signin">
                <span
                  className="font-medium hover:underline underline-offset-4 cursor-pointer"
                  style={{ color: "#1e3a5f" }}
                  data-testid="link-signin-from-signup"
                >
                  Sign in
                </span>
              </Link>
            </p>
          </div>
        )}

        {accountCreated && (
          <div className="text-center py-4" data-testid="confirmation-screen">
            <div className="flex items-center justify-center gap-2 mb-8">
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

            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
            >
              <Mail className="w-8 h-8" style={{ color: "#1e3a5f" }} />
            </div>

            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "#1e3a5f" }}
              data-testid="text-check-inbox"
            >
              Check your inbox
            </h2>

            <p
              className="text-sm mb-6 leading-relaxed"
              style={{ color: "#64748b" }}
              data-testid="text-confirmation-message"
            >
              We sent a confirmation email to{" "}
              <span className="font-medium" style={{ color: "#334155" }}>
                {email}
              </span>
              . Click the link in the email to activate your account and start setting up your workspace.
            </p>

            <p className="text-xs" style={{ color: "#94a3b8" }} data-testid="text-resend-hint">
              Did not receive it? Check your spam folder or{" "}
              <button
                type="button"
                onClick={handleResendEmail}
                disabled={resendingEmail}
                className="font-medium hover:underline underline-offset-4 cursor-pointer"
                style={{ color: "#1e3a5f" }}
                data-testid="button-resend-email"
              >
                {resendingEmail ? "sending..." : "resend the email"}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
