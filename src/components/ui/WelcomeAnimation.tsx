"use client";

import { useEffect, useState } from "react";
import Head from "next/head";

interface WelcomeAnimationProps {
  hotelId: string;
  hotelName: string;
  preset: "elegant" | "vibrant" | "minimal" | string;
}

export function WelcomeAnimation({ hotelId, hotelName, preset }: WelcomeAnimationProps) {
  const [shouldShow, setShouldShow] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    const sessionKey = `qr_welcome_shown_${hotelId}`;
    const hasBeenShown = sessionStorage.getItem(sessionKey);

    if (!hasBeenShown) {
      setShouldShow(true);
      // Start exit animation
      const hideTimer = setTimeout(() => {
        setIsHiding(true);
      }, 2500);

      // Remove from DOM and set session storage
      const removeTimer = setTimeout(() => {
        setShouldShow(false);
        sessionStorage.setItem(sessionKey, "true");
      }, 3000);

      return () => {
        clearTimeout(hideTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [hotelId]);

  if (!shouldShow) return null;

  const presetStyles = {
    elegant: {
      fontFamily: "'Playfair Display', serif",
      background: "linear-gradient(135deg, #000000, #2c3e50)",
      color: "#f1c40f",
      animationName: "fadeSlideUp",
    },
    vibrant: {
      fontFamily: "'Poppins', sans-serif",
      background: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)",
      color: "#d63031",
      animationName: "popBounce",
    },
    minimal: {
      fontFamily: "'DM Sans', sans-serif",
      background: "#ffffff",
      color: "#2d3436",
      animationName: "fadeIn",
    },
  };

  const currentStyle = presetStyles[(preset as keyof typeof presetStyles)] || presetStyles.elegant;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@400;600;700&family=Poppins:wght@400;600;800&display=swap');

        @keyframes fadeSlideUp {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes popBounce {
          0% { opacity: 0; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.05); }
          100% { transform: scale(1); }
        }

        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes overlayFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes overlayFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        .welcome-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: overlayFadeIn 0.5s ease-out forwards;
        }

        .welcome-overlay.hiding {
          animation: overlayFadeOut 0.5s ease-in forwards;
        }

        .welcome-content {
          text-align: center;
          padding: 2rem;
        }

        .welcome-title {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          line-height: 1.2;
        }

        .welcome-subtitle {
          font-size: 1.2rem;
          opacity: 0.9;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .welcome-overlay, .welcome-overlay.hiding, .welcome-content {
            animation: none !important;
          }
        }
      `}} />
      <div 
        className={`welcome-overlay ${isHiding ? 'hiding' : ''}`}
        style={{
          background: currentStyle.background,
          color: currentStyle.color,
          fontFamily: currentStyle.fontFamily
        }}
      >
        <div 
          className="welcome-content"
          style={{
            animation: `${currentStyle.animationName} 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`
          }}
        >
          <div className="welcome-subtitle">Welcome to</div>
          <h1 className="welcome-title">{hotelName}</h1>
        </div>
      </div>
    </>
  );
}
