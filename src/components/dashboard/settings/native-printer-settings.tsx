"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { ChevronDown, Check, ChevronRight, RefreshCw, Printer, AlertCircle } from "lucide-react";
import { usePrinter } from "@/components/providers/printer-provider";

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
  const [printers, setPrinters] = useState<{ name: string; displayName?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { status: livePrinterStatus } = usePrinter();

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
          const { backgroundPrinterService } = await import("@/lib/printer-service");
          // If the user selected a different printer just now in settings, start the engine for it
          backgroundPrinterService.startEngine(currentValue);
          const success = await backgroundPrinterService.printRaw(bytes);
          if (success) {
            alert("✅ Raw print sent!");
          } else {
            alert("❌ Print failed. Printer may be offline.");
          }
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
        <div className="space-y-4 pt-2">
          {printerType === "raw" && isAndroid ? (
            <>
              {/* OpenLabel-Style My Devices */}
              <div>
                <label className="text-sm font-bold text-gray-900 dark:text-white mb-3 block">My Devices</label>
                {currentValue ? (
                  <div className="border border-gray-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-gray-50 dark:bg-zinc-800 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Printer className="w-6 h-6 text-gray-600 dark:text-zinc-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-gray-900 dark:text-white truncate max-w-[200px]">
                            {printers.find(p => p.name === currentValue)?.displayName?.split(' (')[0] || currentValue.replace(/^(ble:|spp:)/, '')}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            livePrinterStatus === "connected" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            livePrinterStatus === "connecting" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}>
                            {livePrinterStatus}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
                          <span className="font-medium text-gray-700 dark:text-zinc-300">{currentValue.startsWith('ble:') ? 'BLE' : 'SPP'}</span>
                          <span>{currentValue.replace(/^(ble:|spp:)/, '')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={testPrint} className="h-8 rounded-lg px-3">
                        Test
                      </Button>
                      <ChevronRight className="w-5 h-5 text-gray-400 opacity-50" />
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-300 dark:border-zinc-700 rounded-2xl p-6 text-center bg-gray-50 dark:bg-zinc-900/50">
                    <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-zinc-400">No device saved yet.</p>
                  </div>
                )}
              </div>

              {/* Available Devices */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-bold text-gray-900 dark:text-white">Available Devices</label>
                  <button type="button" onClick={loadPrinters} disabled={loading} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                
                {printers.length > 0 ? (
                  <div className="border border-gray-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-zinc-800">
                    {printers.filter(p => p.name !== currentValue).map((p: any) => (
                      <button
                        key={p.name}
                        type="button"
                        className="w-full text-left p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 flex items-center justify-between transition-colors"
                        onClick={() => { handleChange(p.name); alert("Device saved. Testing connection..."); testPrint(); }}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{p.displayName?.split(' (')[0] || p.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.name}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </button>
                    ))}
                    {printers.filter(p => p.name !== currentValue).length === 0 && (
                      <div className="p-6 text-center text-sm text-gray-500">No other devices found.</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 p-6 text-center">
                    <p className="text-sm font-medium text-gray-500">No available devices found</p>
                    <div className="text-xs text-gray-400 text-left max-w-sm mx-auto space-y-2 pl-4">
                      <p>1. Try searching again</p>
                      <p>2. Make sure the device is powered on</p>
                      <p>3. Ensure the printer is paired in Android Settings</p>
                      <p>4. Check that Location and Nearby Devices permissions are granted</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Desktop / HTML Dropdown Fallback */}
              <label className="text-xs font-bold text-gray-700 dark:text-zinc-300">
                {printerType === "raw" ? "Available Serial Ports" : "Available OS Printers"}
              </label>
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full flex items-center justify-between border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-sm text-left shadow-sm overflow-hidden"
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
