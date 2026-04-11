const { app, BrowserWindow, dialog, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const isDev = !app.isPackaged;
const ICON_FILENAME = 'icon.ico';
const APP_USER_MODEL_ID = 'com.gestionlogistica.app';

// --- CONFIGURACIÓN DE LICENCIA ---
const SECRET_KEY = process.env.QUIMBAR_LICENSE_SECRET;
const ALGORITHM = 'aes-256-cbc';
const LICENSE_FOLDER = path.join(process.env.APPDATA, 'GestionLogistica');
const LICENSE_PATH = path.join(LICENSE_FOLDER, 'license.dat');
const RENEW_PAGE_URL = 'https://leija05.github.io/Venta/';

let backendProcess = null;
let backendStartupIssue = '';

function resolveAppIconPath() {
  const candidatePaths = [
    path.join(__dirname, '../assets', ICON_FILENAME),
    path.join(process.resourcesPath || '', 'assets', ICON_FILENAME),
    path.join(process.resourcesPath || '', 'app.asar', 'assets', ICON_FILENAME),
    path.join(__dirname, '../build', ICON_FILENAME),
  ];

  return candidatePaths.find((candidatePath) => candidatePath && fs.existsSync(candidatePath)) || null;
}

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

function machineHash(machineId) {
  return crypto.createHash('sha256').update(machineId).digest('hex').slice(0, 12);
}

function validateToken(token, hwID, type = 'license') {
  const prefixes = type === 'premium' ? ['QBP', 'QBP2'] : ['QBM', 'QBM2'];
  if (!token?.startsWith(`${prefixes[0]}.`) && !token?.startsWith(`${prefixes[1]}.`)) return { valid: false, reason: 'Formato inválido' };
  const parts = token.split('.');
  const tokenVersion = parts[0];
  let expiryCompact = '';
  let signature = '';
  let payload = '';

  if (tokenVersion === prefixes[1]) {
    if (parts.length !== 4) return { valid: false, reason: `Formato ${prefixes[1]} inválido` };
    expiryCompact = parts[1];
    const tokenMachineHash = parts[2];
    signature = parts[3];
    if (hwID && tokenMachineHash !== machineHash(hwID)) return { valid: false, reason: 'Token no pertenece a esta computadora' };
    payload = `${expiryCompact}.${tokenMachineHash}`;
  } else {
    if (parts.length !== 3) return { valid: false, reason: `Formato ${prefixes[0]} inválido` };
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

function generateTokenForDate(expiryCompact, hwID, type = 'license') {
  const prefix = type === 'premium' ? 'QBP2' : 'QBM2';
  const hwHash = machineHash(hwID);
  const payload = `${expiryCompact}.${hwHash}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex').slice(0, 12);
  return `${prefix}.${expiryCompact}.${hwHash}.${signature}`;
}

function showTokenPrompt(message, hwID, type = 'license') {
  return new Promise((resolve) => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 2);
    const compact = `${nextMonth.getUTCFullYear()}${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}${String(nextMonth.getUTCDate()).padStart(2, '0')}`;
    const tokenPrefix = type === 'premium' ? 'QBP2' : 'QBM2';
    const exampleToken = generateTokenForDate(compact, hwID, type);
    const tokenWindow = new BrowserWindow({
      width: 520,
      height: 460,
      resizable: false,
      modal: true,
      show: true,
      icon: resolveAppIconPath() || undefined,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    const html = `
      <html><body style="font-family:sans-serif;padding:24px;">
      <h2>${type === 'premium' ? 'Suscripción premium' : 'Licencia requerida'}</h2>
      <p>${message}</p>
      <p>${type === 'premium' ? 'Suscripción premium' : 'No tienes una licencia activa. Haz clic aquí para adquirir una.'}</p>
      <p style="font-size:12px;color:#64748b;">Hardware ID: ${hwID}</p>
      <p style="font-size:12px;color:#64748b;">Formato esperado: ${tokenPrefix}.YYYYMMDD.HW_HASH.FIRMA<br/>Ejemplo (solo referencia): ${exampleToken}</p>
      <input id="username" style="width:100%;padding:10px;margin-top:8px;" placeholder="Nombre de usuario"/>
      <input id="businessName" style="width:100%;padding:10px;margin-top:8px;" placeholder="Nombre completo o empresa"/>
      <input id="token" style="width:100%;padding:10px;margin-top:12px;" placeholder="Ingrese nuevo token"/>
      <div style="display:flex;gap:8px; margin-top:12px;">
        <button id="buy" style="padding:10px 14px;background:#002FA7;color:white;border:none;border-radius:8px;">Comprar licencia</button>
        <button id="save" style="padding:10px 14px;">Activar token</button>
      </div>
      <script>
      const {ipcRenderer} = require('electron');
      document.getElementById('buy').onclick = () => ipcRenderer.send('open-license-buy-page');
      document.getElementById('save').onclick = () => ipcRenderer.send('license-token-submitted', {
        token: document.getElementById('token').value || '',
        username: document.getElementById('username').value || '',
        businessName: document.getElementById('businessName').value || ''
      });
      </script></body></html>`;
    tokenWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    ipcMain.once('open-license-buy-page', () => {
      shell.openExternal(RENEW_PAGE_URL);
    });
    ipcMain.once('license-token-submitted', (_, payload) => {
      tokenWindow.close();
      resolve(payload || { token: '', username: '', businessName: '' });
    });
  });
}

async function ensureActiveLicense(hwID) {
  const saved = decryptLicensePayload(hwID);
  if (saved?.license_token) {
    const tokenStatus = validateToken(saved.license_token, hwID, 'license');
    if (tokenStatus.valid) return { valid: true, token: saved.license_token };
  }

  let checked = { valid: false, reason: 'Token inválido' };
  let enteredToken = '';
  let onboardingInfo = { username: '', businessName: '' };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const enteredPayload = await showTokenPrompt(
      attempt === 0
        ? 'La licencia no está activa o venció.'
        : `Token inválido (${checked.reason}). Intente nuevamente.`
    , hwID, 'license');
    enteredToken = (enteredPayload?.token || '').trim();
    onboardingInfo = {
      username: enteredPayload?.username || onboardingInfo.username,
      businessName: enteredPayload?.businessName || onboardingInfo.businessName,
    };
    checked = validateToken(enteredToken, hwID, 'license');
    if (checked.valid) break;
  }
  if (!checked.valid) return { valid: false, reason: checked.reason };

  if (!fs.existsSync(LICENSE_FOLDER)) fs.mkdirSync(LICENSE_FOLDER, { recursive: true });
  const previous = decryptLicensePayload(hwID) || {};
  const payload = {
    ...previous,
    license_token: enteredToken,
    username: onboardingInfo.username || previous.username || '',
    business_name: onboardingInfo.businessName || previous.business_name || '',
    license_activated_at: new Date().toISOString(),
    license_expires_at: checked.expiryDate.toISOString(),
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

function resolveBackendLaunchConfig() {
  if (isDev) {
    const backendScriptPath = path.join(__dirname, '../../backend/server.py');
    if (fs.existsSync(backendScriptPath)) {
      const pythonCmd = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
      return {
        command: pythonCmd,
        args: [backendScriptPath],
        cwd: path.dirname(backendScriptPath),
      };
    }
  }

  const backendExecutablePath = resolveBackendExecutablePath();
  return {
    command: backendExecutablePath,
    args: [],
    cwd: path.dirname(backendExecutablePath),
    executablePath: backendExecutablePath,
  };
}

function startBackend() {
  const backendConfig = resolveBackendLaunchConfig();
  if (backendConfig.executablePath && !fs.existsSync(backendConfig.executablePath)) {
    backendStartupIssue = `No existe quimbar-server.exe en: ${backendConfig.executablePath}`;
    return;
  }

  backendProcess = spawn(backendConfig.command, backendConfig.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    cwd: backendConfig.cwd,
    env: {
      ...process.env,
      QUIMBAR_LICENSE_TOKEN: process.env.QUIMBAR_LICENSE_TOKEN || '',
      QUIMBAR_MACHINE_ID: process.env.QUIMBAR_MACHINE_ID || '',
      PYTHONUNBUFFERED: '1',
    },
  });

  backendProcess.once('error', (error) => {
    backendStartupIssue = `Error al iniciar: ${error?.message || String(error)}`;
  });

  backendProcess.stderr?.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      backendStartupIssue = text.slice(0, 1500);
    }
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
  const resolvedIconPath = resolveAppIconPath();

  const windowConfig = {
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  if (resolvedIconPath) {
    windowConfig.icon = resolvedIconPath;
  }

  const mainWindow = new BrowserWindow(windowConfig);

  mainWindow.removeMenu();

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// --- PUNTO DE ENTRADA PRINCIPAL ---

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_USER_MODEL_ID);
  }
  Menu.setApplicationMenu(null);

  // 1. OBTENER LA IDENTIDAD DE LA PC
  const hwID = machineIdSync();

  // 2. VERIFICAR TOKEN Y CADUCIDAD BIMESTRAL
  const license = await ensureActiveLicense(hwID);
  let activeLicense = license;
  if (!activeLicense.valid) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Licencia vencida',
      message: 'Tu licencia se terminó y la aplicación quedará bloqueada.',
      detail: `Detalle: ${activeLicense.reason || 'Token inválido.'}\n\nRenueva en la página oficial y después ingresa tu token para activar la app.`,
      buttons: ['Renovar e ingresar token', 'Cerrar app'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) {
      await shell.openExternal(RENEW_PAGE_URL);
      activeLicense = await ensureActiveLicense(hwID);
      if (!activeLicense.valid) {
        dialog.showErrorBox('Licencia inválida', `No fue posible activar la licencia.\n\nDetalle: ${activeLicense.reason || 'Token inválido.'}`);
        app.quit();
        return;
      }
    } else {
      app.quit();
      return;
    }
  }
  process.env.QUIMBAR_LICENSE_TOKEN = activeLicense.token;
  process.env.QUIMBAR_MACHINE_ID = hwID;

  // 3. ABRIR LA VENTANA INMEDIATAMENTE PARA EVITAR QUE LA APP PAREZCA COLGADA
  createWindow();

  // 4. SI LA LICENCIA ES VÁLIDA, SE ACTIVA EL BACKEND
  startBackend();
  const ready = await waitForBackendReady();

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

ipcMain.handle('backup:select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Selecciona carpeta para respaldos',
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  return { canceled: false, folderPath: result.filePaths[0] };
});

ipcMain.handle('backup:save-json', async (_, payload = {}) => {
  const folderPath = payload.folderPath || '';
  const data = payload.data || {};
  if (!folderPath) return { ok: false, error: 'Carpeta inválida' };

  try {
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `respaldo_quimbar_${timestamp}.json`;
    const filePath = path.join(folderPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, filePath };
  } catch (error) {
    return { ok: false, error: error?.message || 'No se pudo guardar el archivo' };
  }
});

ipcMain.handle('backup:load-json', async (_, payload = {}) => {
  const folderPath = payload.folderPath || '';
  if (!folderPath) return { ok: false, error: 'Carpeta inválida' };
  try {
    const files = fs
      .readdirSync(folderPath)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => {
        const filePath = path.join(folderPath, name);
        const stats = fs.statSync(filePath);
        return { name, filePath, mtimeMs: stats.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (!files.length) return { ok: false, error: 'No hay respaldos JSON en la carpeta seleccionada' };
    const latest = files[0];
    const raw = fs.readFileSync(latest.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ok: true, filePath: latest.filePath, data: parsed };
  } catch (error) {
    return { ok: false, error: error?.message || 'No se pudo cargar el respaldo' };
  }
});

app.on('window-all-closed', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});
