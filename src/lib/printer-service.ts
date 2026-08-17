import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export type PrinterStatus = "idle" | "connecting" | "connected" | "error";

class PrinterService {
  private status: PrinterStatus = "idle";
  private listeners: Set<(status: PrinterStatus) => void> = new Set();
  private currentMacWithPrefix: string | null = null;
  private isAndroid: boolean = false;
  private checkInterval: any = null;
  private isConnectingLock: boolean = false;
  private printQueue: Uint8Array[] = [];
  private isFlushing: boolean = false;
  // [C-2 FIX] Flag to detect if stopEngine() was called while connectLoop is awaiting
  private engineRunning: boolean = false;

  constructor() {
    this.isAndroid = typeof window !== "undefined" && Capacitor.isNativePlatform();
    
    if (this.isAndroid) {
      App.addListener("appStateChange", async ({ isActive }) => {
        if (isActive && this.currentMacWithPrefix && this.engineRunning) {
          this.connectLoop();
        }
      });
    }
  }

  public subscribe(listener: (status: PrinterStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(newStatus: PrinterStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.listeners.forEach(l => l(newStatus));
    }
  }

  public getStatus() {
    return this.status;
  }

  public getCurrentMac() {
    return this.currentMacWithPrefix;
  }

  public async startEngine(macWithPrefix: string) {
    if (!this.isAndroid || !macWithPrefix) return;
    
    // If already managing this exact printer, just return
    if (this.currentMacWithPrefix === macWithPrefix && (this.status === "connected" || this.status === "connecting")) {
      return;
    }

    // [H-5 FIX] If switching to a different printer, stop the old engine first
    if (this.currentMacWithPrefix && this.currentMacWithPrefix !== macWithPrefix) {
      this.stopEngine();
    }

    this.currentMacWithPrefix = macWithPrefix;
    this.engineRunning = true;
    this.connectLoop();
  }

  private async connectLoop() {
    if (!this.currentMacWithPrefix || !this.isAndroid) return;

    if (this.checkInterval) clearInterval(this.checkInterval);

    const tryConnect = async () => {
      if (!this.currentMacWithPrefix || this.isConnectingLock || !this.engineRunning) return;
      this.isConnectingLock = true;
      try {
        this.setStatus("connecting");
        
        let isBle = false;
        let mac = this.currentMacWithPrefix;
        if (mac.startsWith("ble:")) {
          isBle = true;
          mac = mac.replace("ble:", "");
        } else if (mac.startsWith("spp:")) {
          isBle = false;
          mac = mac.replace("spp:", "");
        }

        if (isBle) {
          const { BleClient } = await import("@capacitor-community/bluetooth-le");
          await BleClient.initialize();
          
          const connectedDevices = await BleClient.getConnectedDevices([]);
          if (connectedDevices.some(d => d.deviceId === mac)) {
             this.setStatus("connected");
             this.isConnectingLock = false;
             this.flushQueue();
             return;
          }
          
          await BleClient.connect(mac, (deviceId) => {
            if (this.currentMacWithPrefix?.includes(deviceId)) {
              this.setStatus("error");
            }
          });
          this.setStatus("connected");
          this.flushQueue();
        } else {
          const { BluetoothSerial } = await import("@ascentio-it/capacitor-bluetooth-serial");
          try {
             await BluetoothSerial.connect({ address: mac });
             this.setStatus("connected");
             this.flushQueue();
          } catch (e: any) {
             if (e && typeof e === 'string' && e.toLowerCase().includes("already connected")) {
                this.setStatus("connected");
                this.flushQueue();
             } else {
                throw e;
             }
          }
        }
      } catch (err) {
        console.warn("Background printer connection failed:", err);
        this.setStatus("error");
      } finally {
        this.isConnectingLock = false;
      }
    };

    // Initial connection attempt
    await tryConnect();

    // [C-2 FIX] Only create interval if engine is still supposed to be running.
    // stopEngine() may have been called while tryConnect was awaiting a slow BT handshake.
    if (!this.engineRunning) return;

    this.checkInterval = setInterval(async () => {
      if (!this.engineRunning) {
        clearInterval(this.checkInterval);
        return;
      }
      if (this.status === "error" || this.status === "idle") {
        await tryConnect();
      } else if (this.status === "connected" && this.printQueue.length > 0) {
        this.flushQueue();
      }
    }, 10000);
  }

  private async flushQueue() {
    if (this.isFlushing || this.printQueue.length === 0 || this.status !== "connected") return;
    this.isFlushing = true;
    
    try {
      while (this.printQueue.length > 0) {
        if (this.status !== "connected") break;
        const bytes = this.printQueue[0];
        const success = await this.executeRawPrint(bytes);
        if (success) {
          this.printQueue.shift();
          await new Promise(r => setTimeout(r, 1000));
        } else {
          break;
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  public async printRaw(bytes: Uint8Array): Promise<boolean> {
    if (!this.isAndroid || !this.currentMacWithPrefix) return false;

    // [C-3 FIX] Fast path ONLY when connected AND no flush in progress AND queue is empty.
    // Prevents interleaving new bytes with an active flush (corrupted merged receipt).
    if (this.status === "connected" && !this.isFlushing && this.printQueue.length === 0) {
      const success = await this.executeRawPrint(bytes);
      if (success) return true;
    }
    
    // Disconnected or flush in progress — push to queue
    this.printQueue.push(bytes);
    if (this.status !== "connecting") {
      this.setStatus("error");
    }
    // If already connected and the flush just finished, kick off a new one
    if (this.status === "connected" && !this.isFlushing) {
      this.flushQueue();
    }
    return false;
  }

  private async executeRawPrint(bytes: Uint8Array): Promise<boolean> {
    if (!this.isAndroid || !this.currentMacWithPrefix) return false;

    let isBle = false;
    let mac = this.currentMacWithPrefix;
    
    if (this.currentMacWithPrefix.startsWith("ble:")) {
      isBle = true;
      mac = this.currentMacWithPrefix.replace("ble:", "");
    } else if (this.currentMacWithPrefix.startsWith("spp:")) {
      isBle = false;
      mac = this.currentMacWithPrefix.replace("spp:", "");
    }

    try {
      if (isBle) {
        const { BleClient } = await import("@capacitor-community/bluetooth-le");
        const services = await BleClient.getServices(mac);
        let targetService = "";
        let targetCharacteristic = "";
        for (const service of services) {
          for (const char of service.characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              targetService = service.uuid;
              targetCharacteristic = char.uuid;
              break;
            }
          }
        }
        if (!targetCharacteristic) throw new Error("No writable characteristic found on BLE printer");
        
        const CHUNK_SIZE = 256;
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          const chunk = bytes.slice(i, i + CHUNK_SIZE);
          const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
          await BleClient.write(mac, targetService, targetCharacteristic, dataView);
          await new Promise(r => setTimeout(r, 20));
        }
      } else {
        const { BluetoothSerial } = await import("@ascentio-it/capacitor-bluetooth-serial");
        const CHUNK_SIZE = 1024;
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          const chunk = bytes.slice(i, i + CHUNK_SIZE);
          const base64Value = btoa(Array.from(chunk).map(b => String.fromCharCode(b)).join(''));
          await BluetoothSerial.write({ address: mac, value: base64Value });
          await new Promise(r => setTimeout(r, 50));
        }
      }

      await new Promise(r => setTimeout(r, 500));
      return true;

    } catch (err) {
      console.error("Print execution failed:", err);
      this.setStatus("error");
      return false;
    }
  }

  public stopEngine() {
    // [C-2 FIX] Set flag FIRST before clearing interval so any in-flight awaits abort
    this.engineRunning = false;
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = null;
    if (this.isAndroid && this.currentMacWithPrefix) {
      const mac = this.currentMacWithPrefix.replace("ble:", "").replace("spp:", "");
      if (this.currentMacWithPrefix.startsWith("ble:")) {
        import("@capacitor-community/bluetooth-le").then(({ BleClient }) => BleClient.disconnect(mac).catch(() => {}));
      } else {
        import("@ascentio-it/capacitor-bluetooth-serial").then(({ BluetoothSerial }) => BluetoothSerial.disconnect({ address: mac }).catch(() => {}));
      }
    }
    this.currentMacWithPrefix = null;
    this.setStatus("idle");
  }
}

export const backgroundPrinterService = new PrinterService();

