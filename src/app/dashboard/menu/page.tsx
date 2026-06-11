"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/utils";
import { Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { usePlan } from "@/lib/contexts/plan-context";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [catName, setCatName] = useState("");
  const [itemForm, setItemForm] = useState({
    categoryId: "",
    name: "",
    description: "",
    price: "",
    imageUrl: "",
  });
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);

  const { currentPlan, planLimit } = usePlan();
  const maxItems = planLimit("max_menu_items");
  const totalItems = categories.reduce((sum, cat) => sum + (cat.items?.length || 0), 0);
  const limitReached = typeof maxItems === "number" && totalItems >= maxItems;

  async function loadMenu() {
    const res = await fetch("/api/hotel/menu/categories");
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
    await fetch("/api/hotel/menu/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName }),
    });
    setCatName("");
    setShowCatModal(false);
    loadMenu();
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
      setItemForm({ categoryId: "", name: "", description: "", price: "", imageUrl: "" });
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
    setItemForm({ categoryId, name: "", description: "", price: "", imageUrl: "" });
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
    });
    setShowItemModal(true);
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImageError("");
    if (!file) return;

    // Section 11: Client-side image validation
    const maxSizeMB = 2;
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

    const reader = new FileReader();
    reader.onload = (ev) => {
      setItemForm((prev) => ({ ...prev, imageUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Menu Management
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              {currentPlan}
            </span>
          </h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-1">
            Categories and menu items
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className={`font-semibold ${limitReached ? "text-amber-600" : "text-gray-600"}`}>
              {totalItems} / {maxItems === "unlimited" ? "∞" : maxItems} items used
            </span>
          </p>
        </div>
        <Button onClick={() => setShowCatModal(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Category
        </Button>
      </div>

      {limitReached && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 text-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Menu Item Limit Reached</p>
            <p className="text-amber-700 mt-0.5">
              You have used all {maxItems} menu items allowed on your {currentPlan} plan. Upgrade to a higher plan to add more items.
            </p>
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} className="bg-white rounded-xl border p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{cat.name}</h2>
            <div className="flex items-center gap-2">
              {limitReached && (
                <span className="text-xs text-amber-600 font-semibold hidden md:inline">Limit reached</span>
              )}
              <Button
                size="sm"
                variant={limitReached ? "ghost" : "secondary"}
                disabled={limitReached}
                onClick={() => openAddItem(cat.id)}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            {cat.items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 p-3 rounded-lg border ${
                  !item.isAvailable ? "opacity-50" : ""
                }`}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">
                    🍽️
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  {item.description && (
                    <p className="text-sm text-gray-500">{item.description}</p>
                  )}
                  <p className="text-brand-600 font-semibold mt-1">
                    {formatINR(item.price)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAvailable(item)}
                    className={`text-xs px-2 py-1 rounded-full ${
                      item.isAvailable
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {item.isAvailable ? "Available" : "Unavailable"}
                  </button>
                  <button onClick={() => openEditItem(item, cat.id)}>
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                  <button onClick={() => deleteItem(item.id)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
            {cat.items.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                No items in this category
              </p>
            )}
          </div>
        </div>
      ))}

      {categories.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Start by adding a menu category
        </div>
      )}

      <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title="Add Category">
        <form onSubmit={addCategory} className="space-y-4">
          <input
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Category name (e.g. Starters)"
            className="w-full border rounded-lg px-3 py-2"
            required
          />
          <Button type="submit" className="w-full">Add Category</Button>
        </form>
      </Modal>

      <Modal
        open={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editingItem ? "Edit Item" : "Add Menu Item"}
      >
        <form onSubmit={saveItem} className="space-y-3">
          <input
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="Item name"
            className="w-full border rounded-lg px-3 py-2"
            required
          />
          <textarea
            value={itemForm.description}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Description"
            className="w-full border rounded-lg px-3 py-2"
            rows={2}
          />
          <input
            type="number"
            step="0.01"
            min="0"
            value={itemForm.price}
            onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
            placeholder="Price (INR)"
            className="w-full border rounded-lg px-3 py-2"
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageFile}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-brand-50 file:text-brand-700"
            />
            {imageError && (
              <p className="text-xs text-red-600">{imageError}</p>
            )}
            {!imageError && itemForm.imageUrl && (
              <img
                src={itemForm.imageUrl}
                alt="preview"
                className="w-24 h-24 rounded-lg object-cover border mt-1"
              />
            )}
            <input
              value={itemForm.imageUrl.startsWith("data:") ? "" : itemForm.imageUrl}
              onChange={(e) => { setImageError(""); setItemForm({ ...itemForm, imageUrl: e.target.value }); }}
              placeholder="Or paste image URL (optional)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving || !!imageError}>
            {saving ? "Saving..." : (editingItem ? "Update Item" : "Add Item")}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
