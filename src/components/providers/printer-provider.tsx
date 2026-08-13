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
    // Polling mechanism to auto-start the engine as soon as the profile is loaded asynchronously
    const checkProfileInterval = setInterval(() => {
      const cached = sessionStorage.getItem("admin_profile");
      if (cached) {
        try {
          const profile = JSON.parse(cached);
          const printerType = profile.customizations?.printerType;
          const mac = profile.customizations?.bluetoothPrinterMac;
          
          if (printerType === "raw" && mac && backgroundPrinterService.getStatus() === "idle") {
            backgroundPrinterService.startEngine(mac);
          }
        } catch (e) {}
      }
    }, 2000);

    const unsubscribe = backgroundPrinterService.subscribe(setStatus);
    return () => {
      clearInterval(checkProfileInterval);
      unsubscribe();
      // Optionally stop engine on unmount, but usually we want it persistent 
      // across the whole app lifecycle
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
