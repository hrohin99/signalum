import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, ArrowRight, Building2, User, Landmark, BarChart3, Handshake, Scale, Check, Loader2 } from "lucide-react";

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

const REGULATORY_BODY_OPTIONS = ["ICO", "FCA", "UK Home Office", "NIST", "ENISA", "European Commission", "FIDO Alliance", "ISO", "BSI", "Other"];
const STANDARDS_BODY_OPTIONS = ["ISO", "NIST", "BSI", "FIDO Alliance", "W3C", "ETSI", "IEC", "Other"];
const JURISDICTION_OPTIONS = ["United Kingdom", "United States", "European Union", "Canada", "Australia", "Global"];

const EARLY_WARNING_PLACEHOLDERS: Record<string, string> = {
  vendor: "e.g. A competitor winning a major contract I was also bidding on, or launching a feature that closes my key advantage",
  business_owner: "e.g. A large competitor entering my niche, or a regulation that could disrupt my business model",
  government: "e.g. A vendor receiving a critical security finding, or a policy change affecting our procurement criteria",
  analyst: "e.g. An acquisition that reshapes the competitive landscape I cover",
  sales: "e.g. A competitor losing a major customer or raising prices",
  legal_compliance: "e.g. An enforcement action against a peer organisation, or a proposed amendment requiring re-certification",
};

function MultiChips({ options, selected, onToggle, testIdPrefix }: { options: string[]; selected: string[]; onToggle: (v: string) => void; testIdPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
              active ? "border-[#1e3a5f] bg-[#1e3a5f] text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
            data-testid={`${testIdPrefix}-${opt.replace(/\s+/g, "-").toLowerCase()}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-gray-100 my-6" />;
}

function SectionHeading({ children }: { children: string }) {
  return <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">{children}</h3>;
}

export default function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

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

  const [regulationsText, setRegulationsText] = useState("");
  const [trendsText, setTrendsText] = useState("");

  const [govVendorType, setGovVendorType] = useState("");
  const [govProcurementFrameworks, setGovProcurementFrameworks] = useState("");
  const [govEvaluationCriteria, setGovEvaluationCriteria] = useState("");
  const [govPolicyAreas, setGovPolicyAreas] = useState("");
  const [govPolicyRelationship, setGovPolicyRelationship] = useState("");
  const [govTechEvaluation, setGovTechEvaluation] = useState("");

  const [analystIndustrySector, setAnalystIndustrySector] = useState("");
  const [analystDecisionsInformed, setAnalystDecisionsInformed] = useState("");
  const [analystMultipleClients, setAnalystMultipleClients] = useState(false);

  const [salesDealType, setSalesDealType] = useState("");
  const [salesBuySignals, setSalesBuySignals] = useState("");

  const [legalJurisdictions, setLegalJurisdictions] = useState<string[]>([]);
  const [legalReportTo, setLegalReportTo] = useState("");
  const [legalCertsPursuing, setLegalCertsPursuing] = useState("");

  const totalSteps = 6;
  const has = (t: string) => trackingTypes.includes(t);
  const pv = perspective;

  const toggleArr = (arr: string[], setArr: (v: string[]) => void, value: string) => {
    setArr(arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]);
  };

  const canProceed = (): boolean => {
    if (step === 1) return perspective !== "";
    if (step === 2) return trackingTypes.length > 0;
    if (step === 3) return orgDescription.trim().length > 0;
    if (step === 4) {
      if ((pv === "vendor" || pv === "business_owner") && has("competitors") && !competitors.trim()) return false;
      if (pv === "analyst" && !analystIndustrySector.trim()) return false;
      if (pv === "sales" && has("competitors") && !competitors.trim()) return false;
      if (pv === "legal_compliance" && has("regulations") && !regulationsText.trim()) return false;
      return true;
    }
    if (step === 5) return earlyWarningSignal.trim().length > 0;
    return true;
  };

  const perspectiveLabel = PERSPECTIVE_OPTIONS.find((o) => o.value === perspective)?.label || perspective;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const regsArray = regulationsText
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await apiRequest("PUT", "/api/workspace/profile", {
        userPerspective: perspective,
        trackingTypes,
        orgDescription,
        userRole,
        orgGeographies,
        competitors,
        winFactors,
        vulnerability,
        earlyWarningSignal,
        regulationsMonitored: regsArray.length > 0 ? regsArray : regulationsMonitored,
        regulatoryBodies,
        compliancePurpose,
        standardsBodies,
        standardsCertified,
        standardsPurpose,
        briefingAudience,
        onboardingCompleted: true,
      });

      onComplete();
    } catch (err: any) {
      toast({
        title: "Error saving profile",
        description: err.message || "Could not save your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep4VendorOwner = () => {
    const sections: JSX.Element[] = [];

    if (has("competitors")) {
      sections.push(
        <div key="competitors" className="space-y-4">
          <SectionHeading>Competitors</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Who are your main competitors?</label>
            <Input placeholder="e.g. Google, Microsoft, Salesforce" value={competitors} onChange={(e) => setCompetitors(e.target.value)} data-testid="input-competitors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What do you win on vs competitors?</label>
            <Textarea placeholder="e.g. Price, speed to deploy, specific certifications" value={winFactors} onChange={(e) => setWinFactors(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-win-factors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Where are you most vulnerable?</label>
            <Textarea placeholder="e.g. Lack of enterprise features, limited geographic presence" value={vulnerability} onChange={(e) => setVulnerability(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-vulnerability" />
          </div>
        </div>
      );
    }

    if (has("regulations")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-reg" />);
      sections.push(
        <div key="regulations" className="space-y-4">
          <SectionHeading>Regulations</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Which regulations are you subject to or monitoring?</label>
            <Textarea placeholder="e.g. GDPR, UK Online Safety Act, EU AI Act" value={regulationsText} onChange={(e) => setRegulationsText(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-regulations-text" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Regulatory bodies</label>
            <MultiChips options={REGULATORY_BODY_OPTIONS} selected={regulatoryBodies} onToggle={(v) => toggleArr(regulatoryBodies, setRegulatoryBodies, v)} testIdPrefix="chip-regbody" />
          </div>
        </div>
      );
    }

    if (has("standards")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-std" />);
      sections.push(
        <div key="standards" className="space-y-4">
          <SectionHeading>Standards</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Which standards are you certified against or pursuing?</label>
            <Textarea placeholder="e.g. ISO 27001, SOC 2 Type II" value={standardsCertified} onChange={(e) => setStandardsCertified(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-standards-certified" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Standards bodies</label>
            <MultiChips options={STANDARDS_BODY_OPTIONS} selected={standardsBodies} onToggle={(v) => toggleArr(standardsBodies, setStandardsBodies, v)} testIdPrefix="chip-stdbody" />
          </div>
        </div>
      );
    }

    if (has("trends")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-trends" />);
      sections.push(
        <div key="trends" className="space-y-4">
          <SectionHeading>Trends</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What technologies or market shifts are you monitoring?</label>
            <Textarea placeholder="e.g. AI-generated synthetic media, decentralised identity" value={trendsText} onChange={(e) => setTrendsText(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-trends-text" />
          </div>
        </div>
      );
    }

    return sections;
  };

  const renderStep4Government = () => {
    const sections: JSX.Element[] = [];

    if (has("vendors")) {
      sections.push(
        <div key="vendors" className="space-y-4">
          <SectionHeading>Vendors</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What type of vendors are you evaluating?</label>
            <Textarea placeholder="e.g. Cloud providers, identity verification vendors" value={govVendorType} onChange={(e) => setGovVendorType(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-gov-vendor-type" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What procurement frameworks apply?</label>
            <Textarea placeholder="e.g. G-Cloud, Crown Commercial Service" value={govProcurementFrameworks} onChange={(e) => setGovProcurementFrameworks(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-gov-procurement" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Key evaluation criteria?</label>
            <Textarea placeholder="e.g. Security accreditation, data sovereignty" value={govEvaluationCriteria} onChange={(e) => setGovEvaluationCriteria(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-gov-eval-criteria" />
          </div>
        </div>
      );
    }

    if (has("regulations")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-reg" />);
      sections.push(
        <div key="regulations" className="space-y-4">
          <SectionHeading>Regulations &amp; Policy</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Which policy areas are you responsible for?</label>
            <Textarea placeholder="e.g. Digital identity legislation, online safety" value={govPolicyAreas} onChange={(e) => setGovPolicyAreas(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-gov-policy-areas" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your relationship to these policies?</label>
            <Select value={govPolicyRelationship} onValueChange={setGovPolicyRelationship}>
              <SelectTrigger data-testid="select-gov-policy-rel">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Policy maker">Policy maker</SelectItem>
                <SelectItem value="Policy implementer">Policy implementer</SelectItem>
                <SelectItem value="Both">Both</SelectItem>
                <SelectItem value="Monitoring only">Monitoring only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    if (has("trends")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-trends" />);
      sections.push(
        <div key="trends" className="space-y-4">
          <SectionHeading>Technology Trends</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What technologies are you evaluating for adoption or regulation?</label>
            <Textarea placeholder="e.g. AI decision-making, digital wallets" value={govTechEvaluation} onChange={(e) => setGovTechEvaluation(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-gov-tech-eval" />
          </div>
        </div>
      );
    }

    return sections;
  };

  const renderStep4Analyst = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Which industry or sector are you covering?</label>
        <Textarea placeholder="e.g. Financial services, government technology" value={analystIndustrySector} onChange={(e) => setAnalystIndustrySector(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-analyst-sector" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Who is your primary audience?</label>
        <Input placeholder="e.g. Investment clients, government departments" value={briefingAudience} onChange={(e) => setBriefingAudience(e.target.value)} data-testid="input-briefing-audience" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">What decisions does your intelligence inform?</label>
        <Textarea placeholder="e.g. Investment decisions, market entry strategy" value={analystDecisionsInformed} onChange={(e) => setAnalystDecisionsInformed(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-analyst-decisions" />
      </div>
      <div className="flex items-center justify-between py-2">
        <label className="text-sm font-medium text-gray-700">Do you cover multiple clients in the same space?</label>
        <Switch checked={analystMultipleClients} onCheckedChange={setAnalystMultipleClients} data-testid="toggle-analyst-multi-clients" />
      </div>
    </div>
  );

  const renderStep4Sales = () => {
    const sections: JSX.Element[] = [];

    if (has("competitors")) {
      sections.push(
        <div key="competitors" className="space-y-4">
          <SectionHeading>Competitive Intelligence</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Who are you competing against in active deals?</label>
            <Input placeholder="e.g. Google, Salesforce, Oracle" value={competitors} onChange={(e) => setCompetitors(e.target.value)} data-testid="input-competitors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What objections do you hear most?</label>
            <Textarea placeholder="e.g. Price too high, missing enterprise features" value={vulnerability} onChange={(e) => setVulnerability(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-vulnerability" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Typical deal type?</label>
            <Select value={salesDealType} onValueChange={setSalesDealType}>
              <SelectTrigger data-testid="select-sales-deal-type">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SMB">SMB</SelectItem>
                <SelectItem value="Mid-market">Mid-market</SelectItem>
                <SelectItem value="Enterprise">Enterprise</SelectItem>
                <SelectItem value="Government / Public Sector">Government / Public Sector</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    if (has("trends")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-trends" />);
      sections.push(
        <div key="trends" className="space-y-4">
          <SectionHeading>Buying Signals</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">What signals would indicate a prospect is ready to buy?</label>
            <Textarea placeholder="e.g. A competitor raising prices, a regulatory change creating urgency" value={salesBuySignals} onChange={(e) => setSalesBuySignals(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-sales-buy-signals" />
          </div>
        </div>
      );
    }

    return sections;
  };

  const renderStep4LegalCompliance = () => {
    const sections: JSX.Element[] = [];

    if (has("regulations")) {
      sections.push(
        <div key="regulations" className="space-y-4">
          <SectionHeading>Regulatory Monitoring</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Which regulations is your organisation subject to?</label>
            <Textarea placeholder="e.g. GDPR, FCA Consumer Duty, EU AI Act" value={regulationsText} onChange={(e) => setRegulationsText(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-regulations-text" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Jurisdictions</label>
            <MultiChips options={JURISDICTION_OPTIONS} selected={legalJurisdictions} onToggle={(v) => toggleArr(legalJurisdictions, setLegalJurisdictions, v)} testIdPrefix="chip-jurisdiction" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Who do you report to or advise internally?</label>
            <Input placeholder="e.g. General Counsel, Chief Risk Officer" value={legalReportTo} onChange={(e) => setLegalReportTo(e.target.value)} data-testid="input-legal-report-to" />
          </div>
        </div>
      );
    }

    if (has("standards")) {
      if (sections.length > 0) sections.push(<SectionDivider key="div-std" />);
      sections.push(
        <div key="standards" className="space-y-4">
          <SectionHeading>Certifications</SectionHeading>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Which certifications do you currently hold?</label>
            <Textarea placeholder="e.g. ISO 27001, SOC 2, Cyber Essentials Plus" value={standardsCertified} onChange={(e) => setStandardsCertified(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-standards-certified" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Which are you pursuing or renewing?</label>
            <Textarea placeholder="e.g. ISO 42001, FedRAMP" value={legalCertsPursuing} onChange={(e) => setLegalCertsPursuing(e.target.value)} className="min-h-[80px] resize-none" data-testid="input-legal-certs-pursuing" />
          </div>
        </div>
      );
    }

    return sections;
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
                      selected ? "border-[#1e3a5f] bg-[#1e3a5f]/5" : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                    data-testid={`card-perspective-${opt.value}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-[#1e3a5f] text-white" : "bg-gray-100 text-gray-500"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${selected ? "text-[#1e3a5f]" : "text-gray-900"}`}>{opt.label}</div>
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
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">What do you want to track?</h1>
              <p className="text-gray-500 text-sm" data-testid="text-step-subtitle">Select all that apply.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TRACKING_TYPE_OPTIONS.map((opt) => {
                const selected = trackingTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTrackingTypes((prev) => prev.includes(opt.value) ? prev.filter((t) => t !== opt.value) : [...prev, opt.value])}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
                      selected ? "border-[#1e3a5f] bg-[#1e3a5f] text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
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
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">Tell us about your organisation</h1>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">What does your organisation do, and who are your customers or stakeholders?</label>
                <Textarea placeholder="e.g. We provide cloud-based software to financial services firms globally" value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} className="min-h-[100px] resize-none" data-testid="input-org-description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">What is your role?</label>
                <Select value={userRole} onValueChange={setUserRole}>
                  <SelectTrigger data-testid="select-user-role"><SelectValue placeholder="Select your role" /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (<SelectItem key={role} value={role}>{role}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Which geographies matter most?</label>
                <MultiChips options={GEO_OPTIONS} selected={orgGeographies} onToggle={(v) => toggleArr(orgGeographies, setOrgGeographies, v)} testIdPrefix="chip-geo" />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">Now let's get specific</h1>
            </div>
            <div>
              {(pv === "vendor" || pv === "business_owner") && renderStep4VendorOwner()}
              {pv === "government" && renderStep4Government()}
              {pv === "analyst" && renderStep4Analyst()}
              {pv === "sales" && renderStep4Sales()}
              {pv === "legal_compliance" && renderStep4LegalCompliance()}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">
                What would make you say: glad I caught that before anyone else did?
              </h1>
              <p className="text-gray-500 text-sm" data-testid="text-step-subtitle">
                Be specific — this is what Signalum will flag as highest priority for you.
              </p>
            </div>
            <Textarea
              placeholder={EARLY_WARNING_PLACEHOLDERS[perspective] || "Describe the signal you'd want to know about immediately..."}
              value={earlyWarningSignal}
              onChange={(e) => setEarlyWarningSignal(e.target.value)}
              className="min-h-[150px] resize-none"
              data-testid="input-early-warning"
            />
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2" data-testid="text-step-title">You're all set</h1>
              <p className="text-gray-500 text-sm" data-testid="text-step-subtitle">
                Signalum will use this to tailor every insight and briefing to your situation.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg border border-gray-200 p-5 space-y-3" data-testid="summary-card">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#1e3a5f]" />
                <span className="text-sm font-medium text-gray-900">{perspectiveLabel}</span>
              </div>
              {orgDescription && (
                <div className="text-sm text-gray-600" data-testid="summary-org">
                  {orgDescription.length > 100 ? orgDescription.slice(0, 100) + "..." : orgDescription}
                </div>
              )}
              {orgGeographies.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {orgGeographies.map((g) => (
                    <span key={g} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">{g}</span>
                  ))}
                </div>
              )}
              {trackingTypes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {trackingTypes.map((t) => {
                    const label = TRACKING_TYPE_OPTIONS.find((o) => o.value === t)?.label || t;
                    return <span key={t} className="px-2 py-0.5 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded text-xs font-medium">{label}</span>;
                  })}
                </div>
              )}
              {earlyWarningSignal && (
                <div className="text-sm text-gray-600 border-t border-gray-200 pt-3 mt-3" data-testid="summary-early-warning">
                  <span className="font-medium text-gray-700">Early warning: </span>
                  {earlyWarningSignal.length > 120 ? earlyWarningSignal.slice(0, 120) + "..." : earlyWarningSignal}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)} data-testid="button-edit-answers">
                Edit answers
              </Button>
              <Button
                className="flex-1 bg-[#1e3a5f] text-white hover:bg-[#162d4a] h-11"
                onClick={handleSubmit}
                disabled={submitting}
                data-testid="button-go-workspace"
              >
                {submitting ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Saving...</span>
                ) : (
                  "Go to my workspace"
                )}
              </Button>
            </div>
          </div>
        )}

        {step < 6 && (
          <div className="mt-8">
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="w-full bg-[#1e3a5f] text-white hover:bg-[#162d4a] h-11"
              data-testid="button-next"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
