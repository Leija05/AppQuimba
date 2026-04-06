const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto'); // Módulo nativo para desencriptar
const { machineIdSync } = require('node-machine-id'); // Librería para el ID único

const isDev = !app.isPackaged;

// --- CONFIGURACIÓN DE LICENCIA (EL CANDADO) ---
const SECRET_KEY = 'TuClavePrivadaQuimbar2026'; // DEBE SER LA MISMA QUE USES EN EL GENERADOR
const ALGORITHM = 'aes-256-cbc';
const LICENSE_FOLDER = path.join(process.env.APPDATA, 'GestionCruces');
const LICENSE_PATH = path.join(LICENSE_FOLDER, 'license.dat');

let backendProcess = null;
let backendStartupIssue = '';

/**
 * LÓGICA DE DESENCRIPTACIÓN Y VALIDACIÓN
 * Esta función es la que provoca el acceso o el bloqueo.
 */
function verificarLicenciaActiva(hwID) {
    if (!fs.existsSync(LICENSE_PATH)) return false;

    try {
        const contenido = fs.readFileSync(LICENSE_PATH, 'utf8');
        const [ivHex, encryptedText] = contenido.split(':');
        
        if (!ivHex || !encryptedText) return false;

        const iv = Buffer.from(ivHex, 'hex');
        // Creamos la llave usando tu Secret Key + el ID de la PC del cliente
        const key = crypto.scryptSync(SECRET_KEY, hwID, 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        // Solo si el texto desencriptado es exactamente este, se libera la app
        return decrypted === 'LICENCIA_ACTIVA_QUIMBAR'; 
    } catch (error) {
        console.error("Fallo en desencriptación:", error.message);
        return false;
    }
}

// --- LÓGICA DEL BACKEND ---

function resolveBackendExecutablePath() {
  if (isDev) {
    return path.join(__dirname, '../resources/quimbar-server.exe');
  }
  return path.join(process.resourcesPath, 'resources', 'quimbar-server.exe');
}

function startBackend() {
  const backendExecutablePath = resolveBackendExecutablePath();
  if (!fs.existsSync(backendExecutablePath)) {
    backendStartupIssue = `No existe quimbar-server.exe en: ${backendExecutablePath}`;
    return;
  }

  backendProcess = spawn(backendExecutablePath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    cwd: path.dirname(backendExecutablePath),
    env: process.env,
  });

  backendProcess.once('error', (error) => {
    backendStartupIssue = `Error al iniciar: ${error?.message || String(error)}`;
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBackendReady() {
  const maxAttempts = 60;
  const urlsToProbe = [
    'http://127.0.0.1:8000/api/totals',
    'http://127.0.0.1:8000/totals',
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    for (const urlToFetch of urlsToProbe) {
      try {
        const response = await fetch(urlToFetch);
        if (response.ok) return true;
      } catch (_) {}
    }
    if (backendProcess && backendProcess.exitCode !== null) return false;
    await sleep(1000);
  }
  return false;
}

// --- LÓGICA DE VENTANAS ---

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, isDev ? '../assets/icon.ico' : '../build/icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.removeMenu();

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }
}

// --- PUNTO DE ENTRADA PRINCIPAL ---

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  // 1. OBTENER LA IDENTIDAD DE LA PC
  const hwID = machineIdSync();

  // 2. VERIFICAR LA LICENCIA (Paso provocado por la huella de hardware)
  if (!verificarLicenciaActiva(hwID)) {
    dialog.showErrorBox(
      'Software no activado o vencido',
      `Esta copia de Quimbar requiere activación.\n\nHardware ID: ${hwID}\n\nEnvía este código al administrador para obtener tu licencia.`
    );
    app.quit();
    return;
  }

  // 3. SI LA LICENCIA ES VÁLIDA, SE ACTIVA EL BACKEND
  startBackend();
  const ready = await waitForBackendReady();
  
  createWindow();

  if (!ready) {
    const extra = backendStartupIssue ? `\n\nDetalle técnico:\n${backendStartupIssue}` : '';
    dialog.showMessageBox({
      type: 'warning',
      title: 'Servidor no disponible',
      message: 'No se pudo conectar con quimbar-server.exe.',
      detail: `La app se abrirá pero sin datos.${extra}`,
      buttons: ['Aceptar'],
    });
  }
});

app.on('window-all-closed', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});