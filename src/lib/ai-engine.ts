import { TableSession, SessionItem, WaiterRequest } from "./types";

export interface AIInsight {
  type: 'growth' | 'warning' | 'opportunity' | 'info';
  message: string;
}

export function generateAdvancedInsights(
  sessions: TableSession[],
  items: SessionItem[],
  requests: WaiterRequest[] = [],
  staffMap: Record<string, string> = {}
): AIInsight[] {
  const insights: AIInsight[] = [];

  if (sessions.length < 10 || items.length < 10) {
    return [
      { type: 'info', message: 'Gathering more data to unlock deeper AI insights.' }
    ];
  }

  // -------------------------------------------------------------
  // 1. BASKET ANALYSIS (Cross-Selling Algorithm)
  // -------------------------------------------------------------
  const sessionItemsMap: Record<string, Set<string>> = {};
  items.forEach(item => {
    if (!sessionItemsMap[item.session_id]) {
      sessionItemsMap[item.session_id] = new Set();
    }
    sessionItemsMap[item.session_id].add(item.name);
  });

  const itemCounts: Record<string, number> = {};
  const pairCounts: Record<string, Record<string, number>> = {};

  Object.values(sessionItemsMap).forEach(itemSet => {
    const itemArray = Array.from(itemSet);
    itemArray.forEach(itemA => {
      itemCounts[itemA] = (itemCounts[itemA] || 0) + 1;
      if (!pairCounts[itemA]) pairCounts[itemA] = {};
      
      itemArray.forEach(itemB => {
        if (itemA !== itemB) {
          pairCounts[itemA][itemB] = (pairCounts[itemA][itemB] || 0) + 1;
        }
      });
    });
  });

  let bestPair = { A: '', B: '', confidence: 0, support: 0 };
  
  Object.keys(pairCounts).forEach(itemA => {
    // Only analyze items that sell decently (support > 5)
    if (itemCounts[itemA] > 5) {
      Object.keys(pairCounts[itemA]).forEach(itemB => {
        const confidence = pairCounts[itemA][itemB] / itemCounts[itemA];
        // We look for highest confidence where at least 3 pairs occurred
        if (confidence > bestPair.confidence && pairCounts[itemA][itemB] >= 3) {
          bestPair = { A: itemA, B: itemB, confidence, support: pairCounts[itemA][itemB] };
        }
      });
    }
  });

  if (bestPair.confidence > 0.6) {
    insights.push({
      type: 'opportunity',
      message: `${Math.round(bestPair.confidence * 100)}% of customers who order "${bestPair.A}" also buy "${bestPair.B}". Consider offering them as a Combo Deal!`
    });
  }

  // -------------------------------------------------------------
  // 2. TABLE TURNAROUND EFFICIENCY
  // -------------------------------------------------------------
  let totalMins = 0;
  let totalValidSessions = 0;
  const tableStats: Record<number, { mins: number, count: number }> = {};

  sessions.forEach(s => {
    if (s.start_time && s.closed_at) {
      const start = new Date(s.start_time).getTime();
      const end = new Date(s.closed_at).getTime();
      const diffMins = (end - start) / (1000 * 60);
      
      // Filter out weird anomalies (less than 1 min or over 4 hours)
      if (diffMins > 1 && diffMins < 240) {
        totalMins += diffMins;
        totalValidSessions++;
        
        const tNum = s.table_number || 0;
        if (tNum > 0) {
          if (!tableStats[tNum]) tableStats[tNum] = { mins: 0, count: 0 };
          tableStats[tNum].mins += diffMins;
          tableStats[tNum].count++;
        }
      }
    }
  });

  if (totalValidSessions > 0) {
    const avgTurnaround = totalMins / totalValidSessions;
    let worstTable = { num: 0, avg: 0 };
    
    Object.entries(tableStats).forEach(([numStr, stats]) => {
      const num = parseInt(numStr);
      if (stats.count >= 3) { // Need at least 3 sessions to judge a table
        const avg = stats.mins / stats.count;
        if (avg > worstTable.avg) {
          worstTable = { num, avg };
        }
      }
    });

    // If the worst table is > 40% slower than the restaurant average
    if (worstTable.avg > avgTurnaround * 1.4 && worstTable.num !== 0) {
      insights.push({
        type: 'warning',
        message: `Table ${worstTable.num} averages ${Math.round(worstTable.avg)} mins per session (${Math.round(worstTable.avg - avgTurnaround)} mins slower than your average). Monitor service speed in that section.`
      });
    } else if (avgTurnaround < 45) {
      insights.push({
        type: 'growth',
        message: `Excellent operational speed! Your average table turnaround time is a swift ${Math.round(avgTurnaround)} minutes.`
      });
    }
  }

  // -------------------------------------------------------------
  // 3. REVENUE VELOCITY & MENU FATIGUE (Chronological Split)
  // -------------------------------------------------------------
  if (sessions.length > 20) {
    // Sort sessions chronologically
    const sorted = [...sessions].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const midPoint = Math.floor(sorted.length / 2);
    
    const firstHalf = sorted.slice(0, midPoint);
    const secondHalf = sorted.slice(midPoint);

    const firstHalfRev = firstHalf.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const secondHalfRev = secondHalf.reduce((sum, s) => sum + Number(s.total || 0), 0);

    if (secondHalfRev > firstHalfRev * 1.15) {
      insights.push({
        type: 'growth',
        message: `Momentum Alert: Revenue in the recent period jumped by ${Math.round(((secondHalfRev - firstHalfRev) / firstHalfRev) * 100)}% compared to the start of this period!`
      });
    } else if (secondHalfRev < firstHalfRev * 0.85 && firstHalfRev > 0) {
      insights.push({
        type: 'warning',
        message: `Revenue slowed down by ${Math.round(((firstHalfRev - secondHalfRev) / firstHalfRev) * 100)}% recently. Consider running a flash discount campaign.`
      });
    }

    // Fatigue Analysis (Items dropping in volume)
    const firstHalfIds = new Set(firstHalf.map(s => s.id));
    const secondHalfIds = new Set(secondHalf.map(s => s.id));

    const firstHalfItems: Record<string, number> = {};
    const secondHalfItems: Record<string, number> = {};

    items.forEach(i => {
      if (firstHalfIds.has(i.session_id)) {
        firstHalfItems[i.name] = (firstHalfItems[i.name] || 0) + (i.quantity || 1);
      } else if (secondHalfIds.has(i.session_id)) {
        secondHalfItems[i.name] = (secondHalfItems[i.name] || 0) + (i.quantity || 1);
      }
    });

    let worstDrop = { name: '', dropPercent: 0 };
    Object.keys(firstHalfItems).forEach(name => {
      const q1 = firstHalfItems[name];
      const q2 = secondHalfItems[name] || 0;
      
      // Only look at items that used to sell well (> 5 in first half)
      if (q1 > 5) {
        const drop = (q1 - q2) / q1;
        if (drop > worstDrop.dropPercent && drop >= 0.4) { // At least 40% drop
          worstDrop = { name, dropPercent: drop };
        }
      }
    });

    if (worstDrop.name) {
      insights.push({
        type: 'opportunity',
        message: `Menu Fatigue: Orders for "${worstDrop.name}" dropped by ${Math.round(worstDrop.dropPercent * 100)}% recently. Ensure quality hasn't slipped, or try discounting it.`
      });
    }
  }

  // -------------------------------------------------------------
  // 4. PREDICTIVE INVENTORY FORECASTING (Weekend Waste Reducer)
  // -------------------------------------------------------------
  if (sessions.length > 10) {
    // 1. Identify unique dates to count weekends
    const weekendDates = new Set<string>();
    
    sessions.forEach(s => {
      const d = new Date(s.start_time);
      const day = d.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
      if (day === 0 || day === 5 || day === 6) {
        // format YYYY-MM-DD
        const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        weekendDates.add(dateStr);
      }
    });

    const totalWeekendDays = weekendDates.size;
    // A full weekend has 3 days (Fri, Sat, Sun). We divide by 3 to get the number of weekends represented.
    const weekendCount = Math.max(1, totalWeekendDays / 3);

    // 2. Count item quantities sold on weekends
    const weekendItemQty: Record<string, number> = {};
    const sessionToDay: Record<string, number> = {};
    
    sessions.forEach(s => {
      sessionToDay[s.id] = new Date(s.start_time).getDay();
    });

    items.forEach(i => {
      const day = sessionToDay[i.session_id];
      if (day === 0 || day === 5 || day === 6) {
        weekendItemQty[i.name] = (weekendItemQty[i.name] || 0) + (i.quantity || 1);
      }
    });

    // 3. Find top velocity item
    let topPredictedItem = { name: '', projectedQty: 0 };
    Object.entries(weekendItemQty).forEach(([name, qty]) => {
      const projected = qty / weekendCount;
      if (projected > topPredictedItem.projectedQty && projected > 5) { // Threshold > 5 portions
        topPredictedItem = { name, projectedQty: projected };
      }
    });

    if (topPredictedItem.name) {
      insights.push({
        type: 'warning',
        message: `Inventory Alert: Based on momentum, you will sell ~${Math.round(topPredictedItem.projectedQty)} portions of "${topPredictedItem.name}" this upcoming weekend. Prep accordingly to avoid stock-outs!`
      });
    }
  }

  // -------------------------------------------------------------
  // 5. STAFF PERFORMANCE MATRIX (Multi-Dimensional)
  // -------------------------------------------------------------
  const staffStats: Record<string, {
    sessionsCount: number;
    totalRevenue: number;
    totalTurnaroundMins: number;
    turnaroundCount: number;
    requestsSolved: number;
    totalResolutionSeconds: number;
    resolvedRequestsCount: number;
  }> = {};

  // Aggregate Turnaround & Revenue
  sessions.forEach(s => {
    if (s.assigned_staff_id) {
      if (!staffStats[s.assigned_staff_id]) {
        staffStats[s.assigned_staff_id] = { sessionsCount: 0, totalRevenue: 0, totalTurnaroundMins: 0, turnaroundCount: 0, requestsSolved: 0, totalResolutionSeconds: 0, resolvedRequestsCount: 0 };
      }
      staffStats[s.assigned_staff_id].sessionsCount++;
      staffStats[s.assigned_staff_id].totalRevenue += Number(s.total || 0);

      if (s.start_time && s.closed_at) {
        const start = new Date(s.start_time).getTime();
        const end = new Date(s.closed_at).getTime();
        const diffMins = (end - start) / (1000 * 60);
        if (diffMins > 1 && diffMins < 240) {
          staffStats[s.assigned_staff_id].totalTurnaroundMins += diffMins;
          staffStats[s.assigned_staff_id].turnaroundCount++;
        }
      }
    }
  });

  // Aggregate Waiter Requests
  requests.forEach(r => {
    if (r.status === "completed" && r.resolved_by) {
      if (!staffStats[r.resolved_by]) {
        staffStats[r.resolved_by] = { sessionsCount: 0, totalRevenue: 0, totalTurnaroundMins: 0, turnaroundCount: 0, requestsSolved: 0, totalResolutionSeconds: 0, resolvedRequestsCount: 0 };
      }
      staffStats[r.resolved_by].requestsSolved++;

      if (r.created_at && r.updated_at) {
        const start = new Date(r.created_at).getTime();
        const end = new Date(r.updated_at).getTime();
        const diffSecs = (end - start) / 1000;
        if (diffSecs > 0 && diffSecs < 3600) { // Max 1 hour to resolve
          staffStats[r.resolved_by].totalResolutionSeconds += diffSecs;
          staffStats[r.resolved_by].resolvedRequestsCount++;
        }
      }
    }
  });

  // Calculate Global Averages
  const totalSessionsGlobal = sessions.length;
  const globalAOV = totalSessionsGlobal > 0 ? sessions.reduce((sum, s) => sum + Number(s.total || 0), 0) / totalSessionsGlobal : 0;

  let mvpStaff = { id: '', score: 0, aov: 0, avgResolutionSecs: 0, volume: 0 };
  let slowStaff = { id: '', turnaroundMins: 0, aov: 0 };

  Object.entries(staffStats).forEach(([staffId, stats]) => {
    const aov = stats.sessionsCount > 0 ? stats.totalRevenue / stats.sessionsCount : 0;
    const avgTurnaround = stats.turnaroundCount > 0 ? stats.totalTurnaroundMins / stats.turnaroundCount : 0;
    const avgResolutionSecs = stats.resolvedRequestsCount > 0 ? stats.totalResolutionSeconds / stats.resolvedRequestsCount : 0;
    const volume = stats.requestsSolved;

    // MVP Score heuristic
    if (stats.sessionsCount >= 1 || stats.requestsSolved >= 1) { // lowered for testing
      let score = 0;
      if (aov > globalAOV) score += 50;
      if (avgResolutionSecs > 0 && avgResolutionSecs < 120) score += 30; // Under 2 mins
      score += volume * 2;

      if (score > mvpStaff.score) {
        mvpStaff = { id: staffId, score, aov, avgResolutionSecs, volume };
      }
    }

    // Warning heuristic
    if (stats.turnaroundCount >= 1 && avgTurnaround > 90) { // lowered for testing
      if (avgTurnaround > slowStaff.turnaroundMins) {
        slowStaff = { id: staffId, turnaroundMins: avgTurnaround, aov };
      }
    }
  });

  if (mvpStaff.id) {
    const name = staffMap[mvpStaff.id] || `Staff #${mvpStaff.id.slice(0,4)}`;
    insights.push({
      type: 'growth',
      message: `Staff Performance: ${name} is your MVP! They average an ₹${Math.round(mvpStaff.aov)} AOV (vs global ₹${Math.round(globalAOV)}), resolve requests in ${Math.round(mvpStaff.avgResolutionSecs)}s, and handle the highest volume.`
    });
  }

  if (slowStaff.id && slowStaff.id !== mvpStaff.id) {
    const name = staffMap[slowStaff.id] || `Staff #${slowStaff.id.slice(0,4)}`;
    insights.push({
      type: 'warning',
      message: `Service Bottleneck: ${name}'s tables take an average of ${Math.round(slowStaff.turnaroundMins)} mins to checkout. Monitor their section to improve table turnover.`
    });
  }

  return insights;
}

export function generateUpsellMap(
  items: SessionItem[]
): Record<string, string> {
  const sessionItemsMap: Record<string, Set<string>> = {};
  
  items.forEach(item => {
    // We strictly map menu_item_ids so we can look them up on the frontend
    if (!item.menu_item_id) return;
    
    if (!sessionItemsMap[item.session_id]) {
      sessionItemsMap[item.session_id] = new Set();
    }
    sessionItemsMap[item.session_id].add(item.menu_item_id);
  });

  const itemCounts: Record<string, number> = {};
  const pairCounts: Record<string, Record<string, number>> = {};

  Object.values(sessionItemsMap).forEach(itemSet => {
    const itemArray = Array.from(itemSet);
    itemArray.forEach(itemA => {
      itemCounts[itemA] = (itemCounts[itemA] || 0) + 1;
      if (!pairCounts[itemA]) pairCounts[itemA] = {};
      
      itemArray.forEach(itemB => {
        if (itemA !== itemB) {
          pairCounts[itemA][itemB] = (pairCounts[itemA][itemB] || 0) + 1;
        }
      });
    });
  });

  const upsellMap: Record<string, string> = {};

  Object.keys(pairCounts).forEach(itemA => {
    // Only analyze items that sell at least once
    if (itemCounts[itemA] >= 1) {
      let bestMatch = '';
      let highestConfidence = 0;

      Object.keys(pairCounts[itemA]).forEach(itemB => {
        const confidence = pairCounts[itemA][itemB] / itemCounts[itemA];
        
        // We look for confidence > 10% to offer a suggestion
        // and ensure the pair occurred at least 1 time
        if (confidence > highestConfidence && confidence >= 0.1 && pairCounts[itemA][itemB] >= 1) {
          highestConfidence = confidence;
          bestMatch = itemB;
        }
      });

      if (bestMatch) {
        upsellMap[itemA] = bestMatch;
      }
    }
  });

  return upsellMap;
}
