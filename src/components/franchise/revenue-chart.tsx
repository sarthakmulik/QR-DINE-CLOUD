"use client";

import { useTheme } from "next-themes";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { formatINR } from "@/lib/utils";

interface RevenueChartProps {
  data: {
    name: string;
    revenue: number;
    orders: number;
  }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const { theme } = useTheme();
  
  const isDark = theme === "dark";
  const textColor = isDark ? "#A1A1AA" : "#71717A"; // zinc-400 / zinc-500
  const gridColor = isDark ? "#27272A" : "#F4F4F5"; // zinc-800 / zinc-100
  const tooltipBg = isDark ? "#18181B" : "#FFFFFF"; // zinc-900 / white
  const tooltipBorder = isDark ? "#27272A" : "#E4E4E7"; // zinc-800 / zinc-200

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div 
          className="p-3 rounded-lg shadow-lg border"
          style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder }}
        >
          <p className="font-bold text-sm mb-2" style={{ color: isDark ? "#F4F4F5" : "#18181B" }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs font-medium">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span style={{ color: textColor }}>{entry.name}:</span>
              <span style={{ color: isDark ? "#F4F4F5" : "#18181B" }}>
                {entry.name === "Revenue" ? formatINR(entry.value) : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis 
            dataKey="name" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: textColor, fontSize: 11 }}
            dy={10}
          />
          <YAxis 
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: textColor, fontSize: 11 }}
            tickFormatter={(value) => `₹${value / 1000}k`}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fill: textColor, fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? '#27272A' : '#F4F4F5' }} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          <Bar yAxisId="left" dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={isDark ? "#818CF8" : "#6366F1"} /> // Indigo
            ))}
          </Bar>
          <Bar yAxisId="right" dataKey="orders" name="Orders" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={isDark ? "#34D399" : "#10B981"} /> // Emerald
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
