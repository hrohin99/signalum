import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from "lucide-react";

const TYPING_TEXT = "Acme Corp just announced a new enterprise pricing tier targeting mid-market customers.";

const SCROLLING_TAGS = [
  "Competitors", "Industry Trends", "News Articles", "Meeting Notes",
  "Market Shifts", "Company Updates", "Product Launches", "Policy Changes",
  "Pricing Moves", "Research Papers", "Social Signals", "Technology Shifts",
  "People to Watch", "Funding News", "Emerging Topics",
];

const TRACK_CARDS = [
  {
    emoji: "🏢",
    title: "Your Competitors",
    text: "A rival just updated their pricing and launched a new feature. You found out this morning, before your next customer call.",
  },
  {
    emoji: "📰",
    title: "News & Trends",
    text: "Three major stories broke in your industry this week. Watchloom pulled them together so you did not have to.",
  },
  {
    emoji: "💡",
    title: "Ideas & Research",
    text: "That article you bookmarked at midnight is now part of your morning brief, filed under the right topic automatically.",
  },
  {
    emoji: "🌐",
    title: "Websites & Products",
    text: "A competitor's website changed overnight. New pricing, new messaging. You noticed before your sales team had to ask.",
  },
  {
    emoji: "📢",
    title: "Topics You Care About",
    text: "Anything happening in a space you follow gets captured, summarised, and waiting for you each morning.",
  },
];

function HeroTrackingInput() {
  const [trackingInput, setTrackingInput] = useState("");
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleBuildWorkspace = () => {
    if (!trackingInput.trim()) return;
    localStorage.setItem("watchloom_tracking_intent", trackingInput.trim());

    if (user) {
      toast({
        title: "We have added your new tracking topic to your workspace.",
      });
      navigate("/");
    } else {
      navigate("/signup?from=hero");
    }
  };

  return (
    <div className="mx-auto mt-6" style={{ maxWidth: 700 }}>
      <div
        style={{
          border: "2px solid #1e3a5f",
          borderRadius: 12,
          padding: 16,
          backgroundColor: "#ffffff",
        }}
        data-testid="hero-tracking-input"
      >
        <input
          type="text"
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleBuildWorkspace(); }}
          placeholder="What do you want to track? e.g. competitors, industry news, regulations..."
          className="w-full outline-none"
          style={{
            border: "none",
            padding: "4px 0",
            color: "#334155",
            backgroundColor: "transparent",
            fontSize: 15,
          }}
          data-testid="input-hero-tracking"
        />
        <button
          onClick={handleBuildWorkspace}
          disabled={!trackingInput.trim()}
          className="w-full flex items-center justify-center gap-2 mt-3 rounded-lg font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: "#1e3a5f",
            color: "#ffffff",
            padding: "12px 0",
            fontSize: 16,
          }}
          data-testid="button-build-workspace"
        >
          <Sparkles className="w-4 h-4" />
          Build my workspace
        </button>
      </div>
      <p className="text-sm mt-3 text-center" style={{ color: "#64748b" }} data-testid="text-hero-trust">
        Free for 14 days. No credit card required.
      </p>
    </div>
  );
}

function ProductMockup() {
  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: 960,
        marginTop: 48,
        marginBottom: 48,
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        overflow: "hidden",
        border: "1px solid #e2e8f0",
      }}
      data-testid="mockup-product-frame"
    >
      <style>{`
        @keyframes mockupStage1 {
          0% { opacity: 1; }
          30.33% { opacity: 1; }
          33.33% { opacity: 0; }
          96% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes mockupStage2 {
          0% { opacity: 0; }
          30% { opacity: 0; }
          33.33% { opacity: 1; }
          63.66% { opacity: 1; }
          66.66% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes mockupStage3 {
          0% { opacity: 0; }
          63% { opacity: 0; }
          66.66% { opacity: 1; }
          96.33% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes typingWidth {
          0% { max-width: 0; }
          11.11% { max-width: 0; }
          33.33% { max-width: 100%; }
          100% { max-width: 100%; }
        }
        @keyframes blinkCaret {
          0%, 100% { border-right-color: #1e3a5f; }
          50% { border-right-color: transparent; }
        }
        @keyframes spinnerRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spinnerFade {
          0% { opacity: 1; }
          50% { opacity: 1; }
          55% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes resultReveal {
          0% { opacity: 0; }
          50% { opacity: 0; }
          55% { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes countBadge {
          0% { content: "3"; }
          50% { content: "3"; }
          60% { content: "4"; }
          100% { content: "4"; }
        }
        @keyframes badgeCount3 {
          0% { opacity: 1; }
          50% { opacity: 1; }
          55% { opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes badgeCount4 {
          0% { opacity: 0; }
          50% { opacity: 0; }
          55% { opacity: 1; }
          100% { opacity: 1; }
        }
        @keyframes summaryFlash {
          0% { opacity: 0.4; }
          40% { opacity: 0.4; }
          55% { opacity: 1; }
          70% { opacity: 0.6; }
          85% { opacity: 1; }
          100% { opacity: 1; }
        }
      `}</style>

      <div
        className="flex items-center gap-2 px-4"
        style={{ backgroundColor: "#f1f5f9", height: 36, borderBottom: "1px solid #e2e8f0" }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#f59e0b", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#22c55e", display: "inline-block" }} />
      </div>

      <div style={{ position: "relative", minHeight: 320, backgroundColor: "#ffffff" }}>

        <div
          data-testid="mockup-stage-capture"
          style={{
            position: "absolute",
            inset: 0,
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            animation: "mockupStage1 9s infinite",
          }}
        >
          <div style={{ width: "100%", maxWidth: 480 }}>
            <div className="text-sm font-semibold mb-3" style={{ color: "#1e3a5f" }}>
              Capture
            </div>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "14px 16px",
                minHeight: 80,
                backgroundColor: "#f8fafc",
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontFamily: "'DM Mono', 'Courier New', monospace",
                  fontSize: 12,
                  color: "#334155",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  borderRight: "2px solid #1e3a5f",
                  animation: `typingWidth 9s steps(${TYPING_TEXT.length}, end) infinite, blinkCaret 0.7s step-end infinite`,
                  maxWidth: `${TYPING_TEXT.length}ch`,
                  lineHeight: 1.6,
                }}
              >
                {TYPING_TEXT}
              </span>
            </div>
            <button
              style={{
                backgroundColor: "#1e3a5f",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "10px 28px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "default",
              }}
            >
              Submit
            </button>
          </div>
        </div>

        <div
          data-testid="mockup-stage-routing"
          style={{
            position: "absolute",
            inset: 0,
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            animation: "mockupStage2 9s infinite",
          }}
        >
          <div style={{ width: "100%", maxWidth: 480 }}>
            <div className="text-sm font-semibold mb-4" style={{ color: "#1e3a5f" }}>
              AI Routing
            </div>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 20,
                backgroundColor: "#f8fafc",
                position: "relative",
              }}
            >
              <div style={{ animation: "spinnerFade 3s infinite", position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ animation: "spinnerRotate 0.8s linear infinite" }}>
                  <circle cx="12" cy="12" r="10" stroke="#e2e8f0" strokeWidth="2.5" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#1e3a5f" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>

              <div style={{ animation: "resultReveal 3s infinite" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: "#334155" }}>Matched to:</span>
                    <span
                      className="text-xs font-medium rounded-full px-2.5 py-0.5"
                      style={{ backgroundColor: "#1e3a5f", color: "#ffffff" }}
                    >
                      Acme Corp
                    </span>
                  </div>
                  <span
                    className="text-xs font-medium rounded-full px-2.5 py-0.5"
                    style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}
                  >
                    Confirmed
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b", fontStyle: "italic" }}>
                  Pricing strategy update — filed under Competitors.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          data-testid="mockup-stage-map"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            animation: "mockupStage3 9s infinite",
          }}
        >
          <div
            style={{
              width: 240,
              minWidth: 240,
              backgroundColor: "#f8fafc",
              borderRight: "1px solid #e2e8f0",
              padding: "20px 0",
            }}
          >
            <div
              className="text-xs font-bold uppercase tracking-wider px-5 mb-4"
              style={{ color: "#1e3a5f" }}
            >
              Intelligence Map
            </div>

            <div
              className="flex items-center justify-between px-5 py-2.5 text-sm"
              style={{
                color: "#1e3a5f",
                backgroundColor: "#eef2f7",
                borderLeft: "3px solid #1e3a5f",
                fontWeight: 600,
              }}
            >
              <span>Competitors</span>
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{ backgroundColor: "#1e3a5f", color: "#ffffff", position: "relative" }}
              >
                <span style={{ animation: "badgeCount3 3s infinite" }}>3</span>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", animation: "badgeCount4 3s infinite" }}>4</span>
              </span>
            </div>

            {[
              { label: "Regulations", count: 2 },
              { label: "Industry News", count: 4 },
            ].map((cat) => (
              <div
                key={cat.label}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
                style={{
                  color: "#1e3a5f",
                  backgroundColor: "transparent",
                  borderLeft: "3px solid transparent",
                  fontWeight: 400,
                }}
              >
                <span>{cat.label}</span>
                <span
                  className="text-xs font-medium rounded-full px-2 py-0.5"
                  style={{ backgroundColor: "#e2e8f0", color: "#64748b" }}
                >
                  {cat.count}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 p-6" style={{ backgroundColor: "#ffffff" }}>
            <div className="mb-1">
              <span className="text-xl font-bold" style={{ color: "#1e3a5f" }}>Acme Corp</span>
            </div>
            <span
              className="inline-block text-xs rounded-full px-2.5 py-0.5 mb-5"
              style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}
            >
              Competitors
            </span>

            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: "#1e3a5f" }}>AI Summary</span>
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "#64748b", animation: "summaryFlash 3s infinite" }}
              >
                Acme Corp announced a new enterprise pricing tier targeting mid-market customers. This signals a strategic shift upmarket and may impact competitive positioning.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <div
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: "#f8fafc", border: "1px solid #f1f5f9" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>Mar 5, 2026</span>
                <span className="text-xs flex-1" style={{ color: "#334155" }}>New enterprise pricing tier announced.</span>
                <span
                  className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}
                >
                  Confirmed
                </span>
              </div>
              <div
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: "#f8fafc", border: "1px solid #f1f5f9" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>Mar 4, 2026</span>
                <span className="text-xs flex-1" style={{ color: "#334155" }}>Homepage messaging shifted toward enterprise buyers.</span>
                <span
                  className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}
                >
                  Confirmed
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif", scrollBehavior: "smooth" }}>
      <style>{`
        @keyframes scrollTags {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* NAVBAR */}
      <nav
        className="fixed top-0 left-0 w-full flex items-center justify-between"
        style={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "16px 24px",
          zIndex: 1000,
        }}
        data-testid="navbar-landing"
      >
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" data-testid="icon-navbar-logo">
            <rect width="32" height="32" rx="8" fill="#1e3a5f" />
            <path d="M8 10l4 12 4-8 4 8 4-12" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="text-lg font-bold" style={{ color: "#1e3a5f" }} data-testid="text-navbar-brand">
            Watchloom
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a
            href="#how-it-works"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "#64748b", fontSize: 15 }}
            data-testid="link-nav-how"
          >
            How it works
          </a>
          <a
            href="#what-you-can-track"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "#64748b", fontSize: 15 }}
            data-testid="link-nav-track"
          >
            What you can track
          </a>
          <a
            href="#coming-soon"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "#64748b", fontSize: 15 }}
            data-testid="link-nav-coming-soon"
          >
            Coming soon
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/signin">
            <button
              className="px-4 py-2 rounded-lg font-medium border transition-opacity hover:opacity-80"
              style={{ color: "#1e3a5f", borderColor: "#1e3a5f", backgroundColor: "#ffffff", fontSize: 16 }}
              data-testid="button-nav-signin"
            >
              Sign In
            </button>
          </Link>
          <Link href="/signup">
            <button
              className="px-4 py-2 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#1e3a5f", fontSize: 16 }}
              data-testid="button-nav-start-trial"
            >
              Start Free Trial
            </button>
          </Link>
        </div>
      </nav>

      {/* SECTION 1 - HERO */}
      <section className="w-full" style={{ backgroundColor: "#ffffff", padding: "120px 40px 0 40px", marginTop: 68 }}>
        <div className="max-w-[900px] mx-auto text-center">
          <div
            className="inline-block rounded-full px-4 py-1.5 text-xs font-medium mb-8"
            style={{ backgroundColor: "#f0f4f8", color: "#1e3a5f" }}
            data-testid="badge-hero-pill"
          >
            Your AI intelligence workspace
          </div>

          <h1
            className="tracking-tight leading-tight mb-6"
            style={{ color: "#1e3a5f", fontSize: 72, fontWeight: 800 }}
            data-testid="text-hero-headline"
          >
            Know more. Miss nothing.
          </h1>

          <p
            className="max-w-[640px] mx-auto mb-10"
            style={{ color: "#64748b", fontSize: 20, lineHeight: 1.7 }}
            data-testid="text-hero-subheadline"
          >
            Most professionals spend 5 or more hours every month manually searching for news, tracking competitors, and piecing together what changed in their industry. Watchloom's AI agents do all of that automatically, crawling the internet continuously so you wake up every morning already knowing what matters.
          </p>

          <div
            className="max-w-[860px] mx-auto mb-10 rounded-lg"
            style={{
              backgroundColor: "#f8fafc",
              padding: "32px 0",
            }}
            data-testid="stats-bar"
          >
            <div
              className="hidden md:flex items-stretch justify-center"
              style={{ gap: 0 }}
            >
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <div>
                  <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }} data-testid="stat-hours">5+ hours</div>
                  <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>saved every month per user</div>
                </div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0" }} />
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <div>
                  <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }} data-testid="stat-schedule">Daily, weekly or monthly</div>
                  <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>briefings on your schedule</div>
                </div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0" }} />
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <div>
                  <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }} data-testid="stat-topic">Any topic</div>
                  <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>set up in plain English</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-6 md:hidden">
              <div className="text-center">
                <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }}>5+ hours</div>
                <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>saved every month per user</div>
              </div>
              <div className="text-center">
                <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }}>Daily, weekly or monthly</div>
                <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>briefings on your schedule</div>
              </div>
              <div className="text-center">
                <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }}>Any topic</div>
                <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>set up in plain English</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <Link href="/signup">
              <button
                className="px-8 py-3 rounded-lg font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#1e3a5f", color: "#ffffff", fontSize: 16 }}
                data-testid="button-get-started"
              >
                Get Started Free
              </button>
            </Link>
            <Link href="/signin">
              <button
                className="px-8 py-3 rounded-lg font-semibold border-2 transition-opacity hover:opacity-80"
                style={{ color: "#1e3a5f", borderColor: "#1e3a5f", backgroundColor: "#ffffff", fontSize: 16 }}
                data-testid="button-sign-in-hero"
              >
                Sign In
              </button>
            </Link>
          </div>

          <HeroTrackingInput />
        </div>

        <div className="max-w-[960px] mx-auto px-4">
          <ProductMockup />
        </div>
      </section>

      {/* SECTION 1.5 - THE REAL PROBLEM */}
      <section className="w-full" style={{ backgroundColor: "#f8fafc", padding: "80px 40px" }}>
        <div className="mx-auto flex flex-col md:flex-row items-start gap-10" style={{ maxWidth: 1040 }}>
          <div className="w-full md:w-[55%]">
            <p
              className="font-semibold uppercase mb-4"
              style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.15em" }}
              data-testid="text-problem-label"
            >
              The real problem
            </p>
            <h2
              className="leading-tight mb-6"
              style={{ color: "#1e3a5f", fontSize: 42, fontWeight: 700 }}
              data-testid="text-problem-headline"
            >
              You are not short on information. You are short on clarity.
            </h2>
            <p style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }} className="mb-4" data-testid="text-problem-p1">
              Every day you get hit with newsletters, alerts, articles, Slack messages, and LinkedIn posts. The information is everywhere. The problem is none of it connects.
            </p>
            <p style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }} className="mb-4" data-testid="text-problem-p2">
              You bookmark things you never revisit. You save articles you forget about. You take notes that sit in a folder nobody opens. Storing information is not the same as understanding it.
            </p>
            <p style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }} data-testid="text-problem-p3">
              Watchloom does not just store what you capture. It reads it, connects it to everything else you track, and turns it into a clear picture of what is actually happening in your world.
            </p>
          </div>

          <div className="w-full md:w-[45%]">
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 8,
                padding: 24,
              }}
              data-testid="card-comparison"
            >
              <div className="flex flex-wrap">
                <div className="flex-1 pr-4" style={{ borderRight: "1px solid #e2e8f0", minWidth: 140 }}>
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span className="text-xs font-semibold" style={{ color: "#f87171" }}>Without Watchloom</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>Bookmarks you never revisit</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>Notes scattered across tools</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>Alerts with no context</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>Hours spent piecing it together</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>Blindsided by things you should have known</p>
                  </div>
                </div>

                <div className="flex-1 pl-4" style={{ minWidth: 140 }}>
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-xs font-semibold" style={{ color: "#1e3a5f" }}>With Watchloom</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs leading-relaxed" style={{ color: "#1e3a5f" }}>Everything captured in one place</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#1e3a5f" }}>AI connects the dots automatically</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#1e3a5f" }}>Context built up over time</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#1e3a5f" }}>Briefed on your schedule</p>
                    <p className="text-xs leading-relaxed" style={{ color: "#1e3a5f" }}>Always the most informed person in the room</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2 - SCROLLING TAG STRIP */}
      <section
        className="w-full overflow-hidden"
        style={{ backgroundColor: "#f8fafc", padding: "40px 0" }}
      >
        <div
          className="flex whitespace-nowrap"
          style={{
            animation: "scrollTags 40s linear infinite",
            width: "fit-content",
          }}
        >
          {[...SCROLLING_TAGS, ...SCROLLING_TAGS].map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-block text-sm font-medium rounded-full px-4 py-2 mx-1.5 flex-shrink-0"
              style={{
                backgroundColor: "#ffffff",
                color: "#1e3a5f",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* SECTION 3 - HOW IT WORKS */}
      <section id="how-it-works" className="w-full" style={{ backgroundColor: "#ffffff", padding: "80px 40px", scrollMarginTop: 80 }}>
        <div className="max-w-[1040px] mx-auto">
          <div className="text-center mb-16">
            <p
              className="font-semibold uppercase mb-3"
              style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.15em" }}
              data-testid="text-how-label"
            >
              How it works
            </p>
            <h2
              style={{ color: "#1e3a5f", fontSize: 42, fontWeight: 700 }}
              data-testid="text-how-headline"
            >
              Simple by design. Powerful by default.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 md:gap-0 items-start">
            <div className="text-center px-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <h3
                className="mb-2"
                style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600 }}
                data-testid="text-step-capture"
              >
                Capture anything
              </h3>
              <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                Heard something interesting in a meeting? Spotted an article? Had a thought in the shower? Drop it in, voice, text, link, or file.
              </p>
            </div>

            <div className="hidden md:flex items-center justify-center pt-8" style={{ color: "#cbd5e1" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="text-center px-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="5" cy="19" r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <line x1="12" y1="7" x2="5" y2="17" />
                  <line x1="12" y1="7" x2="19" y2="17" />
                </svg>
              </div>
              <h3
                className="mb-2"
                style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600 }}
                data-testid="text-step-route"
              >
                AI finds where it belongs
              </h3>
              <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                Watchloom reads what you captured, figures out where it belongs, and files it automatically. You never have to think about organisation again.
              </p>
            </div>

            <div className="hidden md:flex items-center justify-center pt-8" style={{ color: "#cbd5e1" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="text-center px-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                  <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                  <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                </svg>
              </div>
              <h3
                className="mb-2"
                style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600 }}
                data-testid="text-step-brief"
              >
                Briefed every morning
              </h3>
              <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                Every morning, a crisp summary of everything that changed across your topics lands in your workspace. Like having a researcher on your team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3.5 - SOCIAL PROOF */}
      <section className="w-full" style={{ backgroundColor: "#ffffff", padding: "60px 40px" }}>
        <div className="mx-auto" style={{ maxWidth: 1040 }}>
          <p
            className="text-center font-semibold uppercase mb-8"
            style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.15em" }}
            data-testid="text-social-proof-label"
          >
            Trusted by professionals who need to stay ahead
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-testid="social-proof-grid">
            <div
              className="flex flex-col"
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 24,
              }}
              data-testid="card-testimonial-1"
            >
              <p className="italic flex-1" style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                "I used to spend half a Sunday catching up on what happened in my industry that week. Now it is waiting for me Monday morning."
              </p>
              <div>
                <div style={{ width: 32, height: 2, backgroundColor: "#1e3a5f", marginTop: 16, marginBottom: 12 }} />
                <p className="text-xs" style={{ color: "#64748b" }}>Senior Product Manager, SaaS company</p>
              </div>
            </div>

            <div
              className="flex flex-col"
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 24,
              }}
              data-testid="card-testimonial-2"
            >
              <p className="italic flex-1" style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                "The daily brief is the first thing I open. It has genuinely changed how prepared I feel going into client meetings."
              </p>
              <div>
                <div style={{ width: 32, height: 2, backgroundColor: "#1e3a5f", marginTop: 16, marginBottom: 12 }} />
                <p className="text-xs" style={{ color: "#64748b" }}>Strategy Consultant, professional services</p>
              </div>
            </div>

            <div
              className="flex flex-col"
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 24,
              }}
              data-testid="card-testimonial-3"
            >
              <p className="italic flex-1" style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                "I track six different topics across two industries. Watchloom files everything and I never miss a thing."
              </p>
              <div>
                <div style={{ width: 32, height: 2, backgroundColor: "#1e3a5f", marginTop: 16, marginBottom: 12 }} />
                <p className="text-xs" style={{ color: "#64748b" }}>Market Analyst, financial services</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 - TRACK ANYTHING SHOWCASE */}
      <section id="what-you-can-track" className="w-full" style={{ backgroundColor: "#f8fafc", padding: "80px 40px", scrollMarginTop: 80 }}>
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-16">
            <p
              className="font-semibold uppercase mb-3"
              style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.15em" }}
              data-testid="text-track-label"
            >
              What can you track?
            </p>
            <h2
              style={{ color: "#1e3a5f", fontSize: 42, fontWeight: 700 }}
              data-testid="text-track-headline"
            >
              Whatever you need to stay on top of, Watchloom's got it
            </h2>
            <p
              className="mt-3"
              style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }}
              data-testid="text-track-subheadline"
            >
              You define what matters. We track it, file it, and brief you on it every morning.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" style={{ gridAutoRows: "1fr" }}>
            {TRACK_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-lg p-6"
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 24,
                }}
                data-testid={`card-track-${card.title.toLowerCase().replace(/[^a-z]/g, "-")}`}
              >
                <div className="text-2xl mb-3">{card.emoji}</div>
                <h3 className="mb-2" style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600 }}>
                  {card.title}
                </h3>
                <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                  {card.text}
                </p>
              </div>
            ))}

            <div
              className="rounded-lg p-6"
              style={{
                backgroundColor: "#1e3a5f",
                borderRadius: 8,
                padding: 24,
              }}
              data-testid="card-track-anything"
            >
              <div className="text-2xl mb-3">✳️</div>
              <h3 className="mb-2 text-white" style={{ fontSize: 18, fontWeight: 600 }}>
                Anything You Define
              </h3>
              <p className="text-white" style={{ fontSize: 15, lineHeight: 1.6 }}>
                You tell us what matters in plain English. We build your tracking workspace automatically, no setup, no configuration, no IT required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4.5 - COMING SOON TEASER */}
      <section id="coming-soon" className="w-full" style={{ backgroundColor: "#ffffff", padding: "60px 40px", scrollMarginTop: 80 }}>
        <div className="mx-auto" style={{ maxWidth: 860 }}>
          <div
            style={{
              border: "1px solid #1e3a5f",
              borderRadius: 12,
              backgroundColor: "#f0f4f9",
              padding: 40,
            }}
            data-testid="card-coming-soon"
          >
            <span
              className="inline-block text-xs font-semibold text-white rounded-full px-3 py-1 mb-5"
              style={{ backgroundColor: "#1e3a5f" }}
              data-testid="badge-coming-soon"
            >
              Coming Soon
            </span>

            <h3
              className="mb-4"
              style={{ color: "#1e3a5f", fontSize: 42, fontWeight: 700 }}
              data-testid="text-coming-soon-headline"
            >
              Ask Watchloom anything about your tracked topics
            </h3>

            <p
              className="mb-6"
              style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }}
              data-testid="text-coming-soon-description"
            >
              Soon you will be able to ask Watchloom questions in plain English and get instant answers from everything it has captured for you. What has changed with a competitor this month? What are the biggest themes across your industry right now? What did I capture about pricing changes last week? Watchloom will search its own knowledge of your workspace and answer in seconds.
            </p>

            <div className="flex flex-wrap gap-3 mb-6" data-testid="pills-coming-soon">
              <span
                className="text-xs rounded-full px-4 py-2"
                style={{ backgroundColor: "#ffffff", border: "1px solid #1e3a5f", color: "#1e3a5f" }}
                data-testid="pill-query-1"
              >
                What is going on with Acme Corp this week?
              </span>
              <span
                className="text-xs rounded-full px-4 py-2"
                style={{ backgroundColor: "#ffffff", border: "1px solid #1e3a5f", color: "#1e3a5f" }}
                data-testid="pill-query-2"
              >
                Summarise all my regulatory updates this month
              </span>
              <span
                className="text-xs rounded-full px-4 py-2"
                style={{ backgroundColor: "#ffffff", border: "1px solid #1e3a5f", color: "#1e3a5f" }}
                data-testid="pill-query-3"
              >
                What are my competitors doing with pricing?
              </span>
            </div>

            <p
              className="text-xs italic mb-4"
              style={{ color: "#64748b" }}
              data-testid="text-coming-soon-cta"
            >
              Join the waitlist to be first to access this feature when it launches.
            </p>

            <div className="flex items-center justify-center">
              <div className="flex flex-col items-center" style={{ maxWidth: 420, width: "100%" }}>
                <div className="flex flex-wrap w-full gap-2">
                  <input
                    type="email"
                    placeholder="Your work email"
                    aria-label="Work email for waitlist"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    className="flex-1 text-sm rounded-lg px-4 py-2.5 outline-none"
                    style={{
                      minWidth: 200,
                      border: "1px solid #e2e8f0",
                      backgroundColor: "#ffffff",
                      color: "#1e3a5f",
                    }}
                    data-testid="input-waitlist-email"
                  />
                  <button
                    onClick={() => {
                      if (waitlistEmail.trim()) {
                        setWaitlistSubmitted(true);
                      }
                    }}
                    className="font-semibold text-white rounded-lg px-5 py-2.5 transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#1e3a5f", fontSize: 16 }}
                    data-testid="button-join-waitlist"
                  >
                    Join Waitlist
                  </button>
                </div>
                {waitlistSubmitted && (
                  <p
                    className="text-xs mt-3"
                    style={{ color: "#16a34a" }}
                    data-testid="text-waitlist-success"
                  >
                    You are on the list. We will be in touch.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 - FINAL CTA */}
      <section className="w-full" style={{ backgroundColor: "#ffffff", padding: "96px 40px" }}>
        <div className="max-w-[860px] mx-auto text-center">
          <h2
            className="mb-4"
            style={{ color: "#1e3a5f", fontSize: 42, fontWeight: 700 }}
            data-testid="text-cta-headline"
          >
            Stay ahead of everything that matters to you
          </h2>
          <p
            className="mb-10"
            style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }}
            data-testid="text-cta-subtext"
          >
            Join professionals who have stopped wasting hours on manual research. Watchloom tracks everything, briefs you on schedule, and gives you that time back.
          </p>
          <Link href="/signup">
            <button
              className="px-10 py-4 rounded-lg font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#1e3a5f", color: "#ffffff", fontSize: 16 }}
              data-testid="button-cta-get-started"
            >
              Start Your Free 14-Day Trial
            </button>
          </Link>
          <p className="text-sm mt-4" style={{ color: "#64748b" }}>
            Free for 14 days. No credit card required. Set up in under 3 minutes.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="w-full py-8"
        style={{ backgroundColor: "#f8fafc", padding: "32px 40px" }}
      >
        <div className="max-w-[1000px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <span className="text-base font-bold" style={{ color: "#1e3a5f" }} data-testid="text-footer-brand">
              Watchloom
            </span>
            <div className="flex items-center gap-6">
              <Link href="/signin">
                <span
                  className="text-sm font-medium hover:underline underline-offset-4 cursor-pointer"
                  style={{ color: "#1e3a5f" }}
                  data-testid="link-footer-signin"
                >
                  Sign In
                </span>
              </Link>
              <Link href="/signup">
                <span
                  className="text-sm font-medium hover:underline underline-offset-4 cursor-pointer"
                  style={{ color: "#1e3a5f" }}
                  data-testid="link-footer-get-started"
                >
                  Get Started
                </span>
              </Link>
            </div>
          </div>
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            &copy; 2026 Watchloom
          </p>
        </div>
      </footer>
    </div>
  );
}
