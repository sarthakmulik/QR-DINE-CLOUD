"use client";

import { useState } from "react";
import type { RawMaterial, MenuItem, Recipe } from "@/lib/types";
import { addRawMaterial, restockMaterial, updateRecipe } from "./actions";
import { Plus, PackagePlus, AlertTriangle, ChefHat, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InventoryClient({ 
  rawMaterials, 
  menuItems, 
  recipes 
}: { 
  rawMaterials: RawMaterial[], 
  menuItems: MenuItem[],
  recipes: Recipe[]
}) {
  const [activeTab, setActiveTab] = useState<"materials" | "recipes">("materials");
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", unit: "kg", current_stock: 0, min_stock_alert: 0 });

  // Recipe Builder State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [recipeEdits, setRecipeEdits] = useState<{raw_material_id: string, quantity_used: number}[]>([]);

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

    const res = await restockMaterial(id, amount);
    if (!res.success) alert(res.error);
  };

  const openRecipeEditor = (item: MenuItem) => {
    setSelectedMenuItem(item);
    const existing = recipes.filter(r => r.menu_item_id === item.id);
    setRecipeEdits(existing.map(r => ({ raw_material_id: r.raw_material_id, quantity_used: r.quantity_used })));
  };

  const saveRecipe = async () => {
    if (!selectedMenuItem) return;
    setLoading(true);
    const res = await updateRecipe(selectedMenuItem.id, recipeEdits);
    setLoading(false);
    if (res.success) {
      setSelectedMenuItem(null);
    } else {
      alert(res.error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex bg-gray-100 dark:bg-zinc-900 p-1 rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab("materials")} 
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "materials" ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
        >
          Raw Materials
        </button>
        <button 
          onClick={() => setActiveTab("recipes")} 
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "recipes" ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow" : "text-gray-500 hover:text-gray-700"}`}
        >
          Menu Recipes (BOM)
        </button>
      </div>

      {activeTab === "materials" && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900 dark:text-white">All Materials</h2>
            <Button onClick={() => setIsAdding(!isAdding)} variant="secondary" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Material
            </Button>
          </div>

          {isAdding && (
            <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 border-b border-gray-100 dark:border-zinc-800">
              <form onSubmit={handleAdd} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-lg border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm" placeholder="e.g. Flour" />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-500 mb-1">Unit</label>
                  <select value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full rounded-lg border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm">
                    <option value="kg">kg</option>
                    <option value="grams">grams</option>
                    <option value="liters">liters</option>
                    <option value="ml">ml</option>
                    <option value="pieces">pieces</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-500 mb-1">Stock</label>
                  <input type="number" step="0.01" required value={formData.current_stock} onChange={e => setFormData({...formData, current_stock: parseFloat(e.target.value)})} className="w-full rounded-lg border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm" />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-500 mb-1">Alert At</label>
                  <input type="number" step="0.01" required value={formData.min_stock_alert} onChange={e => setFormData({...formData, min_stock_alert: parseFloat(e.target.value)})} className="w-full rounded-lg border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm" />
                </div>
                <Button type="submit" disabled={loading}>Save</Button>
              </form>
            </div>
          )}

          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {rawMaterials.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No raw materials configured yet.</div>
            ) : rawMaterials.map(rm => (
              <div key={rm.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition">
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    {rm.name}
                    {Number(rm.current_stock) <= Number(rm.min_stock_alert) && (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                  </span>
                  <span className="text-sm text-gray-500">Alert when below {rm.min_stock_alert} {rm.unit}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className={`font-bold text-lg ${Number(rm.current_stock) <= Number(rm.min_stock_alert) ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                      {rm.current_stock} <span className="text-sm font-medium text-gray-500">{rm.unit}</span>
                    </div>
                  </div>
                  <Button onClick={() => handleRestock(rm.id)} variant="secondary" size="sm">
                    <PackagePlus className="w-4 h-4 mr-1.5" />
                    Restock
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "recipes" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm h-[600px] flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-zinc-800">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search menu items..." 
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {menuItems
                .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(item => {
                  const hasRecipe = recipes.some(r => r.menu_item_id === item.id);
                  return (
                    <button 
                      key={item.id}
                      onClick={() => openRecipeEditor(item)}
                      className={`w-full text-left p-3 rounded-xl mb-1 transition flex items-center justify-between ${selectedMenuItem?.id === item.id ? "bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/30" : "hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent"}`}
                    >
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">{item.name}</div>
                        <div className="text-xs text-gray-500">₹{item.price}</div>
                      </div>
                      {hasRecipe ? (
                        <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">Mapped</span>
                      ) : (
                        <span className="bg-gray-100 dark:bg-zinc-800 text-gray-500 text-[10px] px-2 py-0.5 rounded-full font-bold">No Recipe</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="md:col-span-2">
            {selectedMenuItem ? (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm flex flex-col h-[600px]">
                <div className="p-6 border-b border-gray-100 dark:border-zinc-800 bg-brand-500/5">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ChefHat className="text-brand-500" />
                    Recipe for {selectedMenuItem.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Configure ingredients deducted when this item is sold.</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {recipeEdits.length === 0 ? (
                    <div className="text-center text-gray-400 py-12">
                      <p>No ingredients mapped yet.</p>
                    </div>
                  ) : (
                    recipeEdits.map((edit, idx) => {
                      const mat = rawMaterials.find(m => m.id === edit.raw_material_id);
                      return (
                        <div key={idx} className="flex items-center gap-4 bg-gray-50 dark:bg-zinc-800/50 p-4 rounded-xl">
                          <div className="flex-1">
                            <select 
                              value={edit.raw_material_id} 
                              onChange={(e) => {
                                const newEdits = [...recipeEdits];
                                newEdits[idx].raw_material_id = e.target.value;
                                setRecipeEdits(newEdits);
                              }}
                              className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg p-2 text-sm"
                            >
                              <option value="" disabled>Select Raw Material...</option>
                              {rawMaterials.map(rm => (
                                <option key={rm.id} value={rm.id}>{rm.name} ({rm.unit})</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-32 flex items-center gap-2">
                            <input 
                              type="number" 
                              step="0.01"
                              value={edit.quantity_used}
                              onChange={(e) => {
                                const newEdits = [...recipeEdits];
                                newEdits[idx].quantity_used = parseFloat(e.target.value) || 0;
                                setRecipeEdits(newEdits);
                              }}
                              className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg p-2 text-sm"
                            />
                            <span className="text-xs text-gray-500 w-8">{mat?.unit}</span>
                          </div>
                          <button onClick={() => setRecipeEdits(recipeEdits.filter((_, i) => i !== idx))} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                  
                  <Button 
                    variant="secondary" 
                    className="w-full border-dashed"
                    onClick={() => setRecipeEdits([...recipeEdits, { raw_material_id: rawMaterials[0]?.id || "", quantity_used: 1 }])}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Ingredient
                  </Button>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setSelectedMenuItem(null)}>Cancel</Button>
                  <Button onClick={saveRecipe} disabled={loading || recipeEdits.some(e => !e.raw_material_id)}>
                    Save Recipe
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-zinc-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800 flex flex-col items-center justify-center h-[600px] text-gray-400">
                <ChefHat className="w-12 h-12 mb-4 opacity-20" />
                <p>Select a menu item from the left to build its recipe.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
