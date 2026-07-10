"use client";

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { usePlan } from "@/lib/contexts/plan-context";
import { PlanUpgradePaywall } from "@/components/dashboard/plan-upgrade-paywall";
import { Star, MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(res => res.json());

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  table_sessions?: {
    table_number: number;
  } | null;
}

export default function FeedbackPage() {
  const { currentPlan, canAccess } = usePlan();
  const hasAccess = canAccess("customer_feedback");

  const { data: reviews = [], error, isValidating } = useSWR<Review[]>(hasAccess ? "/api/hotel/feedback" : null, fetcher, {
    revalidateOnFocus: true,
  });
  const loading = !error && reviews.length === 0 && isValidating;

  if (!hasAccess) {
    return (
      <PlanUpgradePaywall
        featureName="Customer Feedback"
        requiredPlan="Pro"
        description="Monitor guest satisfaction, collect post-billing star ratings, and review customer suggestions."
      />
    );
  }

  const isSkeletons = loading && reviews.length === 0;

  // Calculate rating distributions
  const totalReviews = reviews.length;
  const ratingSum = reviews.reduce((acc, r) => acc + r.rating, 0);
  const avgRating = totalReviews > 0 ? (ratingSum / totalReviews).toFixed(1) : "0.0";

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const rKey = r.rating as 1 | 2 | 3 | 4 | 5;
    if (ratingCounts[rKey] !== undefined) {
      ratingCounts[rKey]++;
    }
  });

  return (
    <div className="space-y-6 animate-page-entrance">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Customer Reviews
          <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
            {currentPlan}
          </span>
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 dark:text-zinc-500 text-sm">Analyze dining feedback and guest satisfaction metrics</p>
      </div>

      {isSkeletons ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          {/* Summary Column Skeleton */}
          <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center h-64">
            <div className="h-4 w-28 bg-gray-200 dark:bg-zinc-800/70 rounded mb-2" />
            <div className="h-10 w-16 bg-gray-200 dark:bg-zinc-800/70 rounded mt-2" />
            <div className="flex gap-1 mt-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-5 h-5 bg-gray-200 dark:bg-zinc-800/70 rounded" />
              ))}
            </div>
            <div className="h-3 w-36 bg-gray-100 dark:bg-zinc-800/50 rounded mt-3" />
          </div>

          {/* List Column Skeleton */}
          <div className="lg:col-span-2 space-y-4">
            <div className="h-5 w-32 bg-gray-200 dark:bg-zinc-800/70 rounded" />
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, j) => (
                        <div key={j} className="w-3.5 h-3.5 bg-gray-200 dark:bg-zinc-800/70 rounded" />
                      ))}
                    </div>
                    <div className="h-4 w-24 bg-gray-200 dark:bg-zinc-800/70 rounded" />
                  </div>
                  <div className="h-12 bg-gray-100 dark:bg-zinc-800/50 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : totalReviews > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Summary Column */}
          <div className="bg-white dark:bg-zinc-900 border rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center h-fit">
            <p className="text-sm font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Average Rating</p>
            <h3 className="text-5xl font-black text-slate-900 mt-2">{avgRating}</h3>
            <div className="flex gap-1 mt-3">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={20}
                  className={
                    i < Math.round(parseFloat(avgRating))
                      ? "fill-amber-400 text-amber-400"
                      : "text-gray-200"
                  }
                />
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 dark:text-zinc-500 mt-3 font-semibold">
              Based on {totalReviews} customer responses
            </p>

            {/* Progress Bars */}
            <div className="w-full mt-6 space-y-2">
              {([5, 4, 3, 2, 1] as const).map((stars) => {
                const count = ratingCounts[stars];
                const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-3 text-xs">
                    <span className="w-8 font-bold text-gray-600 dark:text-zinc-400 dark:text-zinc-500 flex items-center gap-0.5 justify-end">
                      {stars} <span className="text-amber-500 text-xs">â˜…</span>
                    </span>
                    <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                    </div>
                    <span className="w-8 text-right font-medium text-gray-500 dark:text-zinc-400 dark:text-zinc-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* List Column */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-base font-bold text-slate-800 uppercase tracking-wider">Guest Comments</h2>
            <div className="space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={14}
                          className={
                            i < review.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-gray-200"
                          }
                        />
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400 dark:text-zinc-500 font-semibold flex items-center gap-2">
                      {review.table_sessions?.table_number !== undefined && (
                        <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                          Table {review.table_sessions.table_number}
                        </span>
                      )}
                      <span>{formatDateTime(review.created_at)}</span>
                    </div>
                  </div>

                  {review.comment ? (
                    <p className="text-sm text-slate-800 leading-relaxed font-medium bg-slate-50/50 rounded-xl p-3 border border-slate-100 dark:border-zinc-800/50 flex gap-2">
                      <MessageSquare size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
                      {review.comment}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 italic">No comment left by guest.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-slate-50 border border-dashed rounded-2xl text-gray-400 dark:text-zinc-500">
          <MessageSquare size={40} className="mx-auto opacity-30 mb-3" />
          <p className="font-semibold text-gray-500 dark:text-zinc-400 dark:text-zinc-500 text-sm">No feedback yet</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Guest reviews will appear here after billing</p>
        </div>
      )}
    </div>
  );
}
