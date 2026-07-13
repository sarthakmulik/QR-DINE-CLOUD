import { TableSession, SessionItem } from "./types";

export interface AIInsight {
  type: 'growth' | 'warning' | 'opportunity' | 'info';
  message: string;
}

export function generateAdvancedInsights(
  sessions: TableSession[],
  items: SessionItem[]
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
