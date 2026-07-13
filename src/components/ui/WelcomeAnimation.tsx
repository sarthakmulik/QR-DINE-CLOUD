"use client";

import { useEffect, useState, useMemo } from "react";
import "./welcome-animation.css";

interface WelcomeAnimationProps {
  restaurantName: string;
  preset: "elegant" | "vibrant" | "minimal" | "qs-neon" | "qs-glass" | "qs-kinetic";
  theme?: {
    primaryColor?: string;
    fontFamily?: string;
    layout?: string;
  };
  onComplete: () => void;
}

export function WelcomeAnimation({ restaurantName, preset, theme, onComplete }: WelcomeAnimationProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (prefersReducedMotion) {
      timeoutId = setTimeout(onComplete, 1000);
    } else {
      let duration = 3000;
      if (preset === "elegant") duration = 3200;
      timeoutId = setTimeout(onComplete, duration);
    }

    return () => clearTimeout(timeoutId);
  }, [preset, prefersReducedMotion, onComplete]);

  // Compute CSS Variables based on Theme
  const isDark = theme?.layout === "dark_slider";
  const bgColor = isDark ? "#020617" : "#f9fafb";
  const textColor = isDark ? "#ffffff" : "#0f172a";
  const subTextColor = isDark ? "rgba(255, 255, 255, 0.55)" : "rgba(15, 23, 42, 0.55)";
  const primaryColor = theme?.primaryColor || "#3b82f6";
  const fontFamily = theme?.fontFamily ? `"${theme.fontFamily.replace(/\+/g, ' ')}", sans-serif` : "inherit";

  const cssVars = {
    "--wa-bg": bgColor,
    "--wa-text": textColor,
    "--wa-sub": subTextColor,
    "--wa-primary": primaryColor,
    "--wa-font": fontFamily,
  } as React.CSSProperties;

  // Generate random particles for 'elegant' preset once
  const particles = useMemo(() => {
    if (preset !== "elegant") return [];
    
    return Array.from({ length: 14 }).map((_, i) => {
      const size = Math.floor(Math.random() * 4) + 3; // 3 to 6px
      const left = Math.floor(Math.random() * 91) + 5; // 5% to 95%
      const bottom = Math.floor(Math.random() * 36) + 5; // 5% to 40%
      const dur = (Math.random() * 1.0 + 2.2).toFixed(2); // 2.2s to 3.2s
      const delay = (i * 0.1).toFixed(1); 
      
      return {
        id: i,
        width: `${size}px`,
        height: `${size}px`,
        left: `${left}%`,
        bottom: `${bottom}%`,
        "--dur": `${dur}s`,
        "--delay": `${delay}s`,
      } as React.CSSProperties;
    });
  }, [preset]);

  if (prefersReducedMotion) {
    return (
      <div style={{ ...cssVars, position: "fixed", inset: 0, zIndex: 9999, background: "var(--wa-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <h1 style={{ fontFamily: "var(--wa-font)", fontSize: "2rem", color: "var(--wa-text)", textAlign: "center" }}>
          {restaurantName}
        </h1>
      </div>
    );
  }

  if (preset === "elegant") {
    return (
      <div className="wa-elegant" style={cssVars}>
        {particles.map((style, i) => (
          <div key={i} className="wa-particle" style={style} />
        ))}
        <div className="wa-elegant-content">
          <div className="wa-elegant-name">{restaurantName}</div>
          <div className="wa-elegant-sub">Welcome</div>
          <div className="wa-elegant-line"></div>
        </div>
      </div>
    );
  }

  if (preset === "vibrant") {
    return (
      <div className="wa-vibrant" style={cssVars}>
        <div className="wa-vibrant-content">
          <div className="wa-vibrant-name">{restaurantName}</div>
          <div className="wa-vibrant-sub">Scan to order seamlessly</div>
          <div className="wa-vibrant-icons">
            <span>🍔</span>
            <span>🍹</span>
            <span>✨</span>
          </div>
        </div>
      </div>
    );
  }

  if (preset === "minimal") {
    return (
      <div className="wa-minimal" style={cssVars}>
        <div className="wa-minimal-ring"></div>
        <div className="wa-minimal-content">
          <div className="wa-minimal-name">{restaurantName}</div>
          <div className="wa-minimal-dot"></div>
          <div className="wa-minimal-sub">Welcome</div>
        </div>
      </div>
    );
  }

  if (preset === "qs-neon") {
    return (
      <div className="wa-qs-neon" style={cssVars}>
        <div className="wa-qs-neon-content">
          <div className="wa-qs-neon-name">{restaurantName}</div>
          <div className="wa-qs-neon-sub">System Online</div>
        </div>
      </div>
    );
  }

  if (preset === "qs-glass") {
    return (
      <div className="wa-qs-glass" style={cssVars}>
        <div className="wa-qs-glass-card">
          <div className="wa-qs-glass-name">{restaurantName}</div>
          <div className="wa-qs-glass-sub">Scan • Order • Enjoy</div>
        </div>
      </div>
    );
  }

  // qs-kinetic
  const tickerStr = Array(20).fill("ORDER NOW • ").join("");
  return (
    <div className="wa-qs-kinetic" style={cssVars}>
      <div className="wa-qs-kinetic-ticker">
         <span className="wa-qs-kinetic-ticker-text">{tickerStr}</span>
      </div>
      <div className="wa-qs-kinetic-content">
        <div className="wa-qs-kinetic-name">{restaurantName}</div>
      </div>
    </div>
  );
}
