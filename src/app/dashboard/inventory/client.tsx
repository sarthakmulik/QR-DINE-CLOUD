"use client";

import { useState } from "react";
import type { RawMaterial } from "@/lib/types";
import { addRawMaterial, restockMaterial } from "./actions";
import { Plus, PackagePlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InventoryClient({ rawMaterials }: { rawMaterials: RawMaterial[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", unit: "kg", current_stock: 0, min_stock_alert: 0 });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await addRawMaterial(formData);
    setLoading(false);
    if (res.success) {
      setIsAdding(false);
      setFormData({ name: "", unit: "kg", current_stock: 0, min_stock_alert: 0 });
    } else {
      alert(res.error);
    }
  };

  const handleRestock = async (id: string) => {
    const amountStr = prompt("Enter amount to add:");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return alert("Invalid amount");

    setLoading(true);
    const res = await restockMaterial(id, amount);
    setLoading(false);
    if (res.error) alert(res.error);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setIsAdding(!isAdding)} variant="secondary" className="gap-2">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 p-6 rounded-xl space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-white">New Raw Material</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 dark:bg-zinc-800 border-none rounded-lg px-3 py-2 text-sm" placeholder="e.g. Flour" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unit</label>
              <select value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full bg-gray-50 dark:bg-zinc-800 border-none rounded-lg px-3 py-2 text-sm outline-none">
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Current Stock</label>
              <input required type="number" step="0.01" min="0" value={formData.current_stock} onChange={e => setFormData({...formData, current_stock: parseFloat(e.target.value)})} className="w-full bg-gray-50 dark:bg-zinc-800 border-none rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min Stock Alert</label>
              <input required type="number" step="0.01" min="0" value={formData.min_stock_alert} onChange={e => setFormData({...formData, min_stock_alert: parseFloat(e.target.value)})} className="w-full bg-gray-50 dark:bg-zinc-800 border-none rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>Save</Button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-zinc-800/50 text-gray-500 dark:text-zinc-400 font-medium">
            <tr>
              <th className="px-6 py-4">Ingredient</th>
              <th className="px-6 py-4">Stock</th>
              <th className="px-6 py-4">Unit</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {rawMaterials.map(rm => {
              const isLow = Number(rm.current_stock) <= Number(rm.min_stock_alert);
              return (
                <tr key={rm.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">{rm.name}</td>
                  <td className="px-6 py-4 font-mono text-gray-600 dark:text-zinc-300">{Number(rm.current_stock).toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-zinc-400">{rm.unit}</td>
                  <td className="px-6 py-4">
                    {isLow ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <AlertTriangle className="w-3 h-3" /> Low Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Good
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleRestock(rm.id)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                      <PackagePlus className="w-4 h-4" />
                      Restock
                    </button>
                  </td>
                </tr>
              );
            })}
            {rawMaterials.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-zinc-400">
                  No inventory items found. Add your first raw material.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

