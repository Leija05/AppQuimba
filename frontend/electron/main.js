const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const isDev = !app.isPackaged;

// --- CONFIGURACIÓN DE LICENCIA ---
const SECRET_KEY = process.env.QUIMBAR_LICENSE_SECRET || 'QuimbarToken2026';
const ALGORITHM = 'aes-256-cbc';
const LICENSE_FOLDER = path.join(process.env.APPDATA, 'GestionCruces');
const LICENSE_PATH = path.join(LICENSE_FOLDER, 'license.dat');

let backendProcess = null;
let backendStartupIssue = '';

function encryptLicensePayload(payload, hwID) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(SECRET_KEY, hwID, 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptLicensePayload(hwID) {
  if (!fs.existsSync(LICENSE_PATH)) return null;
  try {
    const contenido = fs.readFileSync(LICENSE_PATH, 'utf8');
    const [ivHex, encryptedText] = contenido.split(':');
    if (!ivHex || !encryptedText) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(SECRET_KEY, hwID, 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Fallo en desencriptación:', error.message);
    return null;
  }
}

function addTwoMonths(dateInput) {
  const base = new Date(dateInput);
  const d = new Date(base);
  d.setMonth(d.getMonth() + 2);
  return d;
}

function machineHash(machineId) {
  return crypto.createHash('sha256').update(machineId).digest('hex').slice(0, 12);
}

function validateToken(token, hwID) {
  if (!token?.startsWith('QBM.') && !token?.startsWith('QBM2.')) return { valid: false, reason: 'Formato inválido' };
  const parts = token.split('.');
  const tokenVersion = parts[0];
  let expiryCompact = '';
  let signature = '';
  let payload = '';

  if (tokenVersion === 'QBM2') {
    if (parts.length !== 4) return { valid: false, reason: 'Formato QBM2 inválido' };
    expiryCompact = parts[1];
    const tokenMachineHash = parts[2];
    signature = parts[3];
    if (hwID && tokenMachineHash !== machineHash(hwID)) return { valid: false, reason: 'Token no pertenece a esta computadora' };
    payload = `${expiryCompact}.${tokenMachineHash}`;
  } else {
    if (parts.length !== 3) return { valid: false, reason: 'Formato QBM inválido' };
    expiryCompact = parts[1];
    signature = parts[2];
    payload = expiryCompact;
  }

  const expected = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex').slice(0, 12);
  if (expected !== signature) return { valid: false, reason: 'Firma inválida' };
  const expiryDate = new Date(`${expiryCompact.slice(0, 4)}-${expiryCompact.slice(4, 6)}-${expiryCompact.slice(6, 8)}T23:59:59Z`);
  if (Number.isNaN(expiryDate.getTime())) return { valid: false, reason: 'Fecha inválida' };
  if (new Date() > expiryDate) return { valid: false, reason: 'Token caducado' };
  return { valid: true, expiryDate };
}

function generateTokenForDate(expiryCompact, hwID) {
  const hwHash = machineHash(hwID);
  const payload = `${expiryCompact}.${hwHash}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex').slice(0, 12);
  return `QBM2.${expiryCompact}.${hwHash}.${signature}`;
}

function showTokenPrompt(message, hwID) {
  return new Promise((resolve) => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 2);
    const compact = `${nextMonth.getUTCFullYear()}${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}${String(nextMonth.getUTCDate()).padStart(2, '0')}`;
    const exampleToken = generateTokenForDate(compact, hwID);
    const tokenWindow = new BrowserWindow({
      width: 520,
      height: 340,
      resizable: false,
      modal: true,
      show: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    const html = `
      <html><body style="font-family:sans-serif;padding:24px;">
      <h2>Licencia requerida</h2>
      <p>${message}</p>
      <p>Su token ha caducado. Por favor, contacte al soporte para renovar su suscripción.</p>
      <p style="font-size:12px;color:#64748b;">Hardware ID: ${hwID}</p>
      <p style="font-size:12px;color:#64748b;">Formato esperado: QBM2.YYYYMMDD.HW_HASH.FIRMA<br/>Ejemplo (solo referencia): ${exampleToken}</p>
      <input id="token" style="width:100%;padding:10px;margin-top:12px;" placeholder="Ingrese nuevo token"/>
      <button id="save" style="margin-top:12px;padding:10px 14px;">Activar token</button>
      <script>
      const {ipcRenderer} = require('electron');
      document.getElementById('save').onclick = () => ipcRenderer.send('license-token-submitted', document.getElementById('token').value || '');
      </script></body></html>`;
    tokenWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const { ipcMain } = require('electron');
    ipcMain.once('license-token-submitted', (_, token) => {
      tokenWindow.close();
      resolve((token || '').trim());
    });
  });
}

async function ensureActiveLicense(hwID) {
  const saved = decryptLicensePayload(hwID);
  if (saved?.token) {
    const tokenStatus = validateToken(saved.token, hwID);
    if (tokenStatus.valid) {
      const activatedAt = saved.activated_at ? new Date(saved.activated_at) : new Date();
      if (new Date() <= addTwoMonths(activatedAt)) return { valid: true, token: saved.token };
    }
  }

  let checked = { valid: false, reason: 'Token inválido' };
  let enteredToken = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    enteredToken = await showTokenPrompt(
      attempt === 0
        ? 'La licencia no está activa o venció.'
        : `Token inválido (${checked.reason}). Intente nuevamente.`
    , hwID);
    checked = validateToken(enteredToken, hwID);
    if (checked.valid) break;
  }
  if (!checked.valid) return { valid: false, reason: checked.reason };

  if (!fs.existsSync(LICENSE_FOLDER)) fs.mkdirSync(LICENSE_FOLDER, { recursive: true });
  const payload = {
    token: enteredToken,
    activated_at: new Date().toISOString(),
    expires_at: addTwoMonths(new Date()).toISOString(),
  };
  fs.writeFileSync(LICENSE_PATH, encryptLicensePayload(payload, hwID), 'utf8');
  return { valid: true, token: enteredToken };
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
    env: {
      ...process.env,
      QUIMBAR_LICENSE_TOKEN: process.env.QUIMBAR_LICENSE_TOKEN || '',
      QUIMBAR_MACHINE_ID: process.env.QUIMBAR_MACHINE_ID || '',
    },
  });

  backendProcess.once('error', (error) => {
    backendStartupIssue = `Error al iniciar: ${error?.message || String(error)}`;
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBackendReady() {
  const maxAttempts = 60;
  const urlsToProbe = [
    'http://127.0.0.1:8000/api/',
    'http://127.0.0.1:8000/api/license/verify',
    'http://127.0.0.1:8000/api/logistica/records',
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

  // 2. VERIFICAR TOKEN Y CADUCIDAD BIMESTRAL
  const license = await ensureActiveLicense(hwID);
  if (!license.valid) {
    dialog.showErrorBox('Licencia inválida', `No fue posible activar la licencia.\n\nDetalle: ${license.reason || 'Token inválido.'}`);
    app.quit();
    return;
  }
  process.env.QUIMBAR_LICENSE_TOKEN = license.token;
  process.env.QUIMBAR_MACHINE_ID = hwID;

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
