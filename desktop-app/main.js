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
    // Optional: Maximize window on load
    // mainWindow.maximize();
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

function setupIpcHandlers() {
  ipcMain.handle('get-printers', async (event) => {
    if (!mainWindow) return [];
    return mainWindow.webContents.getPrintersAsync();
  });

  ipcMain.handle('print-html', async (event, html, printerName) => {
    return new Promise((resolve, reject) => {
      let printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
        }
      });
      
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      
      printWindow.loadURL(dataUrl);
      
      printWindow.webContents.on('did-finish-load', () => {
        const options = {
          silent: true,
          deviceName: printerName,
          margins: { marginType: 'none' }
        };
        
        printWindow.webContents.print(options, (success, failureReason) => {
          if (!success) {
            console.error('Print failed:', failureReason);
            resolve({ success: false, error: failureReason });
          } else {
            resolve({ success: true });
          }
          printWindow.close();
        });
      });
    });
  });

  ipcMain.handle('test-print', async (event, printerName) => {
    const testHtml = `
      <html>
        <body style="font-family: monospace; text-align: center; margin: 0; padding: 20px;">
          <h2>TEST PRINT</h2>
          <p>--------------------------------</p>
          <p>QR DINE CLOUD</p>
          <p>Printer integration successful!</p>
          <p>--------------------------------</p>
          <p>${new Date().toLocaleString()}</p>
        </body>
      </html>
    `;
    
    return new Promise((resolve, reject) => {
      let printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
      printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(testHtml));
      
      printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({ silent: true, deviceName: printerName }, (success, reason) => {
          resolve({ success, error: reason });
          printWindow.close();
        });
      });
    });
  });
}
