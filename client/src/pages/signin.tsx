import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function SigninPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(email, password);
    setIsLoading(false);

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
        className="w-full max-w-[420px] rounded-xl border p-8 md:p-10"
        style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
      >
        <div className="flex items-center gap-2 mb-8">
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

        <h2
          className="text-2xl font-bold mb-8"
          style={{ color: "#1e3a5f" }}
          data-testid="text-signin-headline"
        >
          Sign in
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11"
              data-testid="input-signin-email"
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11 pr-10"
                data-testid="input-signin-password"
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
            className="w-full h-11 text-white font-semibold"
            style={{ backgroundColor: "#1e3a5f" }}
            data-testid="button-signin-submit"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Sign In
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: "#94a3b8" }}>
          Don't have an account?{" "}
          <Link href="/signup">
            <span
              className="font-medium hover:underline underline-offset-4 cursor-pointer"
              style={{ color: "#1e3a5f" }}
              data-testid="link-signup-from-signin"
            >
              Sign up
            </span>
          </Link>
        </p>
      </div>
    </div>
  );
}
