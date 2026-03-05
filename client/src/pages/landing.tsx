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
    title: "Competitors",
    text: "Rival raised $40M Series B. Updated their enterprise pricing page. Added a new compliance module.",
  },
  {
    title: "Regulations & Law",
    text: "New guidance issued on data localisation requirements. Compliance deadline confirmed for Q3.",
  },
  {
    title: "Industry News",
    text: "Three major outlets covered shifts in your product category this week. Sentiment is cautiously positive.",
  },
  {
    title: "Websites & Pricing",
    text: "Competitor's pricing page changed overnight. New tier added. Trial CTA removed from homepage.",
  },
  {
    title: "Policy & Government",
    text: "Parliamentary committee published recommendations affecting your sector. Second reading scheduled.",
  },
];

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
      <section className="w-full" style={{ backgroundColor: "#ffffff", padding: "120px 24px" }}>
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
            Every day you hear things, read things, and notice things that matter — and most of it disappears. Intel App captures everything, routes it automatically, and delivers a daily briefing every morning.
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
      <section className="w-full px-6 py-24" style={{ backgroundColor: "#ffffff" }}>
        <div className="max-w-[900px] mx-auto">
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
            {/* Column 1 — Capture */}
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
                Drop in a voice note from your commute, paste a URL, upload a document, or type a quick note. No formatting required.
              </p>
            </div>

            {/* Arrow 1 */}
            <div className="hidden md:flex items-center justify-center pt-8" style={{ color: "#cbd5e1" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            {/* Column 2 — AI Routes It */}
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

            {/* Arrow 2 */}
            <div className="hidden md:flex items-center justify-center pt-8" style={{ color: "#cbd5e1" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>

            {/* Column 3 — Daily Brief */}
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
      <section className="w-full px-6 py-24" style={{ backgroundColor: "#f8fafc" }}>
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
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ color: "#1e3a5f" }}
              data-testid="text-track-headline"
            >
              If it matters to your work, Intel App tracks it
            </h2>
            <p
              className="text-base max-w-[640px] mx-auto"
              style={{ color: "#64748b" }}
              data-testid="text-track-subheadline"
            >
              You define what matters. Our AI agents monitor it, capture it, and surface it — so nothing slips through.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TRACK_CARDS.map((card, idx) => {
              const icons = [
                <svg key="c" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
                <svg key="r" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
                <svg key="n" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>,
                <svg key="w" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
                <svg key="p" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>,
              ];
              return (
                <div
                  key={card.title}
                  className="rounded-xl border p-6"
                  style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}
                  data-testid={`card-track-${card.title.toLowerCase().replace(/[^a-z]/g, "-")}`}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(30,58,95,0.08)" }}>
                    {icons[idx]}
                  </div>
                  <h3 className="text-base font-semibold mb-2" style={{ color: "#1e3a5f" }}>
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                    {card.text}
                  </p>
                </div>
              );
            })}

            <div
              className="rounded-xl p-6"
              style={{ backgroundColor: "#1e3a5f" }}
              data-testid="card-track-anything"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </div>
              <h3 className="text-base font-semibold mb-2 text-white">
                Anything You Define
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
                You decide what matters. Type it in plain English and our AI builds your tracking workspace automatically.
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
            Join professionals who use Intel App to stay ahead of their market, their competition, and their industry — every single day.
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
              Intel App
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
            &copy; 2026 Intel App
          </p>
        </div>
      </footer>
    </div>
  );
}
