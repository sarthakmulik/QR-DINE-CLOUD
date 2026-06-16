import React from "react";

export interface RestaurantSettings {
  welcomeAnimationEnabled: boolean;
  welcomeAnimationPreset: string;
}

interface WelcomeAnimationSettingsProps {
  plan: "basic" | "pro" | "elite";
  settings: RestaurantSettings;
  onUpdate: (patch: Partial<RestaurantSettings>) => void;
  restaurantName: string;
}

export function WelcomeAnimationSettings({ plan, settings, onUpdate, restaurantName }: WelcomeAnimationSettingsProps) {
  if (plan === "basic") return null;

  const { welcomeAnimationEnabled: enabled, welcomeAnimationPreset: preset } = settings;

  const handleToggle = () => {
    onUpdate({ welcomeAnimationEnabled: !enabled });
  };

  const handlePresetSelect = (p: string) => {
    onUpdate({ welcomeAnimationPreset: p });
  };

  const renderPreviewContent = (p: string) => {
    if (p === "elegant") {
      return (
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, #1A1A2E 0%, #0D0D18 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 2rem" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", color: "#C8A882", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {restaurantName}
            </div>
            <div style={{ fontFamily: "sans-serif", fontSize: "0.72rem", letterSpacing: "0.45em", textTransform: "uppercase", color: "rgba(255, 255, 255, 0.45)", marginTop: "10px" }}>
              Welcome
            </div>
            <div style={{ height: "1px", background: "#C8A882", width: "90px", margin: "16px auto 0" }}></div>
          </div>
        </div>
      );
    }
    if (p === "vibrant") {
      return (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #FF6B6B 0%, #FFE66D 50%, #4ECDC4 100%)", backgroundSize: "300% 300%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", zIndex: 2, padding: "0 2rem" }}>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: "2rem", color: "#ffffff", textShadow: "0 4px 24px rgba(0, 0, 0, 0.22)" }}>
              {restaurantName}
            </div>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 300, fontSize: "1rem", color: "rgba(255, 255, 255, 0.92)", marginTop: "10px" }}>
              Scan to order seamlessly
            </div>
          </div>
        </div>
      );
    }
    if (p === "minimal") {
      return (
        <div style={{ position: "absolute", inset: 0, background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: "160px", height: "160px", borderRadius: "50%", border: "1.5px solid #E0E0E0" }}></div>
          <div style={{ textAlign: "center", zIndex: 2 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: "1.6rem", color: "#1A1A1A", letterSpacing: "-0.025em" }}>
              {restaurantName}
            </div>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#1A1A1A", margin: "16px auto" }}></div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.72rem", letterSpacing: "0.24em", textTransform: "uppercase", color: "#999999" }}>
              Welcome
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid #E5E5E5" }}>
      <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#1A1A1A", margin: 0 }}>Welcome Experience</h3>
      <p style={{ fontSize: "12px", color: "#6B7280", margin: "4px 0 16px 0" }}>Shown to guests the first time they scan your QR code.</p>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button
          type="button"
          onClick={handleToggle}
          style={{
            width: "40px",
            height: "22px",
            borderRadius: "22px",
            background: enabled ? "#1A1A1A" : "#D4D4D4",
            position: "relative",
            border: "none",
            cursor: "pointer",
            transition: "background 200ms ease",
            padding: 0
          }}
        >
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "#ffffff",
              position: "absolute",
              top: "3px",
              left: "3px",
              transition: "transform 200ms ease",
              transform: enabled ? "translateX(18px)" : "translateX(0)"
            }}
          />
        </button>
        <span style={{ fontSize: "14px", fontWeight: 500 }}>Enable Welcome Animation</span>
      </div>

      {enabled && (
        <>
          {plan === "pro" && (
            <div>
              <p style={{ fontSize: "13px", color: "#4B5563", marginBottom: "12px", fontWeight: 500 }}>Style: Elegant (Pro plan)</p>
              <div style={{ width: "200px", height: "110px", position: "relative", overflow: "hidden", borderRadius: "8px", border: "1px solid #E5E5E5" }}>
                <div style={{ width: "400px", height: "220px", transform: "scale(0.5)", transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}>
                  {renderPreviewContent("elegant")}
                </div>
              </div>
            </div>
          )}

          {plan === "elite" && (
            <div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
                {[
                  { id: "elegant", label: "Elegant", color: "#C8A882" },
                  { id: "vibrant", label: "Vibrant", color: "#FF6B6B" },
                  { id: "minimal", label: "Minimal", color: "#1A1A1A" },
                ].map((p) => {
                  const isSelected = preset === p.id;
                  return (
                    <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => handlePresetSelect(p.id)}
                        style={{
                          width: "180px",
                          height: "100px",
                          borderRadius: "8px",
                          border: isSelected ? `2px solid ${p.color}` : "1px solid #E5E5E5",
                          padding: 0,
                          cursor: "pointer",
                          position: "relative",
                          overflow: "hidden",
                          background: "#fff",
                          boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.05)" : "none"
                        }}
                      >
                        {isSelected && (
                          <div style={{ position: "absolute", top: "6px", right: "6px", width: "12px", height: "12px", borderRadius: "50%", background: p.color, zIndex: 10 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: "8px", height: "8px", margin: "2px" }}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                        <div style={{ width: "400px", height: "220px", transform: "scale(0.45)", transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}>
                          {renderPreviewContent(p.id)}
                        </div>
                      </button>
                      <span style={{ fontSize: "12px", color: "#6B7280", textAlign: "center", fontWeight: isSelected ? 600 : 400 }}>{p.label}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "16px" }}>
                <p style={{ fontSize: "13px", color: "#4B5563", marginBottom: "8px", fontWeight: 500 }}>Live Preview</p>
                <div style={{ width: "200px", height: "110px", position: "relative", overflow: "hidden", borderRadius: "8px", border: "1px solid #E5E5E5" }}>
                  <div style={{ width: "400px", height: "220px", transform: "scale(0.5)", transformOrigin: "0 0", position: "absolute", top: 0, left: 0 }}>
                    {renderPreviewContent(preset)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
