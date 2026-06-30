const { app, BrowserWindow, Menu } = require('electron');
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
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
