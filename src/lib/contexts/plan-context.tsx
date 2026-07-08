"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PlanType = "basic" | "pro" | "elite";

interface PlanContextType {
  currentPlan: PlanType;
  serviceType: string;
  hotelId: string;
  hotelLogo: string | null;
  canAccess: (feature: string) => boolean;
  planLimit: (limit: string) => number | "unlimited";
  loading: boolean;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export function PlanProvider({
  children,
  hotelId,
  initialPlan,
  initialServiceType,
}: {
  children: React.ReactNode;
  hotelId: string;
  initialPlan?: string;
  initialServiceType?: string;
}) {
  const [plan, setPlan] = useState<PlanType>(
    (initialPlan?.toLowerCase() as PlanType) || "basic"
  );
  const [serviceType, setServiceType] = useState<string>(
    initialServiceType || "dine_in"
  );
  const [hotelLogo, setHotelLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!hotelId) return;

    const fetchLatestPlan = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/hotel/profile");
        if (res.ok) {
          const data = await res.json();
          if (data && data.plan) {
            setPlan(data.plan.toLowerCase() as PlanType);
          }
          if (data && data.serviceType) {
            setServiceType(data.serviceType);
          }
          if (data && data.logo) {
            setHotelLogo(data.logo);
          }
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
          if (payload.new && payload.new.service_type) {
            setServiceType(payload.new.service_type);
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
      case "csv_export":
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
      case "csv_export_limit":
        if (p === "basic") return 0;
        if (p === "pro") return 30; // 30 days
        return "unlimited";
      default:
        return 0;
    }
  };

  return (
    <PlanContext.Provider value={{ currentPlan: plan, serviceType, hotelId, hotelLogo, canAccess, planLimit, loading }}>
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
