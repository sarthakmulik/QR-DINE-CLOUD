"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { backgroundPrinterService, PrinterStatus } from "@/lib/printer-service";

interface PrinterContextType {
  status: PrinterStatus;
  printRaw: (bytes: Uint8Array) => Promise<boolean>;
}

const PrinterContext = createContext<PrinterContextType>({
  status: "idle",
  printRaw: async () => false,
});

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PrinterStatus>("idle");

  useEffect(() => {
    // Polling mechanism to auto-start the engine as soon as the profile is loaded asynchronously.
    // [C-4 FIX] We stop polling once startEngine() is called instead of running forever.
    // [H-5 FIX] We also detect when the user switches to a different printer in Settings.
    const checkProfileInterval = setInterval(() => {
      const cached = sessionStorage.getItem("admin_profile");
      if (cached) {
        try {
          const profile = JSON.parse(cached);
          const printerType = profile.customizations?.printerType;
          const mac = profile.customizations?.bluetoothPrinterMac;
          
          if (printerType === "raw" && mac) {
            const currentMac = backgroundPrinterService.getCurrentMac();
            const currentStatus = backgroundPrinterService.getStatus();

            if (currentMac !== mac) {
              // MAC changed (user switched printer) or first-time start — (re)start the engine.
              // startEngine internally calls stopEngine() on MAC mismatch.
              backgroundPrinterService.startEngine(mac);
            } else if (currentStatus === "idle") {
              // Same MAC but engine somehow stopped (e.g. after a stopEngine call) — restart it.
              backgroundPrinterService.startEngine(mac);
            } else {
              // Engine is running for the correct MAC — no need to keep polling.
              clearInterval(checkProfileInterval);
            }
          }
        } catch (e) {}
      }
    }, 2000);

    const unsubscribe = backgroundPrinterService.subscribe(setStatus);
    return () => {
      clearInterval(checkProfileInterval);
      unsubscribe();
    };
  }, []);

  return (
    <PrinterContext.Provider
      value={{
        status,
        printRaw: (bytes) => backgroundPrinterService.printRaw(bytes),
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
}

export function usePrinter() {
  return useContext(PrinterContext);
}
