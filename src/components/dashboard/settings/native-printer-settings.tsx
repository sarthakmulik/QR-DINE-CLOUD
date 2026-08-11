"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";

// Use dynamic import for bluetooth serial to avoid SSR issues
let BluetoothSerial: any;
if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
  import("@ascentio-it/capacitor-bluetooth-serial").then((mod) => {
    BluetoothSerial = mod.BluetoothSerial;
  }).catch(console.error);
}

export function NativePrinterSettings({
  form,
  setForm,
}: {
  form: any;
  setForm: (v: any) => void;
}) {
  const [printers, setPrinters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const printerType = form.customizations?.printerType || "html";
  const isDesktop = typeof window !== "undefined" && !!(window as any).electronAPI;
  const isAndroid = typeof window !== "undefined" && Capacitor.isNativePlatform();

  const loadPrinters = useCallback(async () => {
    setLoading(true);
    setPrinters([]);
    try {
      if (isDesktop) {
        if (printerType === "raw") {
          const ports = await (window as any).electronAPI.getSerialPorts();
          setPrinters(ports.map((p: any) => ({ name: p.path, displayName: `${p.path} (${p.friendlyName || "Serial Port"})` })));
        } else {
          const list = await (window as any).electronAPI.getPrinters();
          setPrinters(list || []);
        }
      } else if (isAndroid) {
        if (printerType === "raw") {
          if (!BluetoothSerial) {
            console.error("BluetoothSerial not loaded yet");
            return;
          }
          const isEnabled = await BluetoothSerial.isEnabled();
          if (!isEnabled) {
            alert("Please enable Bluetooth first.");
            return;
          }
          const devices = await BluetoothSerial.list();
          setPrinters(devices.map((d: any) => ({ name: d.address, displayName: `${d.name || "Unknown"} (${d.address})` })));
        }
      }
    } catch (e) {
      console.error("Failed to load printers:", e);
    } finally {
      setLoading(false);
    }
  }, [printerType, isDesktop, isAndroid]);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  if (!isDesktop && !isAndroid) {
    return null;
  }

  const currentValue =
    printerType === "raw" && isAndroid
      ? form.customizations?.bluetoothPrinterMac || ""
      : form.customizations?.desktopPrinter || "";

  function handleChange(val: string) {
    if (printerType === "raw" && isAndroid) {
      setForm({ ...form, customizations: { ...form.customizations, bluetoothPrinterMac: val } });
    } else {
      setForm({ ...form, customizations: { ...form.customizations, desktopPrinter: val } });
    }
  }

  async function testPrint() {
    try {
      if (printerType === "html" && isDesktop) {
        const res = await (window as any).electronAPI.testPrint(currentValue);
        if (res.success) alert("✅ Test print sent!");
        else alert("❌ Print failed: " + res.error);
      } else if (printerType === "raw") {
        const { generateRawEscPos } = await import("@/lib/esc-pos-encoder");
        const dummyData = {
          session: {
            id: "TEST-123",
            tableNumber: 1,
            startTime: new Date().toISOString(),
            subtotal: 100,
            discountAmount: 0,
            discountPercent: 0,
            taxAmount: 5,
            total: 105,
          },
          items: [{ id: "1", name: "Test Item", price: 100, quantity: 1 }],
          hotel: { name: "Test Hotel", taxRate: 5, cgst: 2.5, sgst: 2.5 },
          table: { label: "Table 1" }
        };
        const bytes = generateRawEscPos(dummyData as any, form.customizations?.printerSize || "80mm");

        if (isDesktop) {
          if (!currentValue) return alert("Select a COM port first.");
          const res = await (window as any).electronAPI.printRaw(bytes, currentValue);
          if (res.success) alert("✅ Raw print sent!");
          else alert("❌ Print failed: " + res.error);
        } else if (isAndroid) {
          if (!currentValue) return alert("Select a Bluetooth printer first.");
          alert("Connecting to printer...");
          await BluetoothSerial.connect({ address: currentValue });
          // Convert Uint8Array to string for the plugin
          let strValue = "";
          for (let i = 0; i < bytes.length; i++) {
            strValue += String.fromCharCode(bytes[i]);
          }
          await BluetoothSerial.write({ address: currentValue, value: strValue });
          await BluetoothSerial.disconnect({ address: currentValue });
          alert("✅ Raw print sent!");
        }
      }
    } catch (e: any) {
      alert("❌ Test print failed: " + e.message);
      if (isAndroid && printerType === "raw" && currentValue) {
        BluetoothSerial?.disconnect({ address: currentValue }).catch(() => {});
      }
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-800 space-y-4">
      <div>
        <h4 className="text-sm font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
          {isAndroid ? "Android Native Printing" : "Desktop Native Printing"}
          <span className="bg-emerald-100 text-emerald-800 text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">Active</span>
        </h4>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
          Configure how background printing works on this device.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setForm({ ...form, customizations: { ...form.customizations, printerType: "html" } })}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            printerType === "html"
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300"
          }`}
        >
          <div className="font-bold text-sm">Standard (HTML)</div>
          <div className="text-xs mt-0.5 opacity-70">Uses generic OS print spooler</div>
        </button>
        <button
          type="button"
          onClick={() => setForm({ ...form, customizations: { ...form.customizations, printerType: "raw" } })}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            printerType === "raw"
              ? "border-brand-500 bg-brand-50 text-brand-700"
              : "border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300"
          }`}
        >
          <div className="font-bold text-sm">Raw ESC/POS</div>
          <div className="text-xs mt-0.5 opacity-70">{isAndroid ? "Bluetooth Thermal Printers" : "Serial COM Ports"}</div>
        </button>
      </div>

      {printerType === "html" && isAndroid && (
        <p className="text-xs text-amber-600">Standard HTML printing uses the default Android print dialog. It requires a WiFi/Network printer with native Android drivers.</p>
      )}

      {!(printerType === "html" && isAndroid) && (
        <div className="space-y-2 pt-2">
          <label className="text-xs font-bold text-gray-700 dark:text-zinc-300">
            {printerType === "raw" ? (isAndroid ? "Paired Bluetooth Printers" : "Available Serial Ports") : "Available OS Printers"}
          </label>
          <div className="flex gap-2 items-center">
            <select
              value={currentValue}
              onChange={(e) => handleChange(e.target.value)}
              className="flex-1 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
            >
              <option value="">{printerType === "raw" ? "Select device..." : "Use Default OS Printer"}</option>
              {printers.map((p: any) => (
                <option key={p.name} value={p.name}>
                  {p.displayName || p.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={loadPrinters} disabled={loading}>
              {loading ? "Scanning..." : "↻ Refresh"}
            </Button>
            <Button type="button" variant="secondary" onClick={testPrint}>
              Test Print
            </Button>
          </div>
          {printerType === "raw" && isAndroid && (
            <p className="text-xs text-gray-500">Pair your printer in Android Settings first, then click Refresh.</p>
          )}
        </div>
      )}
    </div>
  );
}
