import { Shield, Mic, Brain, Mail, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <section className="w-full px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6"
            style={{ color: "#1e3a5f" }}
            data-testid="text-hero-headline"
          >
            Your AI-powered intelligence workspace
          </h1>
          <p
            className="text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10"
            style={{ color: "#64748b" }}
            data-testid="text-hero-subheadline"
          >
            Capture anything — voice, text, URLs, documents. AI routes it to the
            right place and delivers a daily briefing every morning.
          </p>
          <div className="flex items-center justify-center gap-4 mb-16">
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

          <div
            className="max-w-3xl mx-auto rounded-xl border overflow-hidden"
            style={{
              borderColor: "#e2e8f0",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b"
              style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#fca5a5" }} />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#fcd34d" }} />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#86efac" }} />
              <span className="ml-2 text-xs" style={{ color: "#94a3b8" }}>
                Intel App — Daily Brief
              </span>
            </div>
            <div className="p-6 md:p-8" style={{ backgroundColor: "#ffffff" }}>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: "#1e3a5f" }}
                >
                  <Shield className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold" style={{ color: "#1e3a5f" }}>
                  Morning Intelligence Brief
                </span>
                <span className="text-xs ml-auto" style={{ color: "#94a3b8" }}>
                  March 5, 2026
                </span>
              </div>

              <div className="space-y-4 text-left">
                <div>
                  <h4 className="text-sm font-semibold mb-1" style={{ color: "#1e3a5f" }}>
                    Executive Summary
                  </h4>
                  <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
                    Significant regulatory movement in the EU digital identity space with
                    eIDAS 2.0 implementation timelines confirmed. Notable M&A activity among
                    identity verification providers — Thales expanding its biometric portfolio.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    className="rounded-lg p-3 border"
                    style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                  >
                    <span className="text-xs font-semibold" style={{ color: "#1e3a5f" }}>
                      Competitors
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {["iProov", "Thales", "Idemia", "Onfido"].map((name) => (
                        <span
                          key={name}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "#e2e8f0", color: "#475569" }}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-3 border"
                    style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
                  >
                    <span className="text-xs font-semibold" style={{ color: "#1e3a5f" }}>
                      Regulations
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {["eIDAS 2.0", "UK DIATF", "NIST 800-63"].map((name) => (
                        <span
                          key={name}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "#e2e8f0", color: "#475569" }}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-6 py-20" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "#1e3a5f" }}
              >
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e3a5f" }}
                data-testid="text-feature-capture"
              >
                Capture anything
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                Voice notes, text snippets, URLs, and documents all go to one
                place. No more scattered notes across apps and tabs.
              </p>
            </div>
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "#1e3a5f" }}
              >
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e3a5f" }}
                data-testid="text-feature-routing"
              >
                AI routes everything
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                AI reads your input and finds exactly where it belongs in your
                workspace. Every capture is automatically categorised and linked.
              </p>
            </div>
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: "#1e3a5f" }}
              >
                <Mail className="w-6 h-6 text-white" />
              </div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "#1e3a5f" }}
                data-testid="text-feature-brief"
              >
                Briefed every morning
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                A daily AI-generated narrative summarises what changed across
                your tracked topics. Start every day fully informed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-6 py-8">
        <p
          className="text-center text-xs tracking-widest uppercase"
          style={{ color: "#94a3b8" }}
          data-testid="text-social-proof"
        >
          Built for intelligence professionals who need to stay ahead
        </p>
      </section>

      <footer
        className="w-full px-6 py-6 border-t flex items-center justify-between"
        style={{ borderColor: "#e2e8f0" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ backgroundColor: "#1e3a5f" }}
          >
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#1e3a5f" }}>
            Intel App
          </span>
        </div>
        <Link href="/signin">
          <span
            className="text-sm font-medium flex items-center gap-1 hover:underline underline-offset-4 cursor-pointer"
            style={{ color: "#1e3a5f" }}
            data-testid="link-footer-signin"
          >
            Sign In <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      </footer>
    </div>
  );
}
