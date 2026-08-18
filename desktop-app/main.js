const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('path');

// Live production URL
const APP_URL = 'https://qr-dine-cloud.vercel.app';
const APP_VERSION = '2.0.0';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    title: `QR Dine Cloud POS v${APP_VERSION}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // Enable disk-based cache so app assets load when offline
      partition: 'persist:qrdine',
    },
    show: false,
    backgroundColor: '#ffffff',
  });

  Menu.setApplicationMenu(null);

  // Load the live URL — ServiceWorker will serve cached assets when offline
  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setTitle(`QR Dine Cloud POS v${APP_VERSION}`);
  });

  // Show a simple offline indicator in the title bar
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _errorDesc, validatedUrl) => {
    // -2 = ERR_FAILED, -105 = ERR_NAME_NOT_RESOLVED (no internet)
    if (validatedUrl && validatedUrl.startsWith('https://qr-dine-cloud.vercel.app')) {
      mainWindow.setTitle(`QR Dine Cloud POS — Working Offline`);
      // Try loading again in 5 seconds
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(APP_URL);
        }
      }, 5000);
    }
  });

  mainWindow.webContents.on('did-navigate', () => {
    mainWindow.setTitle(`QR Dine Cloud POS v${APP_VERSION}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Enable aggressive disk caching for offline support
  const ses = session.fromPartition('persist:qrdine');
  ses.setPreloads([]);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  setupIpcHandlers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Helper: Creates a hidden BrowserWindow, loads HTML, prints it, and cleans up.
 */
function printInHiddenWindow(html, printerName) {
  return new Promise((resolve) => {
    let printWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false },
    });

    let resolved = false;
    function finish(result) {
      if (resolved) return;
      resolved = true;
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.close();
      }
      printWindow = null;
      resolve(result);
    }

    const safetyTimeout = setTimeout(() => {
      console.error('Print safety timeout reached (30s). Force-closing print window.');
      finish({ success: false, error: 'Print timed out after 30 seconds. Check printer connection.' });
    }, 30000);

    printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      clearTimeout(safetyTimeout);
      finish({ success: false, error: `Failed to render bill: ${errorDescription}` });
    });

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    printWindow.loadURL(dataUrl);

    printWindow.webContents.on('did-finish-load', () => {
      const options = {
        silent: true,
        margins: { marginType: 'none' },
      };

      if (printerName && printerName.trim() !== '') {
        options.deviceName = printerName.trim();
      }

      printWindow.webContents.print(options, (success, failureReason) => {
        clearTimeout(safetyTimeout);
        if (!success) {
          finish({ success: false, error: failureReason || 'Print failed. Check printer connection.' });
        } else {
          finish({ success: true });
        }
      });
    });
  });
}

function setupIpcHandlers() {
  ipcMain.handle('get-printers', async () => {
    if (!mainWindow) return [];
    try {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers;
    } catch (err) {
      console.error('Failed to get printers:', err);
      return [];
    }
  });

  ipcMain.handle('get-serial-ports', async () => {
    try {
      const { SerialPort } = require('serialport');
      const ports = await SerialPort.list();
      return ports;
    } catch (err) {
      console.error('Failed to get serial ports:', err);
      return [];
    }
  });

  ipcMain.handle('print-html', async (_event, html, printerName) => {
    return printInHiddenWindow(html, printerName);
  });

  ipcMain.handle('print-raw', async (_event, data, portName) => {
    return new Promise((resolve) => {
      if (!portName) return resolve({ success: false, error: 'No COM port specified' });
      
      const { SerialPort } = require('serialport');
      const port = new SerialPort({ path: portName, baudRate: 9600 }, (err) => {
        if (err) return resolve({ success: false, error: err.message });
      });
      
      const buffer = Buffer.from(data);
      port.write(buffer, (err) => {
        if (err) return resolve({ success: false, error: err.message });
        port.drain((drainErr) => {
          port.close();
          if (drainErr) return resolve({ success: false, error: drainErr.message });
          resolve({ success: true });
        });
      });
    });
  });

  ipcMain.handle('test-print', async (_event, printerName) => {
    const testHtml = `
      <html>
        <body style="font-family: monospace; text-align: center; margin: 0; padding: 20px;">
          <h2>TEST PRINT</h2>
          <p>--------------------------------</p>
          <p>QR DINE CLOUD v${APP_VERSION}</p>
          <p>Printer integration successful!</p>
          <p>--------------------------------</p>
          <p>Printer: ${printerName || 'OS Default'}</p>
          <p>${new Date().toLocaleString()}</p>
        </body>
      </html>
    `;
    return printInHiddenWindow(testHtml, printerName);
  });

  ipcMain.handle('get-version', () => APP_VERSION);
}

