import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, Sparkles, ArrowRight, Check, ChevronLeft, Loader2, Tag, FolderOpen } from "lucide-react";
import type { ExtractionResult } from "@shared/schema";

type OnboardingStep = "input" | "processing" | "confirm";

export default function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<OnboardingStep>("input");
  const [description, setDescription] = useState("");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleAnalyze = async () => {
    if (description.trim().length < 10) {
      toast({
        title: "Too short",
        description: "Please describe what you want to track in more detail.",
        variant: "destructive",
      });
      return;
    }

    setStep("processing");
    setIsProcessing(true);

    try {
      const res = await apiRequest("POST", "/api/extract", { description });
      const data: ExtractionResult = await res.json();
      setExtraction(data);
      setStep("confirm");
    } catch (err: any) {
      toast({
        title: "Analysis failed",
        description: err.message || "Could not analyze your input. Please try again.",
        variant: "destructive",
      });
      setStep("input");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!extraction) return;
    setIsCreating(true);

    try {
      await apiRequest("POST", "/api/workspace", {
        userId: user?.id,
        categories: extraction.categories,
      });
      try {
        await apiRequest("POST", "/api/historical-seeding");
      } catch {}
      onComplete();
    } catch (err: any) {
      toast({
        title: "Error creating workspace",
        description: err.message || "Could not create your workspace. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-md bg-[#1e3a5f] flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">Watchloom</span>
        </div>

        <div className="flex items-center gap-2 mt-6 mb-8">
          {["input", "processing", "confirm"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step === s
                    ? "bg-[#1e3a5f] text-white"
                    : (step === "confirm" && i < 2) || (step === "processing" && i === 0)
                      ? "bg-[#1e3a5f]/10 text-[#1e3a5f]"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {(step === "confirm" && i < 2) || (step === "processing" && i === 0) ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && (
                <div className={`w-16 h-0.5 ${
                  (step === "confirm" && i < 2) || (step === "processing" && i === 0)
                    ? "bg-[#1e3a5f]/30"
                    : "bg-muted"
                }`} />
              )}
            </div>
          ))}
        </div>

        {step === "input" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                What do you want to track?
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                Describe in plain English what topics, people, companies, or areas you want to monitor.
                Our AI will analyze your input and build your workspace.
              </p>
            </div>

            <Textarea
              placeholder="Example: I want to track AI startups in the healthcare space, specifically companies working on drug discovery and diagnostics. I also want to monitor key researchers like Demis Hassabis and Daphne Koller, and follow regulatory changes from the FDA around AI-assisted medical devices."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[180px] text-base leading-relaxed resize-none"
              data-testid="input-onboarding-description"
            />

            <div className="flex justify-end">
              <Button
                onClick={handleAnalyze}
                disabled={description.trim().length < 10}
                className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                data-testid="button-analyze"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze with AI
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-[#1e3a5f] animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Analyzing your input...</h2>
              <p className="text-muted-foreground">
                AI is extracting categories and topics from your description.
              </p>
            </div>
          </div>
        )}

        {step === "confirm" && extraction && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Review your workspace
              </h1>
              <p className="text-muted-foreground leading-relaxed">
                {extraction.summary}
              </p>
            </div>

            <div className="space-y-4">
              {extraction.categories.map((category) => (
                <Card key={category.name} className="border border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center mt-0.5">
                        <FolderOpen className="w-4 h-4 text-[#1e3a5f]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{category.name}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{category.description}</p>
                      </div>
                    </div>
                    {category.entities.length > 0 && (
                      <div className="flex flex-wrap gap-2 ml-11">
                        {category.entities.map((entity) => (
                          <Badge key={entity.name} variant="secondary" className="text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            {entity.name}
                            <span className="ml-1 text-muted-foreground">· {entity.type}</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("input")}
                data-testid="button-back-to-input"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Edit description
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isCreating}
                className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                data-testid="button-confirm-workspace"
              >
                {isCreating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating workspace...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    Create workspace
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
