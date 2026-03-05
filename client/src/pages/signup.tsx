import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle } from "react-icons/si";
import { Shield, Briefcase, BarChart3, Handshake, Crown, ArrowRight, Eye, EyeOff, Loader2, Target, Lightbulb, Search, MoreHorizontal, Mail } from "lucide-react";
import { Link } from "wouter";

type SignupStep = 1 | 2 | 3;

const ROLES = [
  { id: "product_manager", label: "Product Manager", icon: Briefcase },
  { id: "analyst", label: "Analyst", icon: BarChart3 },
  { id: "sales_bd", label: "Sales & BD", icon: Handshake },
  { id: "executive", label: "Executive", icon: Crown },
  { id: "strategy_planning", label: "Strategy & Planning", icon: Target },
  { id: "consultant_advisor", label: "Consultant / Advisor", icon: Lightbulb },
  { id: "researcher", label: "Researcher", icon: Search },
  { id: "other", label: "Other", icon: MoreHorizontal },
] as const;

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>(1);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [otherRoleText, setOtherRoleText] = useState("");
  const [trackingText, setTrackingText] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const effectiveRole = selectedRole === "other" ? otherRoleText.trim() : selectedRole;
  const canContinueStep1 = selectedRole !== "" && (selectedRole !== "other" || otherRoleText.trim().length > 0);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      localStorage.setItem(
        "pendingOnboarding",
        JSON.stringify({ role: effectiveRole, trackingText, fullName })
      );

      const { error, emailSent } = await signUp(email, password, {
        role: effectiveRole,
        trackingText,
      });
      setIsLoading(false);

      if (error) {
        localStorage.removeItem("pendingOnboarding");
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
      localStorage.removeItem("pendingOnboarding");
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
    localStorage.setItem(
      "pendingOnboarding",
      JSON.stringify({ role: effectiveRole, trackingText, fullName })
    );
    const { error } = await signInWithGoogle();
    if (error) {
      localStorage.removeItem("pendingOnboarding");
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
          <>
            <p className="text-sm mb-8" style={{ color: "#94a3b8" }} data-testid="text-step-indicator">
              Step {step} of 3
            </p>

            <div className="flex gap-1 mb-8">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className="h-1 flex-1 rounded-full transition-colors"
                  style={{
                    backgroundColor: s <= step ? "#1e3a5f" : "#e2e8f0",
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <div>
            <h2
              className="text-2xl font-bold mb-8"
              style={{ color: "#1e3a5f" }}
              data-testid="text-step1-headline"
            >
              What's your role?
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => {
                      setSelectedRole(role.id);
                      if (role.id !== "other") {
                        setOtherRoleText("");
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all cursor-pointer"
                    style={{
                      borderColor: isSelected ? "#1e3a5f" : "#e2e8f0",
                      backgroundColor: isSelected ? "rgba(30,58,95,0.04)" : "#ffffff",
                    }}
                    data-testid={`button-role-${role.id}`}
                  >
                    <Icon
                      className="w-5 h-5"
                      style={{ color: isSelected ? "#1e3a5f" : "#94a3b8" }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: isSelected ? "#1e3a5f" : "#64748b" }}
                    >
                      {role.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedRole === "other" && (
              <div className="mb-4">
                <Input
                  value={otherRoleText}
                  onChange={(e) => setOtherRoleText(e.target.value)}
                  placeholder="What's your title?"
                  className="h-11"
                  data-testid="input-other-role"
                />
              </div>
            )}
            <Button
              onClick={() => setStep(2)}
              disabled={!canContinueStep1}
              className="w-full h-11 text-white font-semibold"
              style={{ backgroundColor: "#1e3a5f" }}
              data-testid="button-continue-step1"
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: "#1e3a5f" }}
              data-testid="text-step2-headline"
            >
              What do you most need to stay on top of?
            </h2>
            <p className="text-sm mb-6" style={{ color: "#64748b" }}>
              Just write naturally. Our AI will figure out the rest.
            </p>
            <Textarea
              value={trackingText}
              onChange={(e) => setTrackingText(e.target.value)}
              placeholder="e.g. I need to keep track of what our competitors are doing, stay on top of new regulations in our industry, and follow any news or policy changes that could affect our business."
              className="min-h-[120px] mb-8 text-sm resize-none"
              data-testid="input-tracking-text"
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="h-11"
                data-testid="button-back-step2"
              >
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={trackingText.trim().length < 10}
                className="flex-1 h-11 text-white font-semibold"
                style={{ backgroundColor: "#1e3a5f" }}
                data-testid="button-continue-step2"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && !accountCreated && (
          <div>
            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: "#1e3a5f" }}
              data-testid="text-step3-headline"
            >
              Create your account
            </h2>
            <p className="text-sm mb-6" style={{ color: "#64748b" }}>
              Your workspace is being prepared based on what you told us.
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
              Or sign in with Google
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

        {step === 3 && accountCreated && (
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
              . Click the link in the email to activate your account and access your workspace.
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
