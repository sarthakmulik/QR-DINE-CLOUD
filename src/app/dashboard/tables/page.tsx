"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Edit2, Plus, RefreshCw, Trash2, ShieldAlert, Download, Copy, Check, Info, Pencil } from "lucide-react";
import { usePlan } from "@/lib/contexts/plan-context";
import QRCode from "qrcode";
import DynamicQRCode, { DynamicQRCodeRef } from "@/components/dashboard/DynamicQRCode";

interface TableData {
  id: string;
  tableNumber: number;
  label: string;
  qrCodeUrl: string | null;
  dineUrl?: string | null;
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

  const { currentPlan, planLimit, serviceType, hotelId, hotelLogo } = usePlan();
  const maxTables = planLimit("max_tables");
  const totalTables = tables.length;
  const limitReached = typeof maxTables === "number" && totalTables >= maxTables;

  const [genericQrCode, setGenericQrCode] = useState<string | null>(null);
  const [genericDineUrl, setGenericDineUrl] = useState<string>("");
  
  const qrRefs = useRef<{ [key: string]: DynamicQRCodeRef | null }>({});
  const genericQrRef = useRef<DynamicQRCodeRef>(null);

  const isSkeletons = loading && tables.length === 0;

  useEffect(() => {
    if (serviceType === "quick_service" && hotelId) {
      let baseDineUrl = typeof window !== "undefined" ? `${window.location.origin}/dine/${hotelId}` : "";
      
      // Fetch token if secure QR is enabled
      fetch("/api/hotel/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.secureQr && data.quickServiceToken) {
            baseDineUrl += `?t=${data.quickServiceToken}`;
          }
          setGenericDineUrl(baseDineUrl);
          return QRCode.toDataURL(baseDineUrl, { width: 400, margin: 2 });
        })
        .then((url) => setGenericQrCode(url))
        .catch(console.error);
    }
  }, [serviceType, hotelId]);

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
    if (serviceType === "quick_service") {
      setLoading(false);
      return;
    }
    loadTables();
  }, [serviceType]);

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
          prev.map((t) => (t.id === table.id ? { ...t, qrCodeUrl: data.qrCodeUrl, dineUrl: data.dineUrl } : t))
        );
        // Also sync the sessionStorage cache!
        const cached = sessionStorage.getItem("admin_tables_list");
        if (cached) {
          try {
            const list = JSON.parse(cached) as TableData[];
            const updatedList = list.map((t) =>
              t.id === table.id ? { ...t, qrCodeUrl: data.qrCodeUrl, dineUrl: data.dineUrl } : t
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
    if (!table.dineUrl) return;
    qrRefs.current[table.id]?.download(`table-${table.tableNumber}-qr`, "png");
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
    const safeUrl = url.replace(/[\r\n\x00-\x1F\x7F]/g, "");
    await navigator.clipboard.writeText(safeUrl);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  // getDineUrl is intentionally removed — use table.dineUrl from the API response
  // which is pre-generated with the correct hotel ID by the server.

  if (serviceType === "quick_service") {
    return (
      <div className="space-y-6 animate-page-entrance">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store QR Code</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">
            Your restaurant is set to Quick Service mode. Use this generic QR code for all orders.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-zinc-800 flex flex-col items-center justify-center max-w-lg mx-auto mt-10">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 dark:border-zinc-800/50 mb-6">
            {genericDineUrl ? (
              <DynamicQRCode ref={genericQrRef} url={genericDineUrl} width={256} height={256} logo={hotelLogo || undefined} />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-slate-400">
                <RefreshCw className="animate-spin" size={32} />
              </div>
            )}
          </div>
          <div className="flex gap-4 w-full mt-6">
            <Button
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold h-12"
              onClick={() => {
                if (genericDineUrl) {
                  genericQrRef.current?.download("store-qr-code", "png");
                }
              }}
            >
              <Download size={18} className="mr-2" /> Download QR
            </Button>
            <Button
              variant="secondary"
              className="flex-1 font-bold h-12"
              onClick={() => copyUrl(genericDineUrl, "generic")}
            >
              {copied === "generic" ? <Check size={18} className="mr-2 text-emerald-600" /> : <Copy size={18} className="mr-2" />}
              {copied === "generic" ? "Copied!" : "Copy Link"}
            </Button>
          </div>
          <div className="mt-6 w-full pt-6 border-t border-slate-100 dark:border-zinc-800/50 flex justify-between items-center">
             <div>
                <h4 className="font-bold text-slate-800 text-sm">Regenerate QR</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">Invalidate old QR codes and generate a new one.</p>
             </div>
             <Button
               variant="ghost"
               onClick={async () => {
                 if (!confirm("Are you sure? Old QR codes will stop working.")) return;
                 try {
                   const res = await fetch("/api/hotel/quick-service/regenerate-qr", { method: "POST" });
                   if (res.ok) {
                     const data = await res.json();
                     setGenericQrCode(data.qrCodeUrl);
                     setGenericDineUrl(data.dineUrl);
                     alert("QR Code Regenerated successfully!");
                   } else {
                     alert("Failed to regenerate QR");
                   }
                 } catch (e) {
                   alert("Error regenerating QR");
                 }
               }}
               className="text-red-600 hover:text-red-700 hover:bg-red-50"
             >
               Regenerate
             </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-page-entrance">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tables & QR Codes</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">
            Manage your restaurant tables and generate order QR codes
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 mx-2" />
            <span className={`font-semibold ${limitReached ? "text-amber-600" : "text-slate-600"}`}>
              {totalTables} / {maxTables === "unlimited" ? "∞" : maxTables} tables used
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={loadTables}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            disabled={limitReached}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white"
          >
            <Plus size={16} />
            Add Table
          </Button>
        </div>
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

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isSkeletons ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-zinc-800 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/3 mb-2"></div>
              <div className="h-6 bg-slate-200 rounded w-2/3 mb-4"></div>
              <div className="aspect-square bg-slate-100 rounded-xl mb-4"></div>
              <div className="flex gap-2">
                <div className="h-8 bg-slate-200 rounded w-full"></div>
                <div className="h-8 bg-slate-200 rounded w-full"></div>
              </div>
            </div>
          ))
        ) : tables.length > 0 ? (
          tables.map((table) => (
            <div
              key={table.id}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-zinc-800 hover:shadow-md transition-all duration-300 group flex flex-col h-full relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Table</div>
                  <h3 className="font-black text-xl text-slate-900 tracking-tight leading-none mt-0.5">
                    {table.tableNumber}
                  </h3>
                  <div className="text-xs text-slate-500 font-medium mt-1 truncate max-w-[120px] h-4" title={table.label}>
                    {table.label !== `Table ${table.tableNumber}` ? table.label : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditTable(table)}
                    className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteTable(table.id, table.label)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100 dark:border-zinc-800/50 relative group/qr">
                {regenerating === table.id ? (
                  <div className="flex flex-col items-center justify-center h-32 space-y-3">
                    <RefreshCw className="animate-spin text-brand-500" size={24} />
                    <span className="text-xs font-bold text-slate-500 animate-pulse">Generating...</span>
                  </div>
                ) : table.dineUrl ? (
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <DynamicQRCode
                      ref={(el) => {
                        qrRefs.current[table.id] = el;
                      }}
                      url={table.dineUrl}
                      width={128}
                      height={128}
                      logo={hotelLogo || undefined}
                      className="transition-transform group-hover/qr:scale-105"
                    />
                    <div className="absolute inset-0 bg-white/80 opacity-0 group-hover/qr:opacity-100 flex flex-col items-center justify-center transition-all backdrop-blur-sm rounded-lg gap-2 z-10">
                      <button
                        onClick={() => downloadQR(table)}
                        className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 shadow-md transform hover:scale-110 transition-all"
                        title="Download QR"
                      >
                        <Download size={14} />
                      </button>
                      {table.dineUrl && (
                        <button
                          onClick={() => copyUrl(table.dineUrl!, table.id)}
                          className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-black shadow-md transform hover:scale-110 transition-all"
                          title="Copy Link"
                        >
                          {copied === table.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-slate-400">
                    <ShieldAlert size={32} className="opacity-20" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => regenerateQR(table)}
                  disabled={regenerating === table.id}
                  className="w-full text-xs font-bold h-9"
                >
                  <RefreshCw size={14} className="mr-1.5" />
                  Regenerate
                </Button>
                {table.qrCodeUrl && (
                  <Button
                    size="sm"
                    onClick={() => downloadQR(table)}
                    className="w-full text-xs font-bold bg-slate-900 hover:bg-black text-white h-9"
                  >
                    <Download size={14} className="mr-1.5" />
                    Save
                  </Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-slate-300 dark:border-zinc-700 py-20 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Plus size={32} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No Tables Yet</h3>
            <p className="text-slate-500 max-w-sm mb-6 text-sm">
              Add your first restaurant table to generate a QR code for your guests to scan.
            </p>
            <Button onClick={() => setShowModal(true)} className="font-bold">
              Add First Table
            </Button>
          </div>
        )}
      </div>

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
