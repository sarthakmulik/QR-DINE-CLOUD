"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PlanType = "basic" | "pro" | "elite";

interface PlanContextType {
  currentPlan: PlanType;
  canAccess: (feature: string) => boolean;
  planLimit: (limit: string) => number | "unlimited";
  loading: boolean;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export function PlanProvider({
  children,
  hotelId,
  initialPlan,
}: {
  children: React.ReactNode;
  hotelId: string;
  initialPlan?: string;
}) {
  const [plan, setPlan] = useState<PlanType>(
    (initialPlan?.toLowerCase() as PlanType) || "basic"
  );
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!hotelId) return;

    const fetchLatestPlan = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("hotels")
          .select("plan")
          .eq("id", hotelId)
          .single();

        if (data && !error) {
          setPlan(data.plan.toLowerCase() as PlanType);
        }
      } catch (err) {
        console.error("Error fetching hotel plan:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestPlan();

    // Subscribe to hotel plan updates in real-time
    const channel = supabase
      .channel(`hotel-plan-${hotelId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "hotels",
          filter: `id=eq.${hotelId}`,
        },
        (payload) => {
          if (payload.new && payload.new.plan) {
            setPlan(payload.new.plan.toLowerCase() as PlanType);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hotelId, supabase]);

  const canAccess = (feature: string): boolean => {
    const p = plan.toLowerCase();
    switch (feature) {
      case "kds_access":
      case "staff_management":
      case "discount_coupons":
      case "customer_feedback":
        return p === "pro" || p === "elite";
      case "advanced_analytics":
        return p === "elite";
      default:
        return false;
    }
  };

  const planLimit = (limit: string): number | "unlimited" => {
    const p = plan.toLowerCase();
    switch (limit) {
      case "max_tables":
        if (p === "basic") return 5;
        if (p === "pro") return 20;
        return "unlimited";
      case "max_menu_items":
        if (p === "basic") return 20;
        if (p === "pro") return 50;
        return "unlimited";
      case "max_staff":
        if (p === "basic") return 0;
        if (p === "pro") return 5;
        return "unlimited";
      default:
        return 0;
    }
  };

  return (
    <PlanContext.Provider value={{ currentPlan: plan, canAccess, planLimit, loading }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (context === undefined) {
    throw new Error("usePlan must be used within a PlanProvider");
  }
  return context;
}
