"use client";

import { qsThemes } from "@/lib/qs-themes";
import { Search } from "lucide-react";
import { hexToRgb } from "@/lib/theme";

export function QSPreview({ form }: { form: any }) {
  const qsTheme = form.customizations?.qsTheme || "neo_brutalism";
  const t = qsThemes[qsTheme as keyof typeof qsThemes] || qsThemes.bento;

  const qsStyleVars = {
    ...(form.customizations?.qsPrimaryColor && { "--qs-primary": form.customizations.qsPrimaryColor }),
    ...(form.customizations?.qsBgColor && { "--qs-bg": form.customizations.qsBgColor }),
    ...(form.customizations?.qsTextColor && { "--qs-text": form.customizations.qsTextColor }),
    ...(form.customizations?.qsCardBgColor && { "--qs-card-bg": form.customizations.qsCardBgColor }),
    "--brand-rgb": hexToRgb(form.customizations?.primaryColor || "#ff7b00")
  } as React.CSSProperties;

  return (
    <div className="flex flex-col relative overflow-hidden select-none" style={{ height: "100%" }}>
      {/* Phone Wrapper */}
      <div className={`flex-1 rounded-[32px] overflow-hidden flex flex-col relative transition-colors duration-500 ${t.appBg}`} style={qsStyleVars}>
        <header className={`sticky top-0 z-10 shadow-sm pt-6 ${t.header}`}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className={`font-black text-xl tracking-tight leading-none ${t.textMain}`}>{form.name || "Restaurant Name"}</h1>
              <p className="text-[9px] text-brand-500 font-bold uppercase tracking-widest mt-1">Quick Service</p>
            </div>
            {form.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo} alt="Logo" className="h-8 w-8 rounded-full object-cover shadow-sm ring-1 ring-black/5" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-xs shadow-inner">
                🍽️
              </div>
            )}
          </div>

          <div className="px-4 pb-3">
            <div className={`relative group flex items-center transition-all overflow-hidden px-3 ${t.searchWrap}`}>
              <Search className="text-slate-400 flex-shrink-0" size={14} />
              <div className={`w-full py-2 px-2 text-sm ${t.searchInput}`}>Search Menu...</div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-none custom-scrollbar">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none custom-scrollbar">
             <div className={`px-4 py-1.5 whitespace-nowrap text-sm flex-shrink-0 ${t.pillActive}`}>Popular</div>
             <div className={`px-4 py-1.5 whitespace-nowrap text-sm flex-shrink-0 ${t.pillInactive}`}>Drinks</div>
             <div className={`px-4 py-1.5 whitespace-nowrap text-sm flex-shrink-0 ${t.pillInactive}`}>Snacks</div>
          </div>

          <div className="grid grid-cols-1 gap-4">
             <div className={`p-3 flex items-center gap-4 transition-all duration-300 ${t.card}`}>
               <div className={`relative w-24 h-24 flex-shrink-0 overflow-hidden ${t.imgWrap}`}>
                 <div className="absolute inset-0 flex items-center justify-center text-3xl">🍕</div>
               </div>
               <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-full">
                 <div>
                   <h3 className={`font-bold text-sm leading-tight truncate ${t.textMain}`}>Margherita Pizza</h3>
                   <p className={`text-[10px] line-clamp-1 mt-0.5 ${t.textSub}`}>Classic cheese and tomato</p>
                 </div>
                 <div className="flex items-center justify-between mt-2">
                   <span className="font-black text-brand-500 text-sm">₹299</span>
                   <div className={`px-3 py-1 text-xs transition-all flex items-center justify-center ${t.btnPrimary}`}>+ Add</div>
                 </div>
               </div>
             </div>

             <div className={`p-3 flex items-center gap-4 transition-all duration-300 ${t.card}`}>
               <div className={`relative w-24 h-24 flex-shrink-0 overflow-hidden ${t.imgWrap}`}>
                 <div className="absolute inset-0 flex items-center justify-center text-3xl">🍔</div>
               </div>
               <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-full">
                 <div>
                   <h3 className={`font-bold text-sm leading-tight truncate ${t.textMain}`}>Veg Burger</h3>
                   <p className={`text-[10px] line-clamp-1 mt-0.5 ${t.textSub}`}>Crispy patty with fresh lettuce</p>
                 </div>
                 <div className="flex items-center justify-between mt-2">
                   <span className="font-black text-brand-500 text-sm">₹149</span>
                   <div className={`flex items-center p-1 ${t.qtyControl}`}>
                     <div className={`w-6 h-6 flex items-center justify-center ${t.qtyBtn}`}>-</div>
                     <span className={`font-bold w-6 text-center text-xs ${t.textMain}`}>1</span>
                     <div className={`w-6 h-6 flex items-center justify-center ${t.qtyBtn}`}>+</div>
                   </div>
                 </div>
               </div>
             </div>
          </div>
        </main>
      </div>
    </div>
  );
}
