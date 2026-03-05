import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle } from "react-icons/si";
import { Shield, ArrowRight, Eye, EyeOff } from "lucide-react";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signUp, signIn, signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (isSignUp) {
      const { error, emailSent } = await signUp(email, password);
      setIsLoading(false);
      if (error) {
        toast({
          title: "Authentication Error",
          description: error.message,
          variant: "destructive",
        });
      } else if (emailSent) {
        toast({
          title: "Account created",
          description: "We've sent a verification email to your inbox. Please confirm your email to get started.",
        });
      } else {
        toast({
          title: "Account created",
          description: "Your account was created but we couldn't send the verification email. Please try signing in directly.",
          variant: "destructive",
        });
      }
    } else {
      const { error } = await signIn(email, password);
      setIsLoading(false);
      if (error) {
        toast({
          title: "Authentication Error",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleGoogleSignIn = async () => {
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
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-md bg-[#1e3a5f] flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-semibold tracking-tight text-foreground">Watchloom</span>
            </div>
            <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
              Your personal AI-powered intelligence workspace.
            </p>
          </div>

          <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="p-0">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      data-testid="input-password"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#1e3a5f] text-white border-[#1e3a5f]"
                  disabled={isLoading}
                  data-testid="button-submit-auth"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {isSignUp ? "Creating account..." : "Signing in..."}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {isSignUp ? "Create account" : "Sign in"}
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11"
                onClick={handleGoogleSignIn}
                data-testid="button-google-signin"
              >
                <SiGoogle className="w-4 h-4 mr-2" />
                Continue with Google
              </Button>

              <p className="text-center text-sm text-muted-foreground mt-6">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-[#1e3a5f] font-medium underline-offset-4 hover:underline"
                  data-testid="button-toggle-auth-mode"
                >
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-[#1e3a5f] items-center justify-center p-16">
        <div className="max-w-lg text-white">
          <h2 className="text-3xl font-semibold mb-6 leading-tight">
            Track what matters.
            <br />
            Stay informed.
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-8">
            Describe what you want to track in plain English. Our AI understands your intent
            and builds a personalized intelligence workspace for you automatically.
          </p>
          <div className="space-y-4">
            {[
              "AI-powered entity extraction",
              "Capture anything — text, links, documents",
              "Automated daily intelligence briefs",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <span className="text-white/80">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
