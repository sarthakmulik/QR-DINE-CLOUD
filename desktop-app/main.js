const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

// Live production URL
const APP_URL = 'https://qr-dine-cloud.vercel.app';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready-to-show
  });

  // Remove the default application menu (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  // Load the live URL
  mainWindow.loadURL(APP_URL);

  // Show window gracefully once it's ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  setupIpcHandlers();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Helper: Creates a hidden BrowserWindow, loads HTML, prints it, and cleans up.
 * Handles all edge cases: empty printer name, load failures, hanging prints,
 * and memory leaks from orphaned windows.
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

    // Safety timeout: if anything hangs (driver crash, etc.), destroy after 30s
    const safetyTimeout = setTimeout(() => {
      console.error('Print safety timeout reached (30s). Force-closing print window.');
      finish({ success: false, error: 'Print timed out after 30 seconds. Check printer connection.' });
    }, 30000);

    // Handle load failure (Issue 2)
    printWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      clearTimeout(safetyTimeout);
      console.error('Print window failed to load:', errorCode, errorDescription);
      finish({ success: false, error: `Failed to render bill: ${errorDescription}` });
    });

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    printWindow.loadURL(dataUrl);

    printWindow.webContents.on('did-finish-load', () => {
      // Build print options (Issue 1: omit deviceName if empty/falsy)
      const options = {
        silent: true,
        margins: { marginType: 'none' },
      };

      // Only set deviceName if a specific printer was chosen
      if (printerName && printerName.trim() !== '') {
        options.deviceName = printerName.trim();
      }
      // If printerName is empty/null/undefined, we omit deviceName entirely
      // so Electron uses the OS default printer

      printWindow.webContents.print(options, (success, failureReason) => {
        clearTimeout(safetyTimeout);
        if (!success) {
          console.error('Print failed:', failureReason);
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

  ipcMain.handle('print-html', async (_event, html, printerName) => {
    return printInHiddenWindow(html, printerName);
  });

  ipcMain.handle('test-print', async (_event, printerName) => {
    const testHtml = `
      <html>
        <body style="font-family: monospace; text-align: center; margin: 0; padding: 20px;">
          <h2>TEST PRINT</h2>
          <p>--------------------------------</p>
          <p>QR DINE CLOUD</p>
          <p>Printer integration successful!</p>
          <p>--------------------------------</p>
          <p>Printer: ${printerName || 'OS Default'}</p>
          <p>${new Date().toLocaleString()}</p>
        </body>
      </html>
    `;

    return printInHiddenWindow(testHtml, printerName);
  });
}
