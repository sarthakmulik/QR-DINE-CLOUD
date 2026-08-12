"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { ChevronDown, Check } from "lucide-react";

let BluetoothSerial: any;
let BleClient: any;
if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
  import("@ascentio-it/capacitor-bluetooth-serial").then((mod) => {
    BluetoothSerial = mod.BluetoothSerial;
  }).catch(console.error);
  import("@capacitor-community/bluetooth-le").then((mod) => {
    BleClient = mod.BleClient;
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
          if (!BluetoothSerial || !BleClient) {
            console.error("Bluetooth plugins not loaded yet");
            return;
          }
          
          try {
            // This triggers native Location and Nearby Devices permission prompts
            await BleClient.initialize();
            
            const isLocationEnabled = await BleClient.isLocationEnabled();
            if (!isLocationEnabled) {
              await BleClient.openLocationSettings();
              await new Promise(r => setTimeout(r, 2000));
            }
          } catch (e) {
            console.warn("BLE initialize failed (permissions denied?)", e);
          }
          
          let devices: any[] = [];
          const seenMacs = new Set();
          
          const addDevice = (d: any, type: string) => {
            if (!seenMacs.has(d.address)) {
              seenMacs.add(d.address);
              devices.push({
                name: `${type}:${d.address}`, // Prefix MAC with type to route printing
                displayName: `${d.name || "Unknown"} [${type.toUpperCase()}] (${d.address})`
              });
            }
          };
          
          try {
            const paired = await BluetoothSerial.getPairedDevices();
            if (paired && paired.devices) {
              for (const d of paired.devices) addDevice(d, "spp");
            }
          } catch (e) {
            console.warn("Failed to get paired SPP devices", e);
          }
          
          try {
            // Concurrent Live Scan: BLE and SPP
            const bleScanned: any[] = [];
            
            // Start BLE Scan
            const blePromise = BleClient.requestLEScan({}, (result: any) => {
              if (result.device && result.device.name) {
                bleScanned.push({ address: result.device.deviceId, name: result.device.name });
              }
            }).catch((e: any) => console.warn("BLE scan error", e));
            
            // Start SPP Scan
            const sppPromise = BluetoothSerial.scan().catch((e: any) => {
              console.warn("SPP live scan error", e);
              return { devices: [] };
            });
            
            // Wait 4 seconds for discovery
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            await BleClient.stopLEScan().catch(() => {});
            
            const sppResult = await sppPromise;
            
            // Merge SPP
            if (sppResult && sppResult.devices) {
              for (const d of sppResult.devices) addDevice(d, "spp");
            }
            // Merge BLE
            for (const d of bleScanned) addDevice(d, "ble");
            
          } catch (e) {
            console.warn("Hybrid live scan failed", e);
          }
          
          setPrinters(devices);
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
          const { executeAndroidBluetoothPrint } = await import("@/lib/bill-generator");
          await executeAndroidBluetoothPrint(bytes, currentValue);
          alert("✅ Raw print sent!");
        }
      }
    } catch (e: any) {
      alert("❌ Test print failed: " + e.message);
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
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-sm text-left shadow-sm"
              >
                <span className="truncate pr-2">
                  {currentValue 
                    ? (printers.find(p => p.name === currentValue)?.displayName || currentValue)
                    : (printerType === "raw" ? "Select device..." : "Use Default OS Printer")}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
              </button>
              
              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto py-1">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                      onClick={() => { handleChange(""); setIsDropdownOpen(false); }}
                    >
                      <span className="opacity-70">{printerType === "raw" ? "Select device..." : "Use Default OS Printer"}</span>
                      {currentValue === "" && <Check className="w-4 h-4 text-brand-500" />}
                    </button>
                    {printers.map((p: any) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                        onClick={() => { handleChange(p.name); setIsDropdownOpen(false); }}
                      >
                        <span className="truncate pr-2">{p.displayName || p.name}</span>
                        {currentValue === p.name && <Check className="w-4 h-4 text-brand-500" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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
