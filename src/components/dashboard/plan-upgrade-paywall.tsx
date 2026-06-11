"use client";

import React from "react";
import { ShieldAlert, Zap, Check } from "lucide-react";

interface PlanUpgradePaywallProps {
  featureName: string;
  requiredPlan: "Pro" | "Elite";
  description?: string;
  benefits?: string[];
}

export function PlanUpgradePaywall({
  featureName,
  requiredPlan,
  description = "Take your restaurant operations to the next level with our premium features.",
  benefits = [],
}: PlanUpgradePaywallProps) {
  const defaultBenefits = {
    Pro: [
      "Real-time Kitchen Display System (KDS)",
      "Manage up to 3 staff members",
      "Dynamic discount coupons",
      "Collect customer feedback and ratings",
      "Support for up to 15 tables",
      "Up to 50 menu items",
    ],
    Elite: [
      "Unlimited tables & menu items",
      "Unlimited staff accounts",
      "Advanced hourly analytics & sales reports",
      "Priority customer support & customizations",
      "Complete customer feedback analysis",
    ],
  };

  const activeBenefits = benefits.length > 0 ? benefits : defaultBenefits[requiredPlan];

  return (
    <div className="w-full min-h-[500px] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-8 md:p-10 shadow-2xl border border-slate-800 relative overflow-hidden flex flex-col items-center">
        {/* Decorative background glow */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Icon */}
        <div className="h-16 w-16 bg-brand-500/10 rounded-full flex items-center justify-center text-brand-400 mb-6 border border-brand-500/20">
          <Zap size={30} className="fill-current" />
        </div>

        {/* Titles */}
        <h2 className="text-3xl font-extrabold tracking-tight text-center md:text-4xl bg-gradient-to-r from-white via-slate-100 to-brand-400 bg-clip-text text-transparent">
          Unlock {featureName}
        </h2>
        <div className="mt-3 bg-brand-600/10 border border-brand-500/30 text-brand-400 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
          Requires {requiredPlan} Plan
        </div>

        <p className="text-slate-400 text-center text-base mt-4 max-w-md">
          {description}
        </p>

        {/* Benefits Checklist */}
        <div className="mt-8 w-full max-w-md border-t border-b border-slate-800 py-6 my-6">
          <p className="text-xs font-black uppercase text-slate-500 tracking-wider mb-4 text-center">
            Included in {requiredPlan}
          </p>
          <ul className="grid grid-cols-1 gap-3">
            {activeBenefits.map((benefit, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="h-5 w-5 bg-brand-500/20 text-brand-400 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={3} />
                </span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-2">
            Contact your Super Admin to upgrade your hotel plan.
          </p>
          <button
            disabled
            className="px-8 py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-80 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-brand-500/20 transition-all text-sm uppercase tracking-wider"
          >
            Ask Admin for Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}
