"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Plus, Download, RefreshCw, Copy, Check, ShieldAlert, Pencil, Trash2 } from "lucide-react";
import { usePlan } from "@/lib/contexts/plan-context";

interface TableData {
  id: string;
  tableNumber: number;
  label: string;
  qrCodeUrl: string | null;
}

export default function TablesPage() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTable, setEditingTable] = useState<TableData | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [label, setLabel] = useState("");
  const [editTableNumber, setEditTableNumber] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { currentPlan, planLimit } = usePlan();
  const maxTables = planLimit("max_tables");
  const totalTables = tables.length;
  const limitReached = typeof maxTables === "number" && totalTables >= maxTables;

  const isSkeletons = loading && tables.length === 0;

  async function loadTables() {
    try {
      const res = await fetch("/api/hotel/tables", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTables(data);
        sessionStorage.setItem("admin_tables_list", JSON.stringify(data));
      }
    } catch (e) {
      console.error("Failed to load tables:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const cached = sessionStorage.getItem("admin_tables_list");
    if (cached) {
      try {
        setTables(JSON.parse(cached));
        setLoading(false);
      } catch (e) {
        console.error("Failed to parse cached tables list:", e);
      }
    }
    loadTables();
  }, []);

  async function createTable(e: React.FormEvent) {
    e.preventDefault();
    if (limitReached) {
      alert("Plan limit reached. Upgrade to add more tables.");
      return;
    }

    const res = await fetch("/api/hotel/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableNumber: parseInt(tableNumber),
        label: label || `Table ${tableNumber}`,
      }),
    });
    if (res.ok) {
      setShowModal(false);
      setTableNumber("");
      setLabel("");
      loadTables();
    } else {
      const errData = await res.json();
      alert(errData.error || "Failed to create table. Number may already exist.");
    }
  }

  async function regenerateQR(table: TableData) {
    setRegenerating(table.id);
    try {
      const res = await fetch(`/api/hotel/tables/${table.id}/regenerate-qr`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        // Update state locally
        setTables((prev) =>
          prev.map((t) => (t.id === table.id ? { ...t, qrCodeUrl: data.qrCodeUrl } : t))
        );
        // Also sync the sessionStorage cache!
        const cached = sessionStorage.getItem("admin_tables_list");
        if (cached) {
          try {
            const list = JSON.parse(cached) as TableData[];
            const updatedList = list.map((t) =>
              t.id === table.id ? { ...t, qrCodeUrl: data.qrCodeUrl } : t
            );
            sessionStorage.setItem("admin_tables_list", JSON.stringify(updatedList));
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to regenerate QR code: ${data.error || res.statusText}`);
      }
    } catch (err) {
      alert("Failed to regenerate QR code due to a network error.");
    } finally {
      setRegenerating(null);
    }
  }

  function downloadQR(table: TableData) {
    if (!table.qrCodeUrl) return;
    const link = document.createElement("a");
    link.href = table.qrCodeUrl;
    link.download = `table-${table.tableNumber}-qr.png`;
    link.click();
  }

  function openEditTable(table: TableData) {
    setEditingTable(table);
    setEditTableNumber(String(table.tableNumber));
    setEditLabel(table.label);
    setShowEditModal(true);
  }

  async function updateTable(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTable) return;

    const numVal = parseInt(editTableNumber);
    if (isNaN(numVal) || numVal <= 0) {
      alert("Please enter a valid table number.");
      return;
    }

    try {
      const res = await fetch(`/api/hotel/tables/${editingTable.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: numVal,
          label: editLabel,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        // Update local state
        setTables((prev) =>
          prev.map((t) => (t.id === editingTable.id ? updated : t))
        );
        // Sync cache
        const cached = sessionStorage.getItem("admin_tables_list");
        if (cached) {
          try {
            const list = JSON.parse(cached) as TableData[];
            const updatedList = list.map((t) => (t.id === editingTable.id ? updated : t));
            sessionStorage.setItem("admin_tables_list", JSON.stringify(updatedList));
          } catch (e) {
            console.error(e);
          }
        }
        setShowEditModal(false);
        setEditingTable(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update table.");
      }
    } catch {
      alert("Something went wrong while updating table.");
    }
  }

  async function deleteTable(id: string, label: string) {
    if (
      !confirm(
        `Are you sure you want to delete "${label}"?\n\nWARNING: This will permanently delete all active sessions, checkout history, and order logs for this table. This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/hotel/tables/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // Update state and cache
        setTables((prev) => prev.filter((t) => t.id !== id));
        const cached = sessionStorage.getItem("admin_tables_list");
        if (cached) {
          try {
            const list = JSON.parse(cached) as TableData[];
            const updatedList = list.filter((t) => t.id !== id);
            sessionStorage.setItem("admin_tables_list", JSON.stringify(updatedList));
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete table.");
      }
    } catch {
      alert("Something went wrong while deleting table.");
    }
  }

  async function copyUrl(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  // Extract the dine URL from the QR data URL isn't possible, so fetch it from env
  function getDineUrl(tableNumber: number) {
    // This will be the APP_URL-based URL — same as what's in the QR
    const origin = window.location.origin;
    return `${origin}/dine/[hotelId]/${tableNumber}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Table QR Codes
            <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
              {currentPlan}
            </span>
          </h1>
          <p className="text-gray-500 text-sm flex items-center gap-1.5 mt-1">
            Generate unique QR codes for each table
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className={`font-semibold ${limitReached ? "text-amber-600" : "text-gray-600"}`}>
              {totalTables} / {maxTables === "unlimited" ? "∞" : maxTables} tables used
            </span>
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} disabled={limitReached}>
          <Plus className="w-4 h-4 mr-1" /> Add Table
        </Button>
      </div>

      {limitReached && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 text-sm animate-fade-in">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Table Limit Reached</p>
            <p className="text-amber-700 mt-0.5">
              You have used all {maxTables} tables allowed on your {currentPlan} plan. Upgrade to a higher plan to generate more QR codes.
            </p>
          </div>
        </div>
      )}



      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {isSkeletons ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-5 text-center animate-pulse flex flex-col justify-between h-80">
              <div className="h-6 bg-slate-200 rounded w-24 mx-auto mb-3" />
              <div className="w-40 h-40 bg-slate-100 rounded mx-auto mb-3" />
              <div className="h-4 bg-slate-100 rounded w-16 mx-auto mb-3" />
              <div className="space-y-2 mt-auto">
                <div className="h-8 bg-slate-150 rounded w-full" />
                <div className="h-8 bg-slate-150 rounded w-full" />
              </div>
            </div>
          ))
        ) : (
          tables.map((table) => (
            <div
              key={table.id}
              className="bg-white rounded-xl border p-5 text-center animate-fade-in relative group"
            >
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEditTable(table)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition"
                  title="Edit Table"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteTable(table.id, table.label || `Table ${table.tableNumber}`)}
                  className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition"
                  title="Delete Table"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <h3 className="font-semibold text-lg mb-3 pr-8 truncate" title={table.label}>{table.label}</h3>
              {table.qrCodeUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={table.qrCodeUrl}
                    alt={`QR for ${table.label}`}
                    className="w-48 h-48 mx-auto"
                  />
                </>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Table #{table.tableNumber}
              </p>
              <div className="flex flex-col gap-2 mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadQR(table)}
                  disabled={!table.qrCodeUrl}
                >
                  <Download className="w-4 h-4 mr-1" /> Download QR
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => regenerateQR(table)}
                  disabled={regenerating === table.id}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-1 ${
                      regenerating === table.id ? "animate-spin" : ""
                    }`}
                  />
                  {regenerating === table.id ? "Regenerating..." : "Regenerate QR"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {!isSkeletons && tables.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Add your first table to generate QR codes
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Table">
        <form onSubmit={createTable} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Table Number</label>
            <input
              type="number"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              required
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Label (optional)
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Table ${tableNumber || "?"}`}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <Button type="submit" className="w-full">Create Table & QR</Button>
        </form>
      </Modal>

      <Modal open={showEditModal} onClose={() => { setShowEditModal(false); setEditingTable(null); }} title="Edit Table">
        <form onSubmit={updateTable} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Table Number</label>
            <input
              type="number"
              value={editTableNumber}
              onChange={(e) => setEditTableNumber(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              required
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Label</label>
            <input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              placeholder={`Table ${editTableNumber || "?"}`}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>
          <Button type="submit" className="w-full">Update Table</Button>
        </form>
      </Modal>
    </div>
  );
}
