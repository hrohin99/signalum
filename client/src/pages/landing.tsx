import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";

const TABS = [
  "Competitive scoring",
  "Strategic Pulse",
  "Market Signals",
  "Live workspace",
];

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [ctaEmail, setCtaEmail] = useState("");
  const [ctaSubmitted, setCtaSubmitted] = useState(false);
  const revealRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    revealRefs.current.forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const addReveal = (el: HTMLElement | null, i: number) => {
    revealRefs.current[i] = el;
  };

  const handleCtaSubmit = () => {
    if (ctaEmail && ctaEmail.includes("@")) {
      setCtaSubmitted(true);
      setCtaEmail("");
    }
  };

  return (
    <div>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy: #0f1f3d;
          --navy-mid: #1a3260;
          --navy-light: #243d70;
          --accent: #4f7fff;
          --accent-glow: rgba(79,127,255,0.2);
          --gold: #f0b429;
          --white: #ffffff;
          --off-white: #f5f6f8;
          --text-muted: #8a9bbf;
          --text-body: #c8d4e8;
          --card-bg: rgba(255,255,255,0.04);
          --card-border: rgba(255,255,255,0.08);
          --serif: 'Plus Jakarta Sans', sans-serif;
          --sans: 'Plus Jakarta Sans', sans-serif;
        }

        html { scroll-behavior: smooth; }

        body {
          font-family: var(--sans);
          background: var(--navy);
          color: var(--white);
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .lp-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          padding: 20px 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(15,31,61,0.85);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lp-nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--sans);
          font-weight: 500;
          font-size: 18px;
          letter-spacing: -0.3px;
          color: var(--white);
          text-decoration: none;
        }
        .lp-nav-logo-icon {
          width: 34px; height: 34px;
          background: var(--accent);
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
        }
        .lp-nav-logo-icon svg { width: 18px; height: 18px; }
        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 36px;
          list-style: none;
        }
        .lp-nav-links a {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 14px;
          font-weight: 400;
          transition: color 0.2s;
        }
        .lp-nav-links a:hover { color: var(--white); }
        .lp-nav-cta {
          background: var(--white);
          color: var(--navy) !important;
          padding: 9px 20px;
          border-radius: 8px;
          font-weight: 500 !important;
          font-size: 14px !important;
          transition: opacity 0.2s !important;
        }
        .lp-nav-cta:hover { opacity: 0.9 !important; }

        .lp-hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 120px 48px 80px;
          position: relative;
          overflow: hidden;
          text-align: center;
        }
        .lp-hero-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .lp-hero-bg::before {
          content: '';
          position: absolute;
          top: -20%;
          left: 50%;
          transform: translateX(-50%);
          width: 900px;
          height: 700px;
          background: radial-gradient(ellipse at center, rgba(79,127,255,0.15) 0%, transparent 70%);
        }
        .lp-hero-bg::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 300px;
          background: linear-gradient(to bottom, transparent, var(--navy));
        }
        .lp-hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(79,127,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(79,127,255,0.06) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
        }
        .lp-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(79,127,255,0.12);
          border: 1px solid rgba(79,127,255,0.3);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 13px;
          color: #7fa8ff;
          margin-bottom: 32px;
          animation: lp-fadeUp 0.6s ease forwards;
          opacity: 0;
          transform: translateY(16px);
          position: relative;
          z-index: 1;
        }
        .lp-hero-badge-dot {
          width: 6px; height: 6px;
          background: #4f7fff;
          border-radius: 50%;
          animation: lp-pulse 2s ease infinite;
        }
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        .lp-hero h1 {
          font-family: var(--sans);
          font-size: clamp(44px, 6.5vw, 80px);
          font-weight: 700;
          line-height: 1.06;
          letter-spacing: -2px;
          max-width: 820px;
          margin: 0 auto 24px;
          animation: lp-fadeUp 0.7s 0.1s ease forwards;
          opacity: 0;
          transform: translateY(20px);
          position: relative;
          z-index: 1;
        }
        .lp-hero h1 em {
          font-style: normal;
          color: #7fa8ff;
          font-weight: 600;
        }
        .lp-hero-sub {
          font-size: 18px;
          line-height: 1.65;
          color: var(--text-body);
          max-width: 520px;
          margin: 0 auto 48px;
          font-weight: 300;
          animation: lp-fadeUp 0.7s 0.2s ease forwards;
          opacity: 0;
          transform: translateY(20px);
          position: relative;
          z-index: 1;
        }
        .lp-hero-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          justify-content: center;
          margin-bottom: 64px;
          animation: lp-fadeUp 0.7s 0.3s ease forwards;
          opacity: 0;
          transform: translateY(20px);
          position: relative;
          z-index: 1;
        }
        .lp-btn-primary {
          background: var(--white);
          color: var(--navy);
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 500;
          text-decoration: none;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 0 0 0 rgba(255,255,255,0);
          display: inline-block;
        }
        .lp-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(255,255,255,0.15);
        }
        .lp-btn-secondary {
          color: var(--text-body);
          font-size: 15px;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: color 0.2s;
        }
        .lp-btn-secondary:hover { color: var(--white); }
        .lp-btn-secondary svg { transition: transform 0.2s; }
        .lp-btn-secondary:hover svg { transform: translateX(3px); }

        .lp-ticker-wrap {
          width: 100%;
          overflow: hidden;
          animation: lp-fadeUp 0.7s 0.4s ease forwards;
          opacity: 0;
          position: relative;
          z-index: 1;
        }
        .lp-ticker-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          margin-bottom: 14px;
          text-align: center;
        }
        .lp-ticker-track {
          display: flex;
          gap: 12px;
          animation: lp-ticker 25s linear infinite;
          width: max-content;
        }
        .lp-ticker-track:hover { animation-play-state: paused; }
        .lp-ticker-item {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          color: var(--text-body);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .lp-ticker-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
        }
        .lp-ticker-dot-green { background: #34d399; }
        .lp-ticker-dot-amber { background: #f59e0b; }
        .lp-ticker-dot-red { background: #f87171; }
        @keyframes lp-ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes lp-fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        .lp-stats-bar {
          background: rgba(255,255,255,0.03);
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 28px 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
        }
        .lp-stat-item {
          flex: 1;
          text-align: center;
          padding: 0 32px;
          border-right: 1px solid rgba(255,255,255,0.06);
          max-width: 220px;
        }
        .lp-stat-item:last-child { border-right: none; }
        .lp-stat-value {
          font-family: var(--sans);
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -1px;
          color: var(--white);
          line-height: 1;
          margin-bottom: 6px;
        }
        .lp-stat-label {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 300;
        }

        .lp-section { padding: 120px 48px; max-width: 1200px; margin: 0 auto; }
        .lp-section-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--accent);
          margin-bottom: 20px;
          font-weight: 500;
        }
        .lp-problem-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: center;
        }
        .lp-problem-headline {
          font-family: var(--sans);
          font-size: clamp(32px, 3.5vw, 48px);
          line-height: 1.1;
          font-weight: 700;
          letter-spacing: -1px;
          margin-bottom: 24px;
        }
        .lp-problem-body {
          font-size: 17px;
          line-height: 1.75;
          color: var(--text-body);
          font-weight: 300;
          margin-bottom: 20px;
        }
        .lp-vs-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          overflow: hidden;
        }
        .lp-vs-header {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .lp-vs-col {
          padding: 20px 24px;
        }
        .lp-vs-col:first-child {
          border-right: 1px solid var(--card-border);
          border-bottom: 1px solid var(--card-border);
        }
        .lp-vs-col:last-child { border-bottom: 1px solid var(--card-border); }
        .lp-vs-col-label {
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .lp-vs-col-label-bad { color: #f87171; }
        .lp-vs-col-label-good { color: #34d399; }
        .lp-vs-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .lp-vs-cell {
          padding: 14px 24px;
          font-size: 14px;
          border-right: 1px solid var(--card-border);
          border-bottom: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--text-body);
          line-height: 1.4;
        }
        .lp-vs-cell:last-child { border-right: none; }
        .lp-vs-row:last-child .lp-vs-cell { border-bottom: none; }
        .lp-vs-cell-good { color: var(--white); }

        .lp-showcase-section {
          padding: 80px 0;
          overflow: hidden;
        }
        .lp-showcase-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 48px;
        }
        .lp-showcase-header {
          text-align: center;
          margin-bottom: 64px;
        }
        .lp-showcase-headline {
          font-family: var(--sans);
          font-size: clamp(32px, 3.5vw, 48px);
          line-height: 1.1;
          font-weight: 700;
          letter-spacing: -1px;
          margin-bottom: 16px;
        }
        .lp-showcase-sub {
          font-size: 17px;
          color: var(--text-body);
          font-weight: 300;
          max-width: 480px;
          margin: 0 auto;
          line-height: 1.65;
        }
        .lp-feature-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 48px;
          overflow-x: auto;
        }
        .lp-feature-tab {
          padding: 14px 24px;
          font-size: 14px;
          color: var(--text-muted);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          white-space: nowrap;
          transition: color 0.2s;
          font-weight: 400;
          background: none;
          border-top: none;
          border-left: none;
          border-right: none;
          font-family: var(--sans);
        }
        .lp-feature-tab.lp-tab-active {
          color: var(--white);
          border-bottom-color: var(--accent);
        }
        .lp-feature-tab:hover { color: var(--text-body); }
        .lp-feature-grid {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 56px;
          align-items: center;
        }
        .lp-feature-tag {
          display: inline-block;
          background: rgba(79,127,255,0.12);
          border: 1px solid rgba(79,127,255,0.25);
          border-radius: 100px;
          padding: 4px 12px;
          font-size: 12px;
          color: #7fa8ff;
          margin-bottom: 20px;
          font-weight: 500;
        }
        .lp-feature-title {
          font-family: var(--sans);
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.8px;
          line-height: 1.15;
          margin-bottom: 16px;
        }
        .lp-feature-desc {
          font-size: 16px;
          line-height: 1.75;
          color: var(--text-body);
          font-weight: 300;
          margin-bottom: 28px;
        }
        .lp-feature-points {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .lp-feature-points li {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          font-size: 14px;
          color: var(--text-body);
          line-height: 1.5;
        }
        .lp-feature-points li::before {
          content: '';
          width: 6px;
          height: 6px;
          background: var(--accent);
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }
        .lp-screen-mockup {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 40px 80px rgba(0,0,0,0.5);
        }
        .lp-screen-mockup-bar {
          background: #1a2744;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lp-screen-dot { width: 10px; height: 10px; border-radius: 50%; }
        .lp-screen-dot-red { background: #ff5f57; }
        .lp-screen-dot-amber { background: #febc2e; }
        .lp-screen-dot-green { background: #28c840; }
        .lp-screen-url {
          flex: 1;
          background: rgba(255,255,255,0.06);
          border-radius: 5px;
          padding: 4px 10px;
          font-size: 11px;
          color: var(--text-muted);
          margin: 0 8px;
          text-align: center;
        }

        .lp-icp-section {
          padding: 120px 48px;
          background: rgba(255,255,255,0.02);
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .lp-icp-inner { max-width: 1200px; margin: 0 auto; }
        .lp-icp-header { text-align: center; margin-bottom: 64px; }
        .lp-icp-headline {
          font-family: var(--sans);
          font-size: clamp(32px, 3.5vw, 48px);
          font-weight: 700;
          letter-spacing: -1px;
          margin-bottom: 16px;
          line-height: 1.1;
        }
        .lp-icp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .lp-icp-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 40px;
          transition: border-color 0.2s, transform 0.2s;
          cursor: default;
        }
        .lp-icp-card:hover {
          border-color: rgba(79,127,255,0.3);
          transform: translateY(-2px);
        }
        .lp-icp-role {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--accent);
          font-weight: 500;
          margin-bottom: 16px;
        }
        .lp-icp-title {
          font-family: var(--sans);
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.5px;
          margin-bottom: 16px;
          line-height: 1.25;
        }
        .lp-icp-pain {
          font-size: 15px;
          color: var(--text-body);
          line-height: 1.7;
          font-weight: 300;
          margin-bottom: 28px;
          padding-bottom: 28px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .lp-icp-gains { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .lp-icp-gains li {
          font-size: 14px;
          color: var(--text-body);
          display: flex;
          align-items: flex-start;
          gap: 10px;
          line-height: 1.5;
        }
        .lp-icp-check { color: #34d399; font-size: 14px; flex-shrink: 0; margin-top: 1px; }

        .lp-how-section { padding: 120px 48px; max-width: 1200px; margin: 0 auto; }
        .lp-how-header { text-align: center; margin-bottom: 80px; }
        .lp-how-headline {
          font-family: var(--sans);
          font-size: clamp(32px, 3.5vw, 48px);
          font-weight: 700;
          letter-spacing: -1px;
          margin-bottom: 16px;
        }
        .lp-how-steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2px;
        }
        .lp-how-step {
          padding: 40px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
        }
        .lp-how-step-num {
          font-family: var(--sans);
          font-size: 56px;
          color: rgba(255,255,255,0.05);
          font-weight: 800;
          line-height: 1;
          margin-bottom: 20px;
          letter-spacing: -2px;
        }
        .lp-how-step-icon {
          width: 44px; height: 44px;
          background: rgba(79,127,255,0.1);
          border: 1px solid rgba(79,127,255,0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .lp-how-step-icon svg { width: 20px; height: 20px; color: var(--accent); }
        .lp-how-step h3 { font-size: 18px; font-weight: 500; margin-bottom: 10px; line-height: 1.3; }
        .lp-how-step p { font-size: 14px; color: var(--text-body); line-height: 1.7; font-weight: 300; }

        .lp-trust-section {
          padding: 80px 48px;
          background: rgba(255,255,255,0.02);
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .lp-trust-inner {
          max-width: 900px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 48px;
          text-align: center;
        }
        .lp-trust-item-icon {
          width: 48px; height: 48px;
          background: rgba(79,127,255,0.08);
          border: 1px solid rgba(79,127,255,0.15);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px;
        }
        .lp-trust-item h4 { font-size: 15px; font-weight: 500; margin-bottom: 8px; }
        .lp-trust-item p { font-size: 13px; color: var(--text-muted); line-height: 1.65; font-weight: 300; }

        .lp-quotes-section { padding: 100px 48px; max-width: 1200px; margin: 0 auto; }
        .lp-quotes-header {
          text-align: center;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          margin-bottom: 48px;
        }
        .lp-quotes-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
        .lp-quote-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 32px;
          transition: border-color 0.2s;
        }
        .lp-quote-card:hover { border-color: rgba(255,255,255,0.15); }
        .lp-quote-stars { color: var(--gold); font-size: 14px; margin-bottom: 16px; letter-spacing: 2px; }
        .lp-quote-text {
          font-family: var(--sans);
          font-size: 16px;
          line-height: 1.65;
          color: var(--white);
          margin-bottom: 24px;
          font-style: italic;
          font-weight: 400;
        }
        .lp-quote-divider { width: 32px; height: 2px; background: rgba(255,255,255,0.15); margin-bottom: 16px; }
        .lp-quote-role { font-size: 13px; color: var(--text-muted); font-weight: 300; }

        .lp-cta-section {
          padding: 120px 48px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .lp-cta-section::before {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 800px; height: 500px;
          background: radial-gradient(ellipse, rgba(79,127,255,0.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .lp-cta-headline {
          font-family: var(--sans);
          font-size: clamp(36px, 5vw, 68px);
          font-weight: 700;
          letter-spacing: -2px;
          line-height: 1.08;
          margin-bottom: 20px;
          position: relative;
        }
        .lp-cta-sub {
          font-size: 18px;
          color: var(--text-body);
          font-weight: 300;
          margin-bottom: 44px;
          position: relative;
        }
        .lp-cta-form {
          display: flex;
          align-items: center;
          gap: 12px;
          justify-content: center;
          position: relative;
          flex-wrap: wrap;
        }
        .lp-cta-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px;
          padding: 14px 20px;
          font-size: 15px;
          color: var(--white);
          width: 280px;
          outline: none;
          font-family: var(--sans);
          transition: border-color 0.2s;
        }
        .lp-cta-input::placeholder { color: var(--text-muted); }
        .lp-cta-input:focus { border-color: rgba(79,127,255,0.5); }
        .lp-cta-btn {
          background: var(--white);
          color: var(--navy);
          border: none;
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          font-family: var(--sans);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .lp-cta-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(255,255,255,0.15);
        }
        .lp-cta-note {
          font-size: 13px;
          color: var(--text-muted);
          margin-top: 16px;
          position: relative;
        }
        .lp-cta-note-success { color: #34d399 !important; }

        .lp-footer {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 32px 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .lp-footer-left { display: flex; align-items: center; gap: 24px; }
        .lp-footer-brand {
          font-size: 15px;
          font-weight: 500;
          color: var(--white);
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }
        .lp-footer-brand-icon {
          width: 26px; height: 26px;
          background: var(--accent);
          border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
        }
        .lp-footer-brand-icon svg { width: 13px; height: 13px; }
        .lp-footer-copy { font-size: 13px; color: var(--text-muted); }
        .lp-footer-links { display: flex; gap: 24px; list-style: none; }
        .lp-footer-links a { font-size: 13px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
        .lp-footer-links a:hover { color: var(--white); }

        .lp-reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .lp-reveal.visible {
          opacity: 1;
          transform: none;
        }
      `}</style>

      {/* NAV */}
      <nav className="lp-nav">
        <a href="#" className="lp-nav-logo">
          <div className="lp-nav-logo-icon">
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5L10 2Z" fill="white"/>
            </svg>
          </div>
          Signalum
        </a>
        <ul className="lp-nav-links">
          <li><a href="#how">How it works</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#who">Who it&apos;s for</a></li>
          <li><a href="#cta" className="lp-nav-cta">Request access</a></li>
        </ul>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-hero-grid"></div>
        </div>

        <div className="lp-hero-badge">
          <span className="lp-hero-badge-dot"></span>
          Built for product managers and marketers
        </div>

        <h1>Know before your<br /><em>next meeting.</em></h1>

        <p className="lp-hero-sub">
          Signalum tracks your competitors, market signals, and industry movements — then tells you exactly what changed and what it means for your roadmap.
        </p>

        <div className="lp-hero-actions">
          <a href="#cta" className="lp-btn-primary">Request access</a>
          <a href="#features" className="lp-btn-secondary">
            See how it works
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>

        <div className="lp-ticker-wrap">
          <p className="lp-ticker-label">Live signals tracked right now</p>
          <div style={{ overflow: "hidden", width: "100%" }}>
            <div className="lp-ticker-track">
              {[
                { color: "green", text: "Veridian raised $40M Series C — shifts focus to government" },
                { color: "amber", text: "EU AI Act compliance deadline: 3 months remaining" },
                { color: "red", text: "NexaID acquired DocuShield — expands doc verification" },
                { color: "green", text: "UK DIATF Gamma certification now mandatory for tenders" },
                { color: "amber", text: "BioPulse launches passive liveness for mobile web" },
                { color: "green", text: "NIST 800-63-4 final rule published — 6-month window to comply" },
                { color: "red", text: "Certus loses Home Office contract — pricing cited" },
                { color: "green", text: "Veridian raised $40M Series C — shifts focus to government" },
                { color: "amber", text: "EU AI Act compliance deadline: 3 months remaining" },
                { color: "red", text: "NexaID acquired DocuShield — expands doc verification" },
                { color: "green", text: "UK DIATF Gamma certification now mandatory for tenders" },
                { color: "amber", text: "BioPulse launches passive liveness for mobile web" },
                { color: "green", text: "NIST 800-63-4 final rule published — 6-month window to comply" },
                { color: "red", text: "Certus loses Home Office contract — pricing cited" },
              ].map((item, i) => (
                <div key={i} className="lp-ticker-item">
                  <span className={`lp-ticker-dot lp-ticker-dot-${item.color}`}></span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <div className="lp-stats-bar">
        <div className="lp-stat-item">
          <div className="lp-stat-value">4,173</div>
          <div className="lp-stat-label">Intelligence signals this month</div>
        </div>
        <div className="lp-stat-item">
          <div className="lp-stat-value">46</div>
          <div className="lp-stat-label">Topics tracked per workspace</div>
        </div>
        <div className="lp-stat-item">
          <div className="lp-stat-value">7</div>
          <div className="lp-stat-label">Strategic Pulse sections generated</div>
        </div>
        <div className="lp-stat-item">
          <div className="lp-stat-value">3 min</div>
          <div className="lp-stat-label">Average to set up your workspace</div>
        </div>
      </div>

      {/* PROBLEM */}
      <div className="lp-section lp-reveal" ref={(el) => addReveal(el, 0)} id="problem">
        <div className="lp-problem-grid">
          <div>
            <p className="lp-section-label">The real problem</p>
            <h2 className="lp-problem-headline">
              You are not short on information.<br />You are short on <span style={{ color: "#7fa8ff" }}>clarity.</span>
            </h2>
            <p className="lp-problem-body">Every day brings newsletters, alerts, LinkedIn posts, Slack messages. The information is everywhere. The problem is none of it connects.</p>
            <p className="lp-problem-body">You bookmark things you never revisit. You capture notes that sit unread. You walk into meetings not knowing what changed last week with the competitor they are about to ask you about.</p>
          </div>
          <div className="lp-vs-card">
            <div className="lp-vs-header">
              <div className="lp-vs-col">
                <div className={`lp-vs-col-label lp-vs-col-label-bad`}>✕ Without Signalum</div>
              </div>
              <div className="lp-vs-col">
                <div className={`lp-vs-col-label lp-vs-col-label-good`}>✓ With Signalum</div>
              </div>
            </div>
            <div>
              {[
                { bad: "📎 Bookmarks you never revisit", good: "✦ Everything captured in one place" },
                { bad: "🔀 Notes scattered across tools", good: "✦ AI connects the dots automatically" },
                { bad: "🔔 Alerts with no context", good: "✦ Context built up over time" },
                { bad: "⏰ Hours spent piecing it together", good: "✦ Briefed on your schedule" },
                { bad: "😳 Blindsided in meetings", good: "✦ Always the most informed person" },
              ].map((row, i) => (
                <div key={i} className="lp-vs-row">
                  <div className="lp-vs-cell">{row.bad}</div>
                  <div className={`lp-vs-cell lp-vs-cell-good`}>{row.good}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* FEATURE SHOWCASE */}
      <div className="lp-showcase-section lp-reveal" ref={(el) => addReveal(el, 1)} id="features">
        <div className="lp-showcase-inner">
          <div className="lp-showcase-header">
            <p className="lp-section-label">What Signalum does</p>
            <h2 className="lp-showcase-headline">Intelligence built for<br />how PMs and marketers think.</h2>
            <p className="lp-showcase-sub">Not just a feed of news. A living picture of your competitive landscape, updated continuously and turned into clear action.</p>
          </div>

          <div className="lp-feature-tabs">
            {TABS.map((tab, i) => (
              <button
                key={i}
                className={`lp-feature-tab${activeTab === i ? " lp-tab-active" : ""}`}
                onClick={() => setActiveTab(i)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab 0: Competitive scoring */}
          {activeTab === 0 && (
            <div className="lp-feature-grid">
              <div>
                <span className="lp-feature-tag">Competitive dimensions</span>
                <h3 className="lp-feature-title">Score every competitor on what actually matters.</h3>
                <p className="lp-feature-desc">Define the capability dimensions that matter to your buyers. Signalum tracks where you stand versus every competitor — with weighted scoring that reflects how much each item matters.</p>
                <ul className="lp-feature-points">
                  <li>Define dimensions like Liveness Check, Deployment Flexibility, or Integration Options</li>
                  <li>Importance tiers (Critical / High / Medium / Low) weight the scoring automatically</li>
                  <li>Radar chart shows gaps and advantages at a glance</li>
                  <li>One-click AI research fills in competitor status from live web sources</li>
                </ul>
              </div>
              <div className="lp-screen-mockup">
                <div className="lp-screen-mockup-bar">
                  <span className="lp-screen-dot lp-screen-dot-red"></span>
                  <span className="lp-screen-dot lp-screen-dot-amber"></span>
                  <span className="lp-screen-dot lp-screen-dot-green"></span>
                  <span className="lp-screen-url">signalum.app / competitor / Veridian</span>
                </div>
                <div style={{ background: "#f0f2f5", padding: 20 }}>
                  <div style={{ background: "white", borderRadius: 10, padding: 16, border: "1px solid #e5e7eb", fontFamily: "system-ui, sans-serif" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 12 }}>Competitive scoring</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                      <span style={{ background: "#0f1f3d", color: "white", padding: "4px 10px", borderRadius: 20, fontSize: 11 }}>Document Verif.</span>
                      <span style={{ background: "#f3f4f6", color: "#6b7280", padding: "4px 10px", borderRadius: 20, fontSize: 11, border: "1px solid #e5e7eb" }}>Liveness Check</span>
                      <span style={{ background: "#f3f4f6", color: "#6b7280", padding: "4px 10px", borderRadius: 20, fontSize: 11, border: "1px solid #e5e7eb" }}>Integration</span>
                      <span style={{ background: "#f3f4f6", color: "#6b7280", padding: "4px 10px", borderRadius: 20, fontSize: 11, border: "1px solid #e5e7eb" }}>Deployment</span>
                    </div>
                    <svg viewBox="0 0 280 220" style={{ width: "100%", display: "block" }}>
                      <circle cx="140" cy="110" r="80" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
                      <circle cx="140" cy="110" r="60" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
                      <circle cx="140" cy="110" r="40" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
                      <circle cx="140" cy="110" r="20" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
                      <line x1="140" y1="30" x2="140" y2="190" stroke="#e5e7eb" strokeWidth="1"/>
                      <line x1="60" y1="110" x2="220" y2="110" stroke="#e5e7eb" strokeWidth="1"/>
                      <line x1="83" y1="53" x2="197" y2="167" stroke="#e5e7eb" strokeWidth="1"/>
                      <line x1="197" y1="53" x2="83" y2="167" stroke="#e5e7eb" strokeWidth="1"/>
                      <polygon points="140,50 200,90 185,165 100,168 80,88" fill="rgba(79,127,255,0.15)" stroke="#4f7fff" strokeWidth="2"/>
                      <circle cx="140" cy="50" r="4" fill="#4f7fff"/>
                      <circle cx="200" cy="90" r="4" fill="#4f7fff"/>
                      <circle cx="185" cy="165" r="4" fill="#4f7fff"/>
                      <circle cx="100" cy="168" r="4" fill="#4f7fff"/>
                      <circle cx="80" cy="88" r="4" fill="#4f7fff"/>
                      <polygon points="140,62 190,98 172,158 108,160 90,100" fill="rgba(249,115,22,0.12)" stroke="#f97316" strokeWidth="2" strokeDasharray="4,3"/>
                      <circle cx="140" cy="62" r="3" fill="#f97316"/>
                      <circle cx="190" cy="98" r="3" fill="#f97316"/>
                      <circle cx="172" cy="158" r="3" fill="#f97316"/>
                      <circle cx="108" cy="160" r="3" fill="#f97316"/>
                      <circle cx="90" cy="100" r="3" fill="#f97316"/>
                      <text x="140" y="24" textAnchor="middle" fontSize="9" fill="#6b7280">Doc Verif.</text>
                      <text x="226" y="113" fontSize="9" fill="#6b7280">Liveness</text>
                      <text x="140" y="198" textAnchor="middle" fontSize="9" fill="#6b7280">Integration</text>
                      <text x="52" y="113" textAnchor="end" fontSize="9" fill="#6b7280">Deployment</text>
                      <rect x="60" y="4" width="8" height="8" rx="1" fill="#4f7fff"/>
                      <text x="72" y="12" fontSize="9" fill="#374151">Us</text>
                      <rect x="92" y="4" width="8" height="8" rx="1" fill="#f97316"/>
                      <text x="104" y="12" fontSize="9" fill="#374151">Veridian</text>
                    </svg>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <div style={{ background: "#f9fafb", borderRadius: 8, padding: 10, border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Document Verif.</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ height: 4, background: "#4f7fff", borderRadius: 2, width: "72%" }}></div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>72</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <div style={{ height: 4, background: "#f97316", borderRadius: 2, width: "44%" }}></div>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>44</span>
                        </div>
                        <span style={{ background: "#dcfce7", color: "#166534", fontSize: 10, padding: "2px 6px", borderRadius: 10, marginTop: 6, display: "inline-block" }}>Ahead</span>
                      </div>
                      <div style={{ background: "#f9fafb", borderRadius: 8, padding: 10, border: "1px solid #e5e7eb" }}>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Liveness Check</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ height: 4, background: "#4f7fff", borderRadius: 2, width: "68%" }}></div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>68</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <div style={{ height: 4, background: "#f97316", borderRadius: 2, width: "83%" }}></div>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>83</span>
                        </div>
                        <span style={{ background: "#fee2e2", color: "#991b1b", fontSize: 10, padding: "2px 6px", borderRadius: 10, marginTop: 6, display: "inline-block" }}>Behind</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 1: Strategic Pulse */}
          {activeTab === 1 && (
            <div className="lp-feature-grid">
              <div>
                <span className="lp-feature-tag">Strategic Pulse</span>
                <h3 className="lp-feature-title">Your weekly AI intelligence briefing, written for you.</h3>
                <p className="lp-feature-desc">Every week, Signalum synthesises thousands of signals across all your tracked topics into a seven-section strategic brief — market direction, competitor moves, threats, opportunities, and roadmap implications.</p>
                <ul className="lp-feature-points">
                  <li>Market Direction: 6-18 month outlook based on live signals</li>
                  <li>Competitor Moves Decoded: what they are doing and why it matters</li>
                  <li>Threat Radar: urgent actions and items to monitor</li>
                  <li>Roadmap Implications: specific recommendations tied to your dimensions</li>
                </ul>
              </div>
              <div className="lp-screen-mockup">
                <div className="lp-screen-mockup-bar">
                  <span className="lp-screen-dot lp-screen-dot-red"></span>
                  <span className="lp-screen-dot lp-screen-dot-amber"></span>
                  <span className="lp-screen-dot lp-screen-dot-green"></span>
                  <span className="lp-screen-url">signalum.app / intelligence</span>
                </div>
                <div style={{ background: "#f0f2f5", padding: 16, fontFamily: "system-ui, sans-serif" }}>
                  <div style={{ background: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Strategic Pulse</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>AI-powered intelligence briefing</div>
                      </div>
                      <button style={{ background: "#0f1f3d", color: "white", border: "none", padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Generate New Pulse</button>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ background: "#eff6ff", borderRadius: 8, padding: "14px 16px", borderLeft: "3px solid #3b82f6", marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e40af", marginBottom: 6 }}>📊 Market Direction</div>
                        <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>The identity verification market is converging on mandatory certification models. Regulators are no longer treating IDV as optional infrastructure...</div>
                      </div>
                      <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "14px 16px", borderLeft: "3px solid #22c55e", marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 6 }}>🎯 Emerging Opportunities</div>
                        <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>Sovereign digital wallet integration requirements in EU and APAC markets create first-mover advantage for vendors who can demonstrate EUDIW compatibility...</div>
                      </div>
                      <div style={{ background: "#fff7ed", borderRadius: 8, padding: "14px 16px", borderLeft: "3px solid #f97316" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#c2410c", marginBottom: 6 }}>⚠️ Threat Radar</div>
                        <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>Veridian's RSA 2026 demonstration of cryptographic human-intent binding establishes a new benchmark...</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Market Signals */}
          {activeTab === 2 && (
            <div className="lp-feature-grid">
              <div>
                <span className="lp-feature-tag">Market Signals</span>
                <h3 className="lp-feature-title">Turn customer asks into roadmap evidence.</h3>
                <p className="lp-feature-desc">Log requirements from RFIs, customer calls, sales conversations, and partner asks. Link each one to your capability dimensions. Watch the heatmap reveal which capabilities are showing up most across your market.</p>
                <ul className="lp-feature-points">
                  <li>Paste text, upload a document, or log manually</li>
                  <li>AI extracts requirements and suggests dimension mappings</li>
                  <li>Demand heatmap shows which capabilities the market is asking for</li>
                  <li>Drill down from any cell to see the exact source requirement</li>
                </ul>
              </div>
              <div className="lp-screen-mockup">
                <div className="lp-screen-mockup-bar">
                  <span className="lp-screen-dot lp-screen-dot-red"></span>
                  <span className="lp-screen-dot lp-screen-dot-amber"></span>
                  <span className="lp-screen-dot lp-screen-dot-green"></span>
                  <span className="lp-screen-url">signalum.app / market-signals</span>
                </div>
                <div style={{ background: "#f0f2f5", padding: 16, fontFamily: "system-ui, sans-serif" }}>
                  <div style={{ background: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>Demand Heatmap</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ background: "#0f1f3d", color: "white", border: "none", padding: "4px 10px", borderRadius: 20, fontSize: 11 }}>All</button>
                        <button style={{ background: "#f3f4f6", color: "#6b7280", border: "none", padding: "4px 10px", borderRadius: 20, fontSize: 11 }}>Active</button>
                        <button style={{ background: "#f3f4f6", color: "#6b7280", border: "none", padding: "4px 10px", borderRadius: 20, fontSize: 11 }}>Closed</button>
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px", overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "6px 8px", color: "#9ca3af", fontWeight: 500, width: 140 }}>Item</th>
                            <th style={{ padding: "6px 4px", color: "#9ca3af", fontWeight: 500, textAlign: "center" }}>Doc Verif.</th>
                            <th style={{ padding: "6px 4px", color: "#9ca3af", fontWeight: 500, textAlign: "center" }}>Liveness</th>
                            <th style={{ padding: "6px 4px", color: "#9ca3af", fontWeight: 500, textAlign: "center" }}>Deployment</th>
                            <th style={{ padding: "6px 4px", color: "#9ca3af", fontWeight: 500, textAlign: "center" }}>Integration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: "NFC chip reading", vals: [{ bg: "#534AB7", c: "white", v: "9" }, { bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#D3D1C7", c: "#2C2C2A", v: "2" }, { bg: "#f3f4f6", c: "#9ca3af", v: "0" }] },
                            { label: "FedRAMP Moderate", vals: [{ bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#534AB7", c: "white", v: "8" }, { bg: "#D3D1C7", c: "#2C2C2A", v: "3" }] },
                            { label: "ISO 30107-3 PAD L2", vals: [{ bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#7F77DD", c: "white", v: "7" }, { bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#f3f4f6", c: "#9ca3af", v: "0" }] },
                            { label: "REST API availability", vals: [{ bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#f3f4f6", c: "#9ca3af", v: "0" }, { bg: "#D3D1C7", c: "#2C2C2A", v: "2" }, { bg: "#CECBF6", c: "#26215C", v: "4" }] },
                          ].map((row, i) => (
                            <tr key={i}>
                              <td style={{ padding: "5px 8px", fontSize: 10, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", maxWidth: 140, textOverflow: "ellipsis" }}>{row.label}</td>
                              {row.vals.map((v, j) => (
                                <td key={j} style={{ padding: 3 }}>
                                  <div style={{ background: v.bg, color: v.c, borderRadius: 4, textAlign: "center", padding: 5, fontWeight: v.v !== "0" ? 600 : undefined }}>{v.v}</div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10 }}>
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>Lower</span>
                        {["#f3f4f6", "#D3D1C7", "#CECBF6", "#AFA9EC", "#7F77DD", "#534AB7"].map((c, i) => (
                          <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c }}></div>
                        ))}
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>Higher demand</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Live workspace */}
          {activeTab === 3 && (
            <div className="lp-feature-grid">
              <div>
                <span className="lp-feature-tag">Live workspace</span>
                <h3 className="lp-feature-title">Your entire competitive landscape in one place.</h3>
                <p className="lp-feature-desc">Track competitors, regulations, industry trends, and key accounts — all organised automatically. Every update is captured, classified, and filed to the right topic without any manual effort.</p>
                <ul className="lp-feature-points">
                  <li>46 topics tracked across 5 categories per workspace</li>
                  <li>4,000+ intelligence signals captured each month</li>
                  <li>AI classifies and files every update automatically</li>
                  <li>Live feed shows what changed in the last hour</li>
                </ul>
              </div>
              <div className="lp-screen-mockup">
                <div className="lp-screen-mockup-bar">
                  <span className="lp-screen-dot lp-screen-dot-red"></span>
                  <span className="lp-screen-dot lp-screen-dot-amber"></span>
                  <span className="lp-screen-dot lp-screen-dot-green"></span>
                  <span className="lp-screen-url">signalum.app / workspace</span>
                </div>
                <div style={{ background: "#f0f2f5", padding: 16, fontFamily: "system-ui, sans-serif" }}>
                  <div style={{ background: "white", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>My Workspace</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>5 categories · 46 topics · 4,173 updates</div>
                      </div>
                      <button style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", padding: "5px 12px", borderRadius: 6, fontSize: 11, color: "#374151", cursor: "pointer" }}>Compare →</button>
                    </div>
                    <div style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ background: "#0f1f3d", borderRadius: 8, padding: "12px 14px", color: "white" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Competitor Landscape</div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>19 topics · 877 updates this month</div>
                          <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4, lineHeight: 1.4 }}>Veridian raises $40M... NexaID acquires DocuShield...</div>
                        </div>
                        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#111", marginBottom: 2 }}>Regulatory & Standards</div>
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>12 topics · 1,083 updates this month</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>UK National ID · EU AI Act · NIST 800-63-4...</div>
                        </div>
                        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#111", marginBottom: 2 }}>Industry Topics</div>
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>12 topics · 1,718 updates this month</div>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Deepfake threats · Agentic AI · eIDAS 2.0...</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="lp-how-section lp-reveal" ref={(el) => addReveal(el, 2)} id="how">
        <div className="lp-how-header">
          <p className="lp-section-label">How it works</p>
          <h2 className="lp-how-headline">From scattered noise to one clear answer.</h2>
        </div>
        <div className="lp-how-steps">
          <div className="lp-how-step">
            <div className="lp-how-step-num">01</div>
            <div className="lp-how-step-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3v10M6 7l4-4 4 4M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1"/>
              </svg>
            </div>
            <h3>Set up your workspace in minutes</h3>
            <p>Tell Signalum who you track — competitors, regulations, accounts, industry topics. It builds your workspace automatically. No spreadsheets, no configuration.</p>
          </div>
          <div className="lp-how-step">
            <div className="lp-how-step-num">02</div>
            <div className="lp-how-step-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="7"/>
                <path d="M10 6v4l3 3"/>
              </svg>
            </div>
            <h3>Intelligence flows in automatically</h3>
            <p>Signalum researches every topic continuously — competitor moves, regulatory changes, market signals. Everything is classified and filed without you lifting a finger.</p>
          </div>
          <div className="lp-how-step">
            <div className="lp-how-step-num">03</div>
            <div className="lp-how-step-icon">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4M7 4H4a1 1 0 00-1 1v11a1 1 0 001 1h12a1 1 0 001-1V9l-5-5H7z"/>
              </svg>
            </div>
            <h3>Get a briefing. Walk in prepared.</h3>
            <p>Your Strategic Pulse synthesises everything into seven sections — market direction, competitor moves, threats, and specific roadmap recommendations. Written for you, on demand.</p>
          </div>
        </div>
      </div>

      {/* WHO IT'S FOR */}
      <section className="lp-icp-section lp-reveal" ref={(el) => addReveal(el, 3)} id="who">
        <div className="lp-icp-inner">
          <div className="lp-icp-header">
            <p className="lp-section-label">Who it&apos;s for</p>
            <h2 className="lp-icp-headline">Built for the people who need to<br />know what&apos;s happening.</h2>
          </div>
          <div className="lp-icp-grid">
            <div className="lp-icp-card">
              <div className="lp-icp-role">Product Manager</div>
              <h3 className="lp-icp-title">Stay ahead of your competitors without the research hours.</h3>
              <p className="lp-icp-pain">You need to know what competitors are doing, what capabilities the market is asking for, and how you stack up — but gathering that information takes time you don&apos;t have before every roadmap review or exec meeting.</p>
              <ul className="lp-icp-gains">
                <li><span className="lp-icp-check">✓</span> Know your competitive position across every dimension that matters to buyers</li>
                <li><span className="lp-icp-check">✓</span> See which capabilities are showing up most in RFIs and customer calls</li>
                <li><span className="lp-icp-check">✓</span> Get roadmap implications written for you, tied to real signals</li>
                <li><span className="lp-icp-check">✓</span> Walk into sprint planning with evidence, not gut feel</li>
              </ul>
            </div>
            <div className="lp-icp-card">
              <div className="lp-icp-role">Marketer</div>
              <h3 className="lp-icp-title">Know what the market is saying before you brief the agency.</h3>
              <p className="lp-icp-pain">Your messaging needs to respond to what competitors are claiming and what buyers are asking for — but by the time intelligence reaches you it&apos;s stale, incomplete, or buried in a Google Doc nobody opens.</p>
              <ul className="lp-icp-gains">
                <li><span className="lp-icp-check">✓</span> Track competitor messaging and positioning changes in real time</li>
                <li><span className="lp-icp-check">✓</span> See which themes are gaining traction across your market</li>
                <li><span className="lp-icp-check">✓</span> Build battlecards grounded in actual verified capability data</li>
                <li><span className="lp-icp-check">✓</span> Brief campaigns from a position of genuine market knowledge</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTES */}
      <div className="lp-quotes-section lp-reveal" ref={(el) => addReveal(el, 4)}>
        <p className="lp-quotes-header">Trusted by professionals who need to stay ahead</p>
        <div className="lp-quotes-grid">
          {[
            { quote: `"I used to spend half a Sunday catching up on what happened in my industry that week. Now it is waiting for me Monday morning."`, role: "Senior Product Manager, SaaS company" },
            { quote: `"The competitive scoring feature changed how we run roadmap reviews. We now have objective data to back every prioritisation decision."`, role: "Head of Product, enterprise software" },
            { quote: `"I track six different topics across two industries. Signalum files everything and I never miss a thing. It is like having a researcher on the team."`, role: "Market Analyst, financial services" },
          ].map((q, i) => (
            <div key={i} className="lp-quote-card">
              <div className="lp-quote-stars">★★★★★</div>
              <p className="lp-quote-text">{q.quote}</p>
              <div className="lp-quote-divider"></div>
              <p className="lp-quote-role">{q.role}</p>
            </div>
          ))}
        </div>
      </div>

      {/* TRUST */}
      <div className="lp-trust-section lp-reveal" ref={(el) => addReveal(el, 5)}>
        <div className="lp-trust-inner">
          <div className="lp-trust-item">
            <div className="lp-trust-item-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f7fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h4>Your data never trains our models</h4>
            <p>Everything you capture stays in your workspace. It is never used to train AI models or shared with any third party.</p>
          </div>
          <div className="lp-trust-item">
            <div className="lp-trust-item-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f7fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
            <h4>Isolated by design</h4>
            <p>Your workspace is completely isolated from every other user. Row-level security enforced at the database level.</p>
          </div>
          <div className="lp-trust-item">
            <div className="lp-trust-item-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f7fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <h4>Built for sensitive work</h4>
            <p>Designed for teams handling competitive, regulatory, and strategic intelligence where confidentiality matters.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <section className="lp-cta-section lp-reveal" ref={(el) => addReveal(el, 6)} id="cta">
        <h2 className="lp-cta-headline">
          Start your day already<br /><span style={{ color: "#7fa8ff" }}>knowing what matters.</span>
        </h2>
        <p className="lp-cta-sub">Set up in three minutes. No credit card. No configuration.</p>
        <div className="lp-cta-form">
          <input
            className="lp-cta-input"
            type="email"
            placeholder="Your work email"
            value={ctaEmail}
            onChange={(e) => setCtaEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCtaSubmit(); }}
          />
          <button className="lp-cta-btn" onClick={handleCtaSubmit}>Request access</button>
        </div>
        <p className={`lp-cta-note${ctaSubmitted ? " lp-cta-note-success" : ""}`}>
          {ctaSubmitted ? "✓ Thanks! We will be in touch within 24 hours." : "We will be in touch within 24 hours."}
        </p>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-left">
          <a href="#" className="lp-footer-brand">
            <div className="lp-footer-brand-icon">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M10 2L12.5 7.5H18L13.5 11L15.5 17L10 13.5L4.5 17L6.5 11L2 7.5H7.5L10 2Z" fill="white"/>
              </svg>
            </div>
            Signalum
          </a>
          <span className="lp-footer-copy">© 2026 Signalum</span>
        </div>
        <ul className="lp-footer-links">
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Terms</a></li>
          <li><Link href="/signin"><a>Sign in</a></Link></li>
        </ul>
      </footer>
    </div>
  );
}
