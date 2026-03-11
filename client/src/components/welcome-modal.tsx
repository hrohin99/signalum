import { useState } from "react";
import { Rocket, Sun, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

const panels = [
  {
    icon: Rocket,
    headline: "Signalum is already working",
    body: "We are already searching the web for recent updates on everything you are tracking. Your workspace will populate in the next few minutes.",
  },
  {
    icon: Sun,
    headline: "Your daily brief starts tomorrow",
    body: "Every morning Signalum sends you one clear brief covering what changed across all your topics, what signals matter, and what to do about it.",
  },
  {
    icon: Inbox,
    headline: "Capture anything, anytime",
    body: "A note from a meeting. A regulation you read. A price change you spotted. An article a colleague forwarded. Drop anything into Capture and Signalum files it automatically.",
  },
];

export function OnboardingWelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < panels.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleDone = () => {
    localStorage.setItem("onboarding_welcome_seen", "true");
    onDismiss();
  };

  const panel = panels[step];
  const Icon = panel.icon;
  const isLast = step === panels.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="onboarding-welcome-overlay">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-[480px] mx-4"
        style={{ padding: "40px" }}
        data-testid="onboarding-welcome-modal"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#1e3a5f] flex items-center justify-center mb-6">
            <Icon className="w-7 h-7 text-white" />
          </div>

          <h2 className="text-xl font-semibold text-[#1e3a5f] mb-3" data-testid="text-welcome-headline">
            {panel.headline}
          </h2>

          <p className="text-sm text-slate-500 leading-relaxed mb-8 max-w-[380px]" data-testid="text-welcome-body">
            {panel.body}
          </p>
        </div>

        <div className="flex justify-center gap-1.5 mb-6" data-testid="welcome-dots">
          {panels.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-[#1e3a5f]" : "bg-slate-200"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={handleBack}
                className="text-slate-500"
                data-testid="button-welcome-back"
              >
                Back
              </Button>
            )}
          </div>
          <div>
            {isLast ? (
              <Button
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white px-6"
                onClick={handleDone}
                data-testid="button-welcome-done"
              >
                Done
              </Button>
            ) : (
              <Button
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white px-6"
                onClick={handleNext}
                data-testid="button-welcome-next"
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
