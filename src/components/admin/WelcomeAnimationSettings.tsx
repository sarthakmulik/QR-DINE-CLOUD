import { usePlan } from "@/lib/contexts/plan-context";

interface WelcomeAnimationSettingsProps {
  form: any;
  setForm: (form: any) => void;
}

export function WelcomeAnimationSettings({ form, setForm }: WelcomeAnimationSettingsProps) {
  const { currentPlan } = usePlan();
  const plan = (currentPlan || "basic").toLowerCase();
  
  const isElite = plan === "elite";
  const isPro = plan === "pro";
  const isBasic = !isElite && !isPro;

  if (isBasic) {
    return null; // Completely hidden for basic
  }

  const enabled = form.customizations?.welcomeAnimationEnabled || false;
  const preset = form.customizations?.welcomeAnimationPreset || "elegant";

  return (
    <div className="border-t border-gray-200 pt-4 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
          QR Welcome Animation
        </h3>
        {isPro && !isElite && (
          <span className="text-[9px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-bold">
            Pro Feature
          </span>
        )}
        {isElite && (
          <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
            Elite Feature
          </span>
        )}
      </div>
      
      <p className="text-xs text-gray-500 mb-2">
        Displays a beautiful full-screen animation when a customer scans your QR code for the first time in a session.
      </p>

      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <input
          type="checkbox"
          id="welcomeAnimationEnabled"
          checked={enabled}
          onChange={(e) => {
            setForm({
              ...form,
              customizations: {
                ...form.customizations,
                welcomeAnimationEnabled: e.target.checked,
                // Ensure pro users always use elegant if enabled
                welcomeAnimationPreset: isElite ? preset : "elegant"
              }
            });
          }}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
        />
        <label htmlFor="welcomeAnimationEnabled" className="block text-sm font-bold text-gray-800 cursor-pointer">
          Enable Welcome Animation
        </label>
      </div>

      {enabled && isElite && (
        <div className="mt-4 pl-1 space-y-3">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
            Animation Preset
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: "elegant", name: "Elegant", desc: "Dark theme, gold text, fade & slide up (Playfair Font)" },
              { id: "vibrant", name: "Vibrant", desc: "Bright gradient, pop bounce effect (Poppins Font)" },
              { id: "minimal", name: "Minimal", desc: "Clean white, simple fade in (DM Sans Font)" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setForm({
                    ...form,
                    customizations: {
                      ...form.customizations,
                      welcomeAnimationPreset: p.id,
                    }
                  });
                }}
                className={`text-left p-3 rounded-xl border transition-all ${
                  preset === p.id
                    ? "border-brand-600 bg-brand-50 shadow-sm"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-900">{p.name}</span>
                  {preset === p.id && (
                    <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
                      ✓
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
