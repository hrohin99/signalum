import { Link } from "wouter";

const SCROLLING_TAGS = [
  "Competitors", "Industry News", "Regulations", "Procurement Notices",
  "Funding Rounds", "Policy Changes", "Websites", "Court Rulings",
  "Technology Trends", "Market Signals", "Patent Filings", "Company Announcements",
  "Standards Bodies", "Legislative Updates", "Analyst Reports", "Press Releases",
  "Pricing Changes", "Partnership Deals",
];

const TRACK_CARDS = [
  {
    emoji: "🏢",
    title: "Competitors",
    text: "Rival raised $40M Series B. Updated enterprise pricing and added a new compliance module this week.",
  },
  {
    emoji: "⚖️",
    title: "Regulations & Law",
    text: "New guidance issued on data localisation requirements. Compliance deadline confirmed for Q3 2026.",
  },
  {
    emoji: "📰",
    title: "Industry News",
    text: "Three major outlets covered shifts in your product category this week. Sentiment is cautiously positive.",
  },
  {
    emoji: "🌐",
    title: "Websites & Pricing",
    text: "Competitor pricing page changed overnight. New enterprise tier added. Trial CTA removed from homepage.",
  },
  {
    emoji: "🏛️",
    title: "Policy & Government",
    text: "Parliamentary committee published recommendations affecting your sector. Second reading scheduled for April.",
  },
];

function ProductMockup() {
  const categories = [
    { label: "Competitors", count: 3, active: true },
    { label: "Regulations", count: 2, active: false },
    { label: "Industry News", count: 4, active: false },
  ];

  const intelItems = [
    { date: "Mar 4, 2026", text: "No on-premises option confirmed in vendor call." },
    { date: "Mar 4, 2026", text: "Cloud-only architecture limits air-gapped deployments." },
  ];

  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: 860,
        marginTop: 48,
        marginBottom: 48,
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        overflow: "hidden",
        border: "1px solid #e2e8f0",
      }}
      data-testid="mockup-product-frame"
    >
      <div
        className="flex items-center gap-2 px-4"
        style={{ backgroundColor: "#f1f5f9", height: 36, borderBottom: "1px solid #e2e8f0" }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#f59e0b", display: "inline-block" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#22c55e", display: "inline-block" }} />
      </div>

      <div className="flex" style={{ minHeight: 320 }}>
        <div
          style={{
            width: 280,
            minWidth: 280,
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

          {categories.map((cat) => (
            <div
              key={cat.label}
              className="flex items-center justify-between px-5 py-2.5 text-sm"
              style={{
                color: "#1e3a5f",
                backgroundColor: cat.active ? "#eef2f7" : "transparent",
                borderLeft: cat.active ? "3px solid #1e3a5f" : "3px solid transparent",
                fontWeight: cat.active ? 600 : 400,
              }}
            >
              <span>{cat.label}</span>
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: cat.active ? "#1e3a5f" : "#e2e8f0",
                  color: cat.active ? "#ffffff" : "#64748b",
                }}
              >
                {cat.count}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1 p-6" style={{ backgroundColor: "#ffffff" }}>
          <div className="mb-1">
            <span className="text-xl font-bold" style={{ color: "#1e3a5f" }}>iProov</span>
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
            <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
              iProov confirmed they do not offer on-premises deployment, positioning them exclusively as a cloud-based provider. This represents a notable capability gap for regulated sectors requiring data sovereignty.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {intelItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: "#f8fafc", border: "1px solid #f1f5f9" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-xs flex-shrink-0" style={{ color: "#94a3b8" }}>{item.date}</span>
                <span className="text-xs flex-1" style={{ color: "#334155" }}>{item.text}</span>
                <span
                  className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}
                >
                  Confirmed
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes scrollTags {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* SECTION 1 — HERO */}
      <section className="w-full" style={{ backgroundColor: "#ffffff", padding: "120px 24px 0 24px" }}>
        <div className="max-w-[720px] mx-auto text-center">
          <div
            className="inline-block rounded-full px-4 py-1.5 text-xs font-medium text-white mb-8"
            style={{ backgroundColor: "#1e3a5f" }}
            data-testid="badge-hero-pill"
          >
            AI-Powered Intelligence Workspace
          </div>

          <h1
            className="text-4xl md:text-5xl lg:text-[56px] font-bold tracking-tight leading-tight mb-6"
            style={{ color: "#1e3a5f" }}
            data-testid="text-hero-headline"
          >
            Stop losing the intelligence you already have
          </h1>

          <p
            className="leading-relaxed max-w-[640px] mx-auto mb-10"
            style={{ color: "#64748b", fontSize: "20px" }}
            data-testid="text-hero-subheadline"
          >
            Every day you hear things, read things, and notice things that matter — and most of it disappears. Watchloom captures everything, routes it automatically, and delivers a daily briefing every morning.
          </p>

          <div className="flex items-center justify-center gap-4 mb-6">
            <Link href="/signup">
              <button
                className="px-8 py-3 rounded-lg text-base font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#1e3a5f" }}
                data-testid="button-get-started"
              >
                Get Started Free
              </button>
            </Link>
            <Link href="/signin">
              <button
                className="px-8 py-3 rounded-lg text-base font-semibold border-2 transition-opacity hover:opacity-80"
                style={{ color: "#1e3a5f", borderColor: "#1e3a5f", backgroundColor: "white" }}
                data-testid="button-sign-in-hero"
              >
                Sign In
              </button>
            </Link>
          </div>

          <p className="text-sm" style={{ color: "#94a3b8" }} data-testid="text-hero-context">
            Works with competitors, regulations, news, websites, laws, procurement notices — or anything you need to track
          </p>
        </div>

        <div className="max-w-[860px] mx-auto px-4">
          <ProductMockup />
        </div>
      </section>

      {/* SECTION 2 — SCROLLING TAG STRIP */}
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
                border: "1px solid #e2e8f0",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* SECTION 3 — HOW IT WORKS */}
      <section className="w-full px-6" style={{ backgroundColor: "#ffffff", padding: "80px 24px" }}>
        <div className="max-w-[960px] mx-auto">
          <div className="text-center mb-16">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "#64748b" }}
              data-testid="text-how-label"
            >
              How it works
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold"
              style={{ color: "#1e3a5f" }}
              data-testid="text-how-headline"
            >
              Three steps from chaos to clarity
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
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e3a5f" }}
                data-testid="text-step-capture"
              >
                Capture anything
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                Drop in a voice note, paste a URL, upload a document, or type a quick note. No formatting, no filing, no thinking required.
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
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e3a5f" }}
                data-testid="text-step-route"
              >
                AI finds where it belongs
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                Our AI reads your input, matches it to the right topic in your workspace, and files it automatically — with a one-line explanation of why.
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
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e3a5f" }}
                data-testid="text-step-brief"
              >
                Briefed every morning
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                At 7am, a narrative intelligence briefing lands in your workspace — summarising everything that changed across your tracked topics overnight.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 — TRACK ANYTHING SHOWCASE */}
      <section className="w-full" style={{ backgroundColor: "#f8fafc", padding: "80px 24px" }}>
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-16">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "#64748b" }}
              data-testid="text-track-label"
            >
              What can you track?
            </p>
            <h2
              className="text-3xl md:text-4xl font-bold"
              style={{ color: "#1e3a5f" }}
              data-testid="text-track-headline"
            >
              If it matters to your work, Watchloom tracks it
            </h2>
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
                <h3 className="text-base font-semibold mb-2" style={{ color: "#1e3a5f" }}>
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
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
              <h3 className="text-base font-semibold mb-2 text-white">
                Anything You Define
              </h3>
              <p className="text-sm leading-relaxed text-white">
                You decide what matters. Describe it in plain English and our AI builds your tracking workspace automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 — FINAL CTA */}
      <section className="w-full px-6 py-24" style={{ backgroundColor: "#ffffff" }}>
        <div className="max-w-[640px] mx-auto text-center">
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: "#1e3a5f" }}
            data-testid="text-cta-headline"
          >
            Be the most informed person in the room
          </h2>
          <p
            className="text-base mb-10"
            style={{ color: "#64748b" }}
            data-testid="text-cta-subtext"
          >
            Join professionals who use Watchloom to stay ahead of their market, their competition, and their industry — every single day.
          </p>
          <Link href="/signup">
            <button
              className="px-10 py-4 rounded-lg text-base font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#1e3a5f" }}
              data-testid="button-cta-get-started"
            >
              Get Started Free
            </button>
          </Link>
          <p className="text-sm mt-4" style={{ color: "#94a3b8" }}>
            Free to start. No credit card required.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="w-full px-6 py-8"
        style={{ backgroundColor: "#f8fafc" }}
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
