import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Shield, Lock, Eye } from "lucide-react";

const SCROLLING_TAGS = [
  "Competitor", "Regulation", "Trend", "Key Account", "Project",
  "Event", "Technology", "Person", "Hiring Signal", "Industry News",
];

const FEATURE_CARDS = [
  {
    title: "Your Competitors",
    text: "A rival updates their pricing and launches a feature. You find out that morning, before your next customer call. Battlecards auto-update. Capability comparisons stay current. You walk in prepared.",
    highlighted: true,
  },
  {
    title: "Regulations and Deadlines",
    text: "Compliance dates buried in documents get extracted automatically. You see them in your daily brief before they become a crisis. Hard deadlines shown in red. Never blindsided again.",
  },
  {
    title: "Hiring Signals",
    text: "Strategic hires reveal where a competitor is investing before any announcement. A sudden cluster of AI engineering roles tells you more than a press release.",
  },
  {
    title: "Pricing Intelligence",
    text: "Track competitor pricing over time in a structured table. Every change captured, dated, and sourced. Know before your sales team has to ask.",
  },
  {
    title: "Industry Trends",
    text: "Three major stories broke in your space this week. Signalum pulled them together so you did not have to.",
  },
  {
    title: "Key Accounts",
    text: "Track what is happening at accounts that matter to you. News, leadership changes, signals that affect your relationship.",
  },
  {
    title: "Meeting Notes and Conversations",
    text: "Drop in notes from a customer call or colleague conversation. Signalum files the intelligence automatically and connects it to what you already track.",
  },
  {
    title: "Anything You Define",
    text: "You tell Signalum what matters in plain English. It builds your workspace, tracks it, and briefs you on it every morning. No setup, no configuration, no IT required.",
    goldBorder: true,
  },
];

const FEATURES_COL1 = [
  { name: "Battlecards", desc: "Ready for your next sales conversation" },
  { name: "Capability Matrix", desc: "Compare features across every competitor" },
  { name: "Pricing Intelligence", desc: "Track pricing changes over time" },
  { name: "Hiring Signals", desc: "Know where they are investing" },
  { name: "Strategic Direction", desc: "Understand where they are heading" },
];

const FEATURES_COL2 = [
  { name: "Regulations and Deadlines", desc: "Never miss a compliance date" },
  { name: "Industry Trends", desc: "Stay ahead of market shifts" },
  { name: "Key Accounts", desc: "Track what matters to your customers" },
  { name: "Daily Brief", desc: "One morning email with the so what" },
];

const COMING_SOON_FEATURES = ["AI Visibility", "Email Capture", "Search"];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function CountUp({ end, suffix = "", duration = 1500 }: { end: number; suffix?: string; duration?: number }) {
  const { ref, visible } = useInView(0.3);
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [visible, end, duration]);

  return <span ref={ref}>{value}{suffix}</span>;
}

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
    <div className="mx-auto" style={{ maxWidth: 700, marginTop: 32 }}>
      <div
        style={{
          border: "2px solid rgba(255,255,255,0.3)",
          borderRadius: 12,
          padding: 16,
          backgroundColor: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)",
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
            color: "#ffffff",
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
            backgroundColor: "#ffffff",
            color: "#1e3a5f",
            padding: "12px 0",
            fontSize: 16,
          }}
          data-testid="button-build-workspace"
        >
          <Sparkles className="w-4 h-4" />
          Build my workspace
        </button>
      </div>
      <p className="text-sm mt-3 text-center" style={{ color: "rgba(255,255,255,0.6)" }} data-testid="text-hero-trust">
        Free for 14 days. No credit card required.
      </p>
    </div>
  );
}

function FeaturesDropdown({ show }: { show: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        width: 860,
        backgroundColor: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)",
        border: "1px solid #e2e8f0",
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        transition: "opacity 0.2s ease",
        zIndex: 1001,
        overflow: "hidden",
      }}
      data-testid="dropdown-features"
    >
      <div className="flex">
        <div
          style={{
            width: 300,
            backgroundColor: "#1e3a5f",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ borderRadius: 8, padding: 20, backgroundColor: "rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-3">
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="6" fill="rgba(255,255,255,0.15)" />
                <path d="M8 10l4 12 4-8 4 8 4-12" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span style={{ color: "#ffffff", fontSize: 12, fontWeight: 600 }}>Signalum Workspace</span>
            </div>
            <div className="flex gap-2 mb-2">
              <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)" }} />
              <div style={{ flex: 2, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)" }} />
            </div>
            <div className="flex gap-2 mb-2">
              <div style={{ flex: 2, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)" }} />
              <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)" }} />
            </div>
            <div className="flex gap-2 mb-3">
              <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)" }} />
              <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)" }} />
            </div>
            <div className="flex gap-1.5">
              {["Competitors", "Trends", "Dates"].map((l) => (
                <span key={l} style={{ fontSize: 8, color: "rgba(255,255,255,0.7)", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 6px" }}>{l}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 p-6">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>For Competitors</p>
              {FEATURES_COL1.map((f) => (
                <div key={f.name} className="mb-3" data-testid={`dropdown-feature-${f.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#1e3a5f" }}>{f.name}</p>
                  <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{f.desc}</p>
                </div>
              ))}
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>For Everything Else</p>
              {FEATURES_COL2.map((f) => (
                <div key={f.name} className="mb-3" data-testid={`dropdown-feature-${f.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#1e3a5f" }}>{f.name}</p>
                  <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{f.desc}</p>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 12, marginTop: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>COMING SOON</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMING_SOON_FEATURES.map((f) => (
                    <span key={f} style={{ fontSize: 11, color: "#64748b", backgroundColor: "#f1f5f9", borderRadius: 4, padding: "2px 8px" }}>
                      {f}
                      <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4, fontWeight: 600 }}>Soon</span>
                    </span>
                  ))}
                </div>
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
  const [navScrolled, setNavScrolled] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openFeatures = useCallback(() => {
    if (featuresTimeoutRef.current) clearTimeout(featuresTimeoutRef.current);
    setFeaturesOpen(true);
  }, []);

  const closeFeatures = useCallback(() => {
    featuresTimeoutRef.current = setTimeout(() => setFeaturesOpen(false), 150);
  }, []);

  const s1 = useInView();
  const s2 = useInView();
  const s3 = useInView();
  const s4 = useInView();
  const s5 = useInView();
  const s6 = useInView();
  const s7 = useInView();
  const s8 = useInView();
  const s9 = useInView();
  const s10 = useInView();

  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif", scrollBehavior: "smooth" }}>
      <style>{`
        @keyframes scrollTags {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        html { scroll-behavior: smooth; }

        .fade-section {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .fade-section.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .fade-child {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .fade-section.visible .fade-child { opacity: 1; transform: translateY(0); }
        .fade-section.visible .fade-child:nth-child(1) { transition-delay: 0s; }
        .fade-section.visible .fade-child:nth-child(2) { transition-delay: 0.1s; }
        .fade-section.visible .fade-child:nth-child(3) { transition-delay: 0.2s; }
        .fade-section.visible .fade-child:nth-child(4) { transition-delay: 0.3s; }
        .fade-section.visible .fade-child:nth-child(5) { transition-delay: 0.4s; }
        .fade-section.visible .fade-child:nth-child(6) { transition-delay: 0.5s; }
        .fade-section.visible .fade-child:nth-child(7) { transition-delay: 0.6s; }
        .fade-section.visible .fade-child:nth-child(8) { transition-delay: 0.7s; }
        .fade-section.visible .fade-child:nth-child(9) { transition-delay: 0.8s; }

        .feature-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06);
        }

        .hero-word {
          opacity: 0;
          display: inline-block;
          animation: heroWordIn 0.4s ease-out forwards;
        }
        @keyframes heroWordIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tag-strip:hover .tag-scroll {
          animation-play-state: paused;
        }
      `}</style>

      {/* NAVBAR */}
      <nav
        className="fixed top-0 left-0 w-full flex items-center justify-between"
        style={{
          backgroundColor: navScrolled ? "rgba(255,255,255,0.95)" : "#ffffff",
          backdropFilter: navScrolled ? "blur(12px)" : "none",
          borderBottom: navScrolled ? "1px solid rgba(0,0,0,0.08)" : "1px solid #e2e8f0",
          boxShadow: navScrolled ? "0 1px 8px rgba(0,0,0,0.06)" : "none",
          padding: "16px 24px",
          zIndex: 1000,
          transition: "all 0.3s ease",
        }}
        data-testid="navbar-landing"
      >
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" data-testid="icon-navbar-logo">
            <rect width="32" height="32" rx="8" fill="#1e3a5f" />
            <path d="M8 10l4 12 4-8 4 8 4-12" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="text-lg font-bold" style={{ color: "#1e3a5f" }} data-testid="text-navbar-brand">
            Signalum
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8" style={{ position: "relative" }}>
          <a
            href="#how-it-works"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "#64748b", fontSize: 15 }}
            data-testid="link-nav-how"
          >
            How it works
          </a>
          <div
            style={{ position: "relative" }}
            onMouseEnter={openFeatures}
            onMouseLeave={closeFeatures}
          >
            <span
              className="font-medium cursor-pointer transition-opacity hover:opacity-70"
              style={{ color: "#64748b", fontSize: 15 }}
              data-testid="link-nav-features"
            >
              Features
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ display: "inline-block", marginLeft: 4, verticalAlign: "middle" }}>
                <path d="M2 4l3 3 3-3" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <FeaturesDropdown show={featuresOpen} />
          </div>
          <a
            href="#pricing"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "#64748b", fontSize: 15 }}
            data-testid="link-nav-pricing"
          >
            Pricing
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
        </div>
      </nav>

      {/* SECTION 2 - HERO */}
      <section
        className="w-full"
        style={{
          backgroundColor: "#1e3a5f",
          padding: "140px 40px 80px 40px",
          marginTop: 68,
          background: "linear-gradient(180deg, #1e3a5f 0%, #162d4a 100%)",
        }}
      >
        <div className="max-w-[900px] mx-auto text-center">
          <h1
            style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.15, marginBottom: 24, fontFamily: "'Playfair Display', serif" }}
            data-testid="text-hero-headline"
          >
            {"Intelligence without the overwhelm.".split(" ").map((word, i) => (
              <span
                key={i}
                className="hero-word"
                style={{ animationDelay: `${i * 0.08}s`, color: "#ffffff", marginRight: "0.3em" }}
              >
                {word}
              </span>
            ))}
          </h1>

          <p
            className="max-w-[680px] mx-auto mb-10 hero-word"
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 19,
              lineHeight: 1.75,
              animationDelay: "0.5s",
            }}
            data-testid="text-hero-subheadline"
          >
            Every day you get hit with competitor moves, regulation changes, customer conversations, and industry noise. Signalum turns all of it into one clear brief that tells you what changed and what to do about it.
          </p>

          <div className="flex items-center justify-center gap-4 mb-0">
            <Link href="/signup">
              <button
                className="px-8 py-3 rounded-lg font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#ffffff", color: "#1e3a5f", fontSize: 16 }}
                data-testid="button-get-started"
              >
                Get Started Free
              </button>
            </Link>
            <Link href="/signin">
              <button
                className="px-8 py-3 rounded-lg font-semibold border-2 transition-opacity hover:opacity-80"
                style={{ color: "#ffffff", borderColor: "rgba(255,255,255,0.4)", backgroundColor: "transparent", fontSize: 16 }}
                data-testid="button-sign-in-hero"
              >
                Sign In
              </button>
            </Link>
          </div>

          <HeroTrackingInput />
        </div>
      </section>

      {/* SECTION 3 - STATS BAR */}
      <section className="w-full" style={{ backgroundColor: "#ffffff", padding: "0" }}>
        <div
          ref={s1.ref}
          className={`fade-section ${s1.visible ? "visible" : ""}`}
          style={{ maxWidth: 860, margin: "0 auto", padding: "40px 0" }}
        >
          <div
            className="max-w-[860px] mx-auto rounded-lg"
            style={{ backgroundColor: "#f8fafc", padding: "32px 0" }}
            data-testid="stats-bar"
          >
            <div className="hidden md:flex items-stretch justify-center" style={{ gap: 0 }}>
              <div className="flex-1 flex items-center justify-center text-center px-4 fade-child">
                <div>
                  <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }} data-testid="stat-setup">
                    <CountUp end={3} suffix=" min" />
                  </div>
                  <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>Average setup time</div>
                </div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0" }} />
              <div className="flex-1 flex items-center justify-center text-center px-4 fade-child">
                <div>
                  <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }} data-testid="stat-topics">
                    <CountUp end={11} />
                  </div>
                  <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>Topic types supported</div>
                </div>
              </div>
              <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0" }} />
              <div className="flex-1 flex items-center justify-center text-center px-4 fade-child">
                <div>
                  <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }} data-testid="stat-brief">
                    <CountUp end={7} suffix="am" />
                  </div>
                  <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>Daily brief delivered</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-6 md:hidden">
              <div className="text-center">
                <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }}>
                  <CountUp end={3} suffix=" min" />
                </div>
                <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>Average setup time</div>
              </div>
              <div className="text-center">
                <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }}>
                  <CountUp end={11} />
                </div>
                <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>Topic types supported</div>
              </div>
              <div className="text-center">
                <div style={{ color: "#1e3a5f", fontSize: 28, fontWeight: 700 }}>
                  <CountUp end={7} suffix="am" />
                </div>
                <div className="mt-1" style={{ color: "#64748b", fontSize: 14 }}>Daily brief delivered</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 - PROBLEM SECTION */}
      <section
        ref={s2.ref}
        className={`w-full fade-section ${s2.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#f8fafc", padding: "80px 40px" }}
      >
        <div className="mx-auto flex flex-col md:flex-row items-start gap-10" style={{ maxWidth: 1040 }}>
          <div className="w-full md:w-[55%] fade-child">
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
              Signalum does not just store what you capture. It reads it, connects it to everything else you track, and turns it into a clear picture of what is actually happening in your world.
            </p>
          </div>

          <div className="w-full md:w-[45%] fade-child">
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
                    <span className="text-xs font-semibold" style={{ color: "#f87171" }}>Without Signalum</span>
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
                    <span className="text-xs font-semibold" style={{ color: "#1e3a5f" }}>With Signalum</span>
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

      {/* SECTION 5 - TOPIC PILL STRIP */}
      <section
        className="w-full overflow-hidden tag-strip"
        style={{ backgroundColor: "#f8fafc", padding: "40px 0" }}
      >
        <div
          className="flex whitespace-nowrap tag-scroll"
          style={{
            animation: "scrollTags 30s linear infinite",
            width: "fit-content",
          }}
        >
          {[...SCROLLING_TAGS, ...SCROLLING_TAGS, ...SCROLLING_TAGS].map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-block text-sm font-medium rounded-full px-4 py-2 mx-1.5 flex-shrink-0"
              style={{
                backgroundColor: "#ffffff",
                color: "#1e3a5f",
              }}
              data-testid={`pill-tag-${i}`}
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* SECTION 6 - HOW IT WORKS */}
      <section
        id="how-it-works"
        ref={s3.ref}
        className={`w-full fade-section ${s3.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#ffffff", padding: "80px 40px", scrollMarginTop: 80 }}
      >
        <div className="max-w-[1040px] mx-auto">
          <div className="text-center mb-16 fade-child">
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
              From scattered noise to one clear answer.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 md:gap-0 items-start">
            <div className="text-center px-4 fade-child">
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

            <div className="text-center px-4 fade-child">
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
                Signalum reads what you captured, figures out where it belongs, and files it automatically. You never have to think about organisation again.
              </p>
            </div>

            <div className="hidden md:flex items-center justify-center pt-8" style={{ color: "#cbd5e1" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            <div className="text-center px-4 fade-child">
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

      {/* SECTION 7 - FEATURE CARDS */}
      <section
        id="what-you-can-track"
        ref={s4.ref}
        className={`w-full fade-section ${s4.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#f8fafc", padding: "80px 40px", scrollMarginTop: 80 }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-16 fade-child">
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
              Whatever you need to stay on top of, Signalum has got it
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURE_CARDS.map((card, idx) => (
              <div
                key={card.title}
                className="rounded-lg feature-card fade-child"
                style={{
                  backgroundColor: card.highlighted ? "#1e3a5f" : "#ffffff",
                  border: card.goldBorder ? "2px solid #d4a843" : card.highlighted ? "none" : "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 24,
                }}
                data-testid={`card-feature-${idx}`}
              >
                <h3
                  className="mb-2"
                  style={{
                    color: card.highlighted ? "#ffffff" : "#1e3a5f",
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    color: card.highlighted ? "rgba(255,255,255,0.8)" : "#64748b",
                    fontSize: 15,
                    lineHeight: 1.6,
                  }}
                >
                  {card.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 8 - TESTIMONIALS */}
      <section
        ref={s5.ref}
        className={`w-full fade-section ${s5.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#ffffff", padding: "60px 40px" }}
      >
        <div className="mx-auto" style={{ maxWidth: 1040 }}>
          <p
            className="text-center font-semibold uppercase mb-8 fade-child"
            style={{ color: "#64748b", fontSize: 12, letterSpacing: "0.15em" }}
            data-testid="text-social-proof-label"
          >
            Trusted by professionals who need to stay ahead
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-testid="social-proof-grid">
            <div
              className="flex flex-col fade-child"
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
              className="flex flex-col fade-child"
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
              className="flex flex-col fade-child"
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: 24,
              }}
              data-testid="card-testimonial-3"
            >
              <p className="italic flex-1" style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                "I track six different topics across two industries. Signalum files everything and I never miss a thing."
              </p>
              <div>
                <div style={{ width: 32, height: 2, backgroundColor: "#1e3a5f", marginTop: 16, marginBottom: 12 }} />
                <p className="text-xs" style={{ color: "#64748b" }}>Market Analyst, financial services</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 9 - TRUST SECTION */}
      <section
        ref={s6.ref}
        className={`w-full fade-section ${s6.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#ffffff", padding: "80px 40px" }}
      >
        <div className="max-w-[1040px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center fade-child" data-testid="trust-data">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
              >
                <Shield size={24} color="#1e3a5f" />
              </div>
              <h3 style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                Your data never trains our models
              </h3>
              <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                Everything you capture stays in your workspace.
              </p>
            </div>

            <div className="text-center fade-child" data-testid="trust-isolation">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
              >
                <Lock size={24} color="#1e3a5f" />
              </div>
              <h3 style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                Isolated by design
              </h3>
              <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                Your workspace is completely isolated from every other user. Row-level security at the database level.
              </p>
            </div>

            <div className="text-center fade-child" data-testid="trust-sensitive">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "rgba(30,58,95,0.08)" }}
              >
                <Eye size={24} color="#1e3a5f" />
              </div>
              <h3 style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                Built for sensitive work
              </h3>
              <p style={{ color: "#64748b", fontSize: 15, lineHeight: 1.6 }}>
                Designed for teams handling competitive, regulatory, and strategic intelligence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 10 - COMING SOON (Ask Signalum) */}
      <section
        id="coming-soon"
        ref={s7.ref}
        className={`w-full fade-section ${s7.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#ffffff", padding: "60px 40px", scrollMarginTop: 80 }}
      >
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
              Ask Signalum anything about your tracked topics
            </h3>

            <p
              className="mb-6"
              style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }}
              data-testid="text-coming-soon-description"
            >
              Soon you will be able to ask Signalum questions in plain English and get instant answers from everything it has captured for you. What has changed with a competitor this month? What are the biggest themes across your industry right now? What did I capture about pricing changes last week? Signalum will search its own knowledge of your workspace and answer in seconds.
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

      {/* SECTION 11 - FINAL CTA */}
      <section
        ref={s8.ref}
        className={`w-full fade-section ${s8.visible ? "visible" : ""}`}
        style={{ backgroundColor: "#ffffff", padding: "96px 40px" }}
      >
        <div className="max-w-[860px] mx-auto text-center">
          <h2
            className="mb-4 fade-child"
            style={{ color: "#1e3a5f", fontSize: 42, fontWeight: 700 }}
            data-testid="text-cta-headline"
          >
            Start your day already knowing what matters.
          </h2>
          <p
            className="mb-10 fade-child"
            style={{ color: "#64748b", fontSize: 17, lineHeight: 1.75 }}
            data-testid="text-cta-subtext"
          >
            Three minutes to set up. One brief every morning. No more being caught off guard.
          </p>
          <div className="fade-child">
            <Link href="/signup">
              <button
                className="px-10 py-4 rounded-lg font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#1e3a5f", color: "#ffffff", fontSize: 16 }}
                data-testid="button-cta-get-started"
              >
                Get Started Free
              </button>
            </Link>
          </div>
          <p className="text-sm mt-4 fade-child" style={{ color: "#64748b" }}>
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
              Signalum
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
            &copy; 2026 Signalum
          </p>
        </div>
      </footer>
    </div>
  );
}
