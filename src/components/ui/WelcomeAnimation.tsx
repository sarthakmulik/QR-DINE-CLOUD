"use client";

import { useEffect, useState, useMemo } from "react";
import "./welcome-animation.css";

interface WelcomeAnimationProps {
  restaurantName: string;
  preset: "elegant" | "vibrant" | "minimal";
  onComplete: () => void;
}

export function WelcomeAnimation({ restaurantName, preset, onComplete }: WelcomeAnimationProps) {
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

  // Generate 14 random particles for 'elegant' preset once
  const particles = useMemo(() => {
    if (preset !== "elegant") return [];
    
    return Array.from({ length: 14 }).map((_, i) => {
      const size = Math.floor(Math.random() * 4) + 3; // 3 to 6px
      const left = Math.floor(Math.random() * 91) + 5; // 5% to 95%
      const bottom = Math.floor(Math.random() * 36) + 5; // 5% to 40%
      const dur = (Math.random() * 1.0 + 2.2).toFixed(2); // 2.2s to 3.2s
      const delay = (i * 0.1).toFixed(1); // 0s to 1.4s (wait, i goes up to 13, so 1.3s max)
      
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
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <h1 style={{ fontFamily: "sans-serif", fontSize: "2rem", color: "#333", textAlign: "center" }}>
          {restaurantName}
        </h1>
      </div>
    );
  }

  if (preset === "elegant") {
    return (
      <div className="wa-elegant">
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
      <div className="wa-vibrant">
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

  // minimal
  return (
    <div className="wa-minimal">
      <div className="wa-minimal-ring"></div>
      <div className="wa-minimal-content">
        <div className="wa-minimal-name">{restaurantName}</div>
        <div className="wa-minimal-dot"></div>
        <div className="wa-minimal-sub">Welcome</div>
      </div>
    </div>
  );
}
