"use client";

import { useState } from "react";
import { openShift, closeShift, logPettyCash } from "./actions";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { Lock, Unlock, Banknote, History } from "lucide-react";

export function RegisterClient({ activeRegister, pastRegisters }: { activeRegister: any, pastRegisters: any[] }) {
  const [loading, setLoading] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);

  const handleOpen = async () => {
    setLoading(true);
    const res = await openShift(openingBalance);
    setLoading(false);
    if (res.error) alert(res.error);
  };

  const handleClose = async () => {
    if (!window.confirm("Are you sure you want to close this shift?")) return;
    setLoading(true);
    const res = await closeShift(activeRegister.id, closingBalance);
    setLoading(false);
    if (res.error) alert(res.error);
  };

  const handlePettyCash = async (type: "cash_in" | "cash_out") => {
    const amount = parseFloat(prompt(`Enter amount for ${type === 'cash_in' ? 'Cash In' : 'Cash Out'}:`) || "0");
    if (!amount || amount <= 0) return;
    const reason = prompt("Enter reason:");
    if (!reason) return;

    setLoading(true);
    const res = await logPettyCash(activeRegister.id, amount, reason, type);
    setLoading(false);
    if (res.error) alert(res.error);
  };

  if (!activeRegister) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl p-8 max-w-md mx-auto text-center space-y-6">
        <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto text-gray-400">
          <Lock className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Register Closed</h2>
          <p className="text-gray-500 dark:text-zinc-400 mt-1">Open a shift to start processing cash transactions.</p>
        </div>
        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 text-left mb-1">Opening Float (Cash in Drawer)</label>
            <input 
              type="number" 
              value={openingBalance}
              onChange={e => setOpeningBalance(parseFloat(e.target.value))}
              className="w-full bg-gray-50 dark:bg-zinc-800 border-none rounded-lg px-4 py-3 text-lg font-bold"
            />
          </div>
          <Button onClick={handleOpen} disabled={loading} className="w-full h-12 text-lg">
            <Unlock className="w-5 h-5 mr-2" /> Open Shift
          </Button>
        </div>
      </div>
    );
  }

  // Calculate realtime expected
  let expected = Number(activeRegister.opening_balance);
  activeRegister.logs?.forEach((log: any) => {
    if (log.type === "cash_in" || log.type === "sale") expected += Number(log.amount);
    if (log.type === "cash_out" || log.type === "refund") expected -= Number(log.amount);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Active Register Summary */}
        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Unlock className="w-32 h-32 text-emerald-500" />
          </div>
          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">Shift is Open</h2>
                <p className="text-emerald-700 dark:text-emerald-400 text-sm">Opened at {new Date(activeRegister.opened_at).toLocaleTimeString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium uppercase tracking-wider">Expected Cash</p>
                <p className="text-3xl font-black text-emerald-900 dark:text-emerald-50">{formatINR(expected)}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => handlePettyCash("cash_in")} variant="secondary" className="bg-white/50 dark:bg-zinc-900/50">
                + Petty Cash In
              </Button>
              <Button onClick={() => handlePettyCash("cash_out")} variant="secondary" className="bg-white/50 dark:bg-zinc-900/50">
                - Petty Cash Out
              </Button>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-zinc-800 font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-gray-400" /> Transaction Logs
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-zinc-800/50 text-gray-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              <tr>
                <td className="px-4 py-3 font-medium">{new Date(activeRegister.opened_at).toLocaleTimeString()}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">OPENING FLOAT</span></td>
                <td className="px-4 py-3 text-gray-500">-</td>
                <td className="px-4 py-3 text-right font-bold">{formatINR(activeRegister.opening_balance)}</td>
              </tr>
              {activeRegister.logs?.map((log: any) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 font-medium">{new Date(log.created_at).toLocaleTimeString()}</td>
                  <td className="px-4 py-3 uppercase text-xs font-bold text-gray-500">{log.type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-zinc-300">{log.reason || '-'}</td>
                  <td className={`px-4 py-3 text-right font-bold ${log.type === 'cash_out' ? 'text-red-500' : 'text-emerald-500'}`}>
                    {log.type === 'cash_out' ? '-' : '+'}{formatINR(log.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-6">
        {/* Close Shift Card */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Close Shift</h3>
            <p className="text-sm text-gray-500 mt-1">Reconcile the physical cash in your drawer to generate the Z-Report.</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Physical Cash (Counted)</label>
            <input 
              type="number" 
              value={closingBalance}
              onChange={e => setClosingBalance(parseFloat(e.target.value))}
              className="w-full bg-gray-50 dark:bg-zinc-800 border-none rounded-lg px-4 py-3 text-lg font-bold"
            />
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 flex justify-between items-center text-sm font-bold">
            <span className="text-gray-500">Discrepancy</span>
            <span className={closingBalance - expected < 0 ? "text-red-500" : closingBalance - expected > 0 ? "text-emerald-500" : "text-gray-500"}>
              {formatINR(closingBalance - expected)}
            </span>
          </div>

          <Button onClick={handleClose} disabled={loading} variant="danger" className="w-full">
            <Lock className="w-4 h-4 mr-2" /> End Shift (Z-Report)
          </Button>
        </div>
      </div>
    </div>
  );
}

