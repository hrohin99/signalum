import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ArrowRight, Building2, User, Landmark, BarChart3, Handshake, Scale } from "lucide-react";

const PERSPECTIVE_OPTIONS = [
  { value: "vendor", label: "Product or Technology Vendor", description: "You build and sell a product or platform and need to track your market", icon: Building2 },
  { value: "business_owner", label: "Business Owner or Founder", description: "You run a business and need visibility on threats, competitors, and market shifts", icon: User },
  { value: "government", label: "Government or Public Sector", description: "You work in a government agency or public body tracking vendors, policy, or regulation", icon: Landmark },
  { value: "analyst", label: "Analyst, Consultant, or Advisor", description: "You track a space to advise clients or produce research and intelligence", icon: BarChart3 },
  { value: "sales", label: "Sales or Business Development", description: "You need intelligence to win deals, track competitors, and spot opportunities", icon: Handshake },
  { value: "legal_compliance", label: "Legal or Compliance", description: "You monitor regulations, standards, and enforcement to manage risk", icon: Scale },
];

const TRACKING_TYPE_OPTIONS = [
  { value: "competitors", label: "Competitors and market players" },
  { value: "regulations", label: "Regulations and policy" },
  { value: "standards", label: "Industry standards and certifications" },
  { value: "trends", label: "Technology trends and emerging threats" },
  { value: "vendors", label: "Vendors and suppliers" },
  { value: "media", label: "Media and public narrative" },
];

const ROLE_OPTIONS = [
  "Business Owner / Founder",
  "Product Manager",
  "Strategy / Analyst",
  "Sales / BD",
  "Legal / Compliance",
  "Executive / Leadership",
  "Researcher",
  "Other",
];

const GEO_OPTIONS = [
  "United Kingdom",
  "United States",
  "European Union",
  "Canada",
  "Australia",
  "Middle East",
  "Global",
];

export default function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [perspective, setPerspective] = useState("");
  const [trackingTypes, setTrackingTypes] = useState<string[]>([]);
  const [orgDescription, setOrgDescription] = useState("");
  const [userRole, setUserRole] = useState("");
  const [orgGeographies, setOrgGeographies] = useState<string[]>([]);
  const [competitors, setCompetitors] = useState("");
  const [winFactors, setWinFactors] = useState("");
  const [vulnerability, setVulnerability] = useState("");
  const [earlyWarningSignal, setEarlyWarningSignal] = useState("");
  const [regulationsMonitored, setRegulationsMonitored] = useState<string[]>([]);
  const [regulatoryBodies, setRegulatoryBodies] = useState<string[]>([]);
  const [compliancePurpose, setCompliancePurpose] = useState("");
  const [standardsBodies, setStandardsBodies] = useState<string[]>([]);
  const [standardsCertified, setStandardsCertified] = useState("");
  const [standardsPurpose, setStandardsPurpose] = useState("");
  const [briefingAudience, setBriefingAudience] = useState("");

  const totalSteps = 6;

  const toggleTrackingType = (value: string) => {
    setTrackingTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  };

  const toggleGeo = (value: string) => {
    setOrgGeographies((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  };

  const canProceed = () => {
    if (step === 1) return perspective !== "";
    if (step === 2) return trackingTypes.length > 0;
    if (step === 3) return orgDescription.trim().length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-[580px]">
        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-[#1e3a5f] rounded-full transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
            data-testid="progress-bar"
          />
        </div>

        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors"
            data-testid="button-back"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">
                How would you describe yourself?
              </h1>
              <p className="text-gray-500 text-sm" data-testid="text-step-subtitle">
                This shapes how Signalum frames every insight for you.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {PERSPECTIVE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = perspective === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPerspective(opt.value)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      selected
                        ? "border-[#1e3a5f] bg-[#1e3a5f]/5"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                    data-testid={`card-perspective-${opt.value}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        selected ? "bg-[#1e3a5f] text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${selected ? "text-[#1e3a5f]" : "text-gray-900"}`}>
                          {opt.label}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">
                What do you want to track?
              </h1>
              <p className="text-gray-500 text-sm" data-testid="text-step-subtitle">
                Select all that apply.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {TRACKING_TYPE_OPTIONS.map((opt) => {
                const selected = trackingTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleTrackingType(opt.value)}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                    data-testid={`chip-tracking-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">
                Tell us about your organisation
              </h1>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  What does your organisation do, and who are your customers or stakeholders?
                </label>
                <Textarea
                  placeholder="e.g. We provide cloud-based software to financial services firms globally"
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  className="min-h-[100px] resize-none"
                  data-testid="input-org-description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  What is your role?
                </label>
                <Select value={userRole} onValueChange={setUserRole}>
                  <SelectTrigger data-testid="select-user-role">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role} data-testid={`option-role-${role}`}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Which geographies matter most?
                </label>
                <div className="flex flex-wrap gap-2">
                  {GEO_OPTIONS.map((geo) => {
                    const selected = orgGeographies.includes(geo);
                    return (
                      <button
                        key={geo}
                        onClick={() => toggleGeo(geo)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                          selected
                            ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                        data-testid={`chip-geo-${geo.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        {geo}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <Button
            onClick={() => {
              if (step < totalSteps) setStep(step + 1);
            }}
            disabled={!canProceed()}
            className="w-full bg-[#1e3a5f] text-white hover:bg-[#162d4a] h-11"
            data-testid="button-next"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
