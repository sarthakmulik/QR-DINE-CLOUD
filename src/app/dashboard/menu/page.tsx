"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/utils";
import { Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { usePlan } from "@/lib/contexts/plan-context";
import { compressImage } from "@/lib/image";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  spicyLevel?: number | null;
  prepTime?: number;
  isVegetarian?: boolean;
  containsNuts?: boolean;
  isGlutenFree?: boolean;
  isRecommended?: boolean;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showEditCatModal, setShowEditCatModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [catName, setCatName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [itemForm, setItemForm] = useState({
    categoryId: "",
    name: "",
    description: "",
    price: "",
    imageUrl: "",
    isAvailable: true,
    spicyLevel: null as number | null,
    prepTime: 15,
    isVegetarian: false,
    containsNuts: false,
    isGlutenFree: false,
    isRecommended: false,
  });
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);

  const { currentPlan, planLimit } = usePlan();
  const maxItems = planLimit("max_menu_items");
  const totalItems = categories.reduce((sum, cat) => sum + (cat.items?.length || 0), 0);
  const limitReached = typeof maxItems === "number" && totalItems >= maxItems;

  async function loadMenu() {
    const res = await fetch("/api/hotel/menu/categories", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setCategories(data);
      sessionStorage.setItem("admin_menu_categories", JSON.stringify(data));
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_menu_categories");
    if (cached) {
      try {
        setCategories(JSON.parse(cached));
      } catch (e) {
        console.error("Failed to parse cached menu categories", e);
      }
    }
    loadMenu();
  }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const nameVal = catName.trim();
    if (!nameVal) {
      alert("Please enter a category name.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/hotel/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to add category");
        return;
      }
      setCatName("");
      setShowCatModal(false);
      loadMenu();
    } catch {
      alert("Failed to add category. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function openEditCategory(cat: Category) {
    setEditingCategory(cat);
    setEditCatName(cat.name);
    setShowEditCatModal(true);
  }

  async function updateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    const nameVal = editCatName.trim();
    if (!nameVal) {
      alert("Please enter a category name.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/menu/categories/${editingCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to update category");
        return;
      }
      setShowEditCatModal(false);
      setEditingCategory(null);
      setEditCatName("");
      loadMenu();
    } catch {
      alert("Failed to update category. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: string, name: string) {
    if (
      !confirm(
        `Are you sure you want to delete the category "${name}"?\n\nWARNING: This will permanently delete ALL menu items inside this category. This action cannot be undone.`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/menu/categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to delete category");
        return;
      }
      loadMenu();
    } catch {
      alert("Failed to delete category. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (imageError) return;

    if (!editingItem && limitReached) {
      alert("Plan limit reached. Upgrade to add more items.");
      return;
    }

    const priceVal = parseFloat(itemForm.price);
    if (isNaN(priceVal) || priceVal < 0) {
      alert("Please enter a valid price.");
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        const res = await fetch(`/api/hotel/menu/items/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...itemForm, price: priceVal }),
        });
        if (!res.ok) {
          const d = await res.json();
          alert(d.error || "Failed to update item");
          return;
        }
      } else {
        const res = await fetch("/api/hotel/menu/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...itemForm, price: priceVal }),
        });
        if (!res.ok) {
          const d = await res.json();
          alert(d.error || "Failed to add item");
          return;
        }
      }
      setShowItemModal(false);
      setEditingItem(null);
      setItemForm({
        categoryId: "",
        name: "",
        description: "",
        price: "",
        imageUrl: "",
        isAvailable: true,
        spicyLevel: null,
        prepTime: 15,
        isVegetarian: false,
        containsNuts: false,
        isGlutenFree: false,
        isRecommended: false,
      });
      setImageError("");
      loadMenu();
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/hotel/menu/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: !item.isAvailable }),
    });
    loadMenu();
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this menu item?")) return;
    await fetch(`/api/hotel/menu/items/${id}`, { method: "DELETE" });
    loadMenu();
  }

  function openAddItem(categoryId: string) {
    if (limitReached) return;
    setEditingItem(null);
    setImageError("");
    setItemForm({
      categoryId,
      name: "",
      description: "",
      price: "",
      imageUrl: "",
      isAvailable: true,
      spicyLevel: null as number | null,
      prepTime: 15,
      isVegetarian: false,
      containsNuts: false,
      isGlutenFree: false,
      isRecommended: false,
    });
    setShowItemModal(true);
  }

  function openEditItem(item: MenuItem, categoryId: string) {
    setEditingItem(item);
    setImageError("");
    setItemForm({
      categoryId,
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      imageUrl: item.imageUrl || "",
      isAvailable: item.isAvailable,
      spicyLevel: item.spicyLevel !== undefined && item.spicyLevel !== null ? item.spicyLevel : null,
      prepTime: item.prepTime ?? 15,
      isVegetarian: !!item.isVegetarian,
      containsNuts: !!item.containsNuts,
      isGlutenFree: !!item.isGlutenFree,
      isRecommended: !!item.isRecommended,
    });
    setShowItemModal(true);
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImageError("");
    if (!file) return;

    // Allow up to 5MB, since we compress on client side
    const maxSizeMB = 5;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setImageError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max allowed: ${maxSizeMB} MB.`);
      e.target.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageError("File must be an image (JPEG, PNG, WebP, etc.)");
      e.target.value = "";
      return;
    }

    setSaving(true);
    try {
      const compressed = await compressImage(file, 500, 500, 0.7);
      setItemForm((prev) => ({ ...prev, imageUrl: compressed }));
    } catch (err) {
      console.error(err);
      setImageError("Failed to compress and load image. Try another file.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Menu Management</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm flex items-center gap-2">
            Organize categories and items
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 mx-2" />
            <span className={`font-semibold ${limitReached ? "text-amber-600" : "text-slate-600"}`}>
              {totalItems} / {maxItems === "unlimited" ? "∞" : maxItems} items used
            </span>
          </p>
        </div>
        <Button onClick={() => setShowCatModal(true)} className="font-bold flex items-center gap-2 shadow-sm bg-slate-900 hover:bg-black text-white rounded-xl px-4 py-2">
          <Plus size={16} /> Add Category
        </Button>
      </div>

      {limitReached && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 text-sm animate-fade-in shadow-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Menu Item Limit Reached</p>
            <p className="text-amber-700 mt-0.5">
              You have used all {maxItems} items allowed on your {currentPlan} plan. Upgrade to a higher plan to add more items to your menu.
            </p>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 py-24 flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Plus size={32} className="text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">No Categories Yet</h3>
          <p className="text-slate-500 max-w-sm mb-6 text-sm">
            Start building your menu by adding your first category (e.g., Starters, Main Course, Beverages).
          </p>
          <Button onClick={() => setShowCatModal(true)} className="font-bold rounded-xl">
            Add First Category
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category.id} className="bg-white border border-slate-200 rounded-[1.5rem] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)] overflow-hidden group/cat transition-all duration-300">
              <div className="flex justify-between items-center p-5 bg-slate-50/50 border-b border-slate-100">
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight break-words">{category.name}</h2>
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs font-bold shrink-0">
                    {category.items?.length || 0} items
                  </span>
                </div>
                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover/cat:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditCategory(category)}
                    className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                    title="Edit Category"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteCategory(category.id, category.name)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Category"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Button
                    size="sm"
                    onClick={() => openAddItem(category.id)}
                    disabled={limitReached}
                    className="ml-2 h-8 rounded-lg text-xs font-bold"
                  >
                    <Plus size={14} className="mr-1" /> Add Item
                  </Button>
                </div>
              </div>

              <div className="p-5">
                {(!category.items || category.items.length === 0) ? (
                  <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                    <p className="text-sm font-medium">No items in this category.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {category.items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex gap-4 p-4 border border-slate-100 rounded-2xl group transition-all duration-300 hover:shadow-md hover:border-slate-200 ${
                          !item.isAvailable ? "opacity-60 bg-slate-50/50 grayscale-[50%]" : "bg-white"
                        }`}
                      >
                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 relative">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-2xl">
                              🍽️
                            </div>
                          )}
                          {!item.isAvailable && (
                            <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center backdrop-blur-[1px]">
                              <span className="text-[9px] font-black uppercase text-white bg-black/60 px-1.5 py-0.5 rounded">Out</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <h3 className="font-bold text-slate-900 leading-tight break-words min-w-0 flex-1" title={item.name}>
                                {item.name}
                              </h3>
                              <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-lg p-0.5 shadow-sm border border-slate-100">
                                <button
                                  onClick={() => openEditItem(item, category.id)}
                                  className="p-1 text-slate-400 hover:text-brand-600 rounded transition-colors"
                                  title="Edit Item"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                                  title="Delete Item"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            {item.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-snug">
                                {item.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.isVegetarian && <span className="w-3 h-3 border border-emerald-600 rounded flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div></span>}
                              {!item.isVegetarian && <span className="w-3 h-3 border border-red-600 rounded flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-red-600"></div></span>}
                              {item.isRecommended && <span className="text-xs">⭐</span>}
                              {(item.spicyLevel !== null && item.spicyLevel !== undefined) && (
                                <span className="text-[10px]">
                                  {[...Array(item.spicyLevel + 1)].map((_, i) => "🌶️").join("")}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="font-black text-brand-600 mt-2">
                            {formatINR(item.price)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* category modal */}
      <Modal
        open={showCatModal}
        onClose={() => setShowCatModal(false)}
        title="Add Category"
      >
        <form onSubmit={addCategory} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Category Name</label>
            <input
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-11"
              placeholder="e.g. Starters, Main Course"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCatModal(false)}
              className="rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="rounded-xl font-bold">
              {saving ? "Adding..." : "Add Category"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* edit category modal */}
      <Modal
        open={showEditCatModal}
        onClose={() => { setShowEditCatModal(false); setEditingCategory(null); }}
        title="Edit Category"
      >
        <form onSubmit={updateCategory} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Category Name</label>
            <input
              type="text"
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-11"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowEditCatModal(false); setEditingCategory(null); }}
              className="rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="rounded-xl font-bold">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* item modal */}
      <Modal
        open={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editingItem ? "Edit Item" : "Add Item"}
      >
        <form onSubmit={saveItem} className="space-y-5 max-h-[70vh] overflow-y-auto px-1 custom-scrollbar">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-11"
              placeholder="e.g. Paneer Tikka"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Price (₹) <span className="text-red-500">*</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.price}
                onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                className="w-full rounded-xl border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-11"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Category <span className="text-red-500">*</span></label>
              <select
                value={itemForm.categoryId}
                onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                className="w-full rounded-xl border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-11"
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Description (Optional)</label>
            <textarea
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              className="w-full rounded-xl border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Image (Optional)</label>
            {itemForm.imageUrl ? (
              <div className="relative w-full h-40 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={itemForm.imageUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setItemForm({ ...itemForm, imageUrl: "" })}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg hover:bg-red-500 transition-colors backdrop-blur-sm"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  accept="image/jpeg, image/png, image/webp"
                  onChange={handleImageFile}
                  disabled={saving}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 transition-all cursor-pointer"
                />
                {imageError && (
                  <p className="text-red-500 text-xs mt-2 font-medium bg-red-50 p-2 rounded-lg border border-red-100">{imageError}</p>
                )}
                <p className="text-[10px] text-slate-500 mt-2 font-medium">
                  JPEG, PNG, or WebP. Max 5MB. Images are automatically compressed.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50/50 rounded-xl mt-4">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2">Item Attributes</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAvailable"
                  checked={itemForm.isAvailable}
                  onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
                  className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
                />
                <label htmlFor="isAvailable" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                  Available in Stock
                </label>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isVegetarian"
                  checked={itemForm.isVegetarian}
                  onChange={(e) => setItemForm({ ...itemForm, isVegetarian: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="isVegetarian" className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-1 select-none">
                  <span className="w-3 h-3 border border-emerald-600 rounded flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div></span>
                  Vegetarian
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isGlutenFree"
                  checked={itemForm.isGlutenFree}
                  onChange={(e) => setItemForm({ ...itemForm, isGlutenFree: e.target.checked })}
                  className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
                />
                <label htmlFor="isGlutenFree" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                  🌾 Gluten Free
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="containsNuts"
                  checked={itemForm.containsNuts}
                  onChange={(e) => setItemForm({ ...itemForm, containsNuts: e.target.checked })}
                  className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
                />
                <label htmlFor="containsNuts" className="text-sm font-bold text-slate-700 cursor-pointer select-none">
                  🥜 Contains Nuts
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isRecommended"
                checked={itemForm.isRecommended}
                onChange={(e) => setItemForm({ ...itemForm, isRecommended: e.target.checked })}
                className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="isRecommended" className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-1 select-none">
                ⭐ Chef&apos;s Recommendation / Signature
              </label>
            </div>

            {/* Spice Level */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">Spice Intensity</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { level: null, label: "None 🚫" },
                  { level: 0, label: "Mild 🌶️" },
                  { level: 1, label: "Med 🌶️🌶️" },
                  { level: 2, label: "Hot 🌶️🌶️🌶️" }
                ].map((opt) => (
                  <button
                    key={opt.level ?? "none"}
                    type="button"
                    onClick={() => setItemForm({ ...itemForm, spicyLevel: opt.level })}
                    className={`py-2 px-1 text-[10px] text-center font-bold rounded-xl border transition-all ${
                      itemForm.spicyLevel === opt.level
                        ? "bg-brand-50 border-brand-500 text-brand-700 shadow-sm"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preparation Time */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex justify-between items-center text-xs font-black text-slate-500 uppercase tracking-wider">
                <span>Preparation Time</span>
                <span className="text-brand-600">{itemForm.prepTime} mins</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={itemForm.prepTime}
                  onChange={(e) => setItemForm({ ...itemForm, prepTime: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowItemModal(false)}
              className="rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !!imageError} className="rounded-xl font-bold bg-brand-600 hover:bg-brand-700 text-white">
              {saving ? "Saving..." : editingItem ? "Save Changes" : "Add Item"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
