import { useState, useEffect, useMemo } from "react";
import "@/App.css";
import axios from "axios";
import ExcelJS from 'exceljs';
import DeveloperSignature from "@/components/DeveloperSignature";
import AutoSaveConfig from "@/components/AutoSaveConfig";
import LicensePurchasePrompt from "@/components/LicensePurchasePrompt";
import PremiumDashboardLogistica from "@/components/PremiumDashboardLogistica";
import PremiumDashboardTransportista from "@/components/PremiumDashboardTransportista";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  Files,
  Truck,
  Package,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  FilePdf,
  FileXls,
  X,
  SpinnerGap,
  Warning,
  MagnifyingGlass,
  ClockCounterClockwise,
  FolderOpen,
  TrashSimple,
  Moon,
  Sun,
  Lock,
  LockOpen,
  FloppyDisk,
  ArrowsClockwise,
  Copy,
  ChartLine,
  SidebarSimple,
  Users,
  Gear,
  Crown,
  List,
  SquaresFour
} from "@phosphor-icons/react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";

const STORAGE_KEYS = {
  premium: "gestion-logistica-premium-unlocked",
  premiumToken: "gestion-logistica-premium-token",
  theme: "gestion-logistica-theme",
  favoriteFilters: "gestion-logistica-favorite-filters",
  logo: "gestion-logistica-company-logo",
  companyName: "gestion-logistica-company-name",
  sidebarCollapsed: "gestion-logistica-sidebar-collapsed",
  firstLicenseSetup: "gestion-logistica-license-profile"
};

const PREMIUM_TOKEN_SECRET = process.env.REACT_APP_PREMIUM_SECRET;
const RENEW_PAGE_URL = "https://leija05.github.io/Venta/";
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL).replace(/\/+$/, "");
const API_CANDIDATES = BACKEND_URL.endsWith("/api")
  ? [BACKEND_URL, BACKEND_URL.replace(/\/api$/, "")]
  : [`${BACKEND_URL}/api`, BACKEND_URL];

const apiRequest = async (method, path, options = {}) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let lastError;
  for (const baseUrl of API_CANDIDATES) {
    try {
      return await axios({ method, url: `${baseUrl}${normalizedPath}`, timeout: 4000, ...options });
    } catch (error) {
      lastError = error;
      if (error?.response?.status !== 404) {
        throw error;
      }
    }
  }
  throw lastError;
};

// Pestañas principales - Logística y Transporte
const TABS = [
  { id: "logistica", label: "Logística", icon: Package },
  { id: "transporte", label: "Transporte", icon: Truck }
];

const formatCurrency = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(value || 0);
const formatDate = (dateStr) => (!dateStr ? "-" : new Date(dateStr).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" }));
const toNumber = (value) => Number.parseFloat(value || 0) || 0;
const todayISO = () => new Date().toISOString().split("T")[0];
const hmacSha256Hex = async (payload, secret) => {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await window.crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const validatePremiumToken = async (token) => {
  if (!token) return { valid: false, reason: "Token vacío" };
  const normalized = token.trim();
  const parts = normalized.split(".");
  const version = parts[0];
  if (!["QBP", "QBP2"].includes(version)) return { valid: false, reason: "Formato inválido" };

  let expiryCompact = "";
  let signature = "";
  let payload = "";
  if (version === "QBP2") {
    if (parts.length !== 4) return { valid: false, reason: "Formato QBP2 inválido" };
    expiryCompact = parts[1];
    const hwHash = parts[2];
    signature = parts[3];
    payload = `${expiryCompact}.${hwHash}`;
  } else {
    if (parts.length !== 3) return { valid: false, reason: "Formato QBP inválido" };
    expiryCompact = parts[1];
    signature = parts[2];
    payload = expiryCompact;
  }

  const expiryDate = new Date(`${expiryCompact.slice(0, 4)}-${expiryCompact.slice(4, 6)}-${expiryCompact.slice(6, 8)}T23:59:59Z`);
  if (Number.isNaN(expiryDate.getTime())) return { valid: false, reason: "Fecha inválida" };

  const expected = (await hmacSha256Hex(payload, PREMIUM_TOKEN_SECRET)).slice(0, 12);
  if (expected !== signature) return { valid: false, reason: "Firma inválida" };
  if (new Date() > expiryDate) return { valid: false, reason: "Suscripción premium caducada" };
  return { valid: true, expiryDate };
};

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// Columnas para cada sección
const LOGISTICA_CLIENTE_COLUMNS = ["fecha", "servicio", "costo_l", "status", "total_pendiente", "acciones"];
const LOGISTICA_TRANSPORTISTA_COLUMNS = ["fecha", "costo_t", "transporte", "servicio", "acciones"];
const LOGISTICA_ARCHIVO_PRINCIPAL_COLUMNS = ["fecha", "costo_t", "transporte", "servicio", "costo_l", "status", "total", "saldo_a_favor", "acciones"];
const TRANSPORTE_COLUMNS = ["fecha", "costo", "carta_porte", "servicio", "shipment", "status", "total", "acciones"];

// Labels de columnas
const LOGISTICA_COLUMN_LABELS = {
  fecha: "FECHA",
  servicio: "SERVICIO",
  costo_l: "COSTO L",
  status: "STATUS",
  total_pendiente: "TOTAL PENDIENTE",
  costo_t: "COSTO T",
  transporte: "TRANSPORTISTA",
  total: "TOTAL",
  saldo_a_favor: "SALDO A FAVOR",
  acciones: "ACCIONES"
};

const TRANSPORTE_COLUMN_LABELS = {
  fecha: "FECHA",
  costo: "COSTO",
  carta_porte: "CARTA PORTE",
  servicio: "SERVICIO",
  shipment: "SHIPMENT",
  status: "STATUS",
  total: "TOTAL",
  acciones: "ACCIONES"
};

const APP_NAME = "Gestión Logística y de Transportes";
const APP_DESCRIPTION = "Solución profesional para control logístico";

const applyFilters = (records, searchTerm, statusFilter, premiumFilters, premiumEnabled, isLogistica) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  return records.filter((record) => {
    const matchesStatus = statusFilter === "Todos" || record.status === statusFilter;
    
    const searchFields = [record.fecha, record.cliente, record.transporte, record.carta_porte, record.shipment, record.servicio, record.status];
    
    const matchesSearch = !normalizedSearch || searchFields.some((field) =>
      String(field || "").toLowerCase().includes(normalizedSearch)
    );

    if (!premiumEnabled) return matchesStatus && matchesSearch;

    const dateOk =
      (!premiumFilters.from || new Date(record.fecha) >= new Date(premiumFilters.from)) &&
      (!premiumFilters.to || new Date(record.fecha) <= new Date(premiumFilters.to));
    
    const fieldOk = !premiumFilters.field || (record.transporte || "").toLowerCase().includes(premiumFilters.field.toLowerCase()) || (record.cliente || "").toLowerCase().includes(premiumFilters.field.toLowerCase());
    
    const servicioOk = !premiumFilters.servicio || (record.servicio || "").toLowerCase().includes(premiumFilters.servicio.toLowerCase());
    const premiumStatusOk = !premiumFilters.status || premiumFilters.status === "Todos" || record.status === premiumFilters.status;

    return matchesStatus && matchesSearch && dateOk && fieldOk && servicioOk && premiumStatusOk;
  });
};

const StatusBadge = ({ status }) => <span className={status === "Pagado" ? "badge-paid" : "badge-pending"}>{status}</span>;

const MetricCard = ({ label, value, variant = "default" }) => {
  const colors = { default: "text-slate-900", success: "text-emerald-600", danger: "text-red-600" };
  return (
    <div className="metric-card" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colors[variant]}`}>{formatCurrency(value)}</p>
    </div>
  );
};

// Formulario para Logística
const LogisticaForm = ({ record, onSave, onCancel, loading, clients = [] }) => {
  const [form, setForm] = useState({
    fecha: record?.fecha || todayISO(),
    cliente: record?.cliente || "",
    costo: record?.costo || 0,
    carta_porte: record?.carta_porte || "",
    servicio: record?.servicio || "",
    shipment: record?.shipment || "",
    status: record?.status || "Pendiente",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const calculatedTotal = toNumber(form.costo);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          costo: toNumber(form.costo),
          total: calculatedTotal,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Fecha</label>
          <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className="form-input w-full" required />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Cliente</label>
          <input list="clientes-lista-log" type="text" name="cliente" value={form.cliente} onChange={handleChange} className="form-input w-full" />
          <datalist id="clientes-lista-log">
            {clients.map((client) => <option key={client.id} value={client.nombre} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Costo</label>
          <input type="number" name="costo" value={form.costo} onChange={handleChange} className="form-input w-full" step="0.01" min="0" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Carta Porte</label>
          <input type="text" name="carta_porte" value={form.carta_porte} onChange={handleChange} className="form-input w-full" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Shipment</label>
          <input type="text" name="shipment" value={form.shipment} onChange={handleChange} className="form-input w-full" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1 text-slate-700">Servicio</label>
        <input type="text" name="servicio" value={form.servicio} onChange={handleChange} className="form-input w-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Status</label>
          <select name="status" value={form.status} onChange={handleChange} className="form-input w-full">
            <option value="Pendiente">Pendiente</option>
            <option value="Pagado">Pagado</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Total</label>
          <div className="form-input w-full bg-slate-100 tabular-nums font-medium text-slate-600">
            {formatCurrency(calculatedTotal)}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? <SpinnerGap className="spinner" size={20} /> : <Plus size={20} />}
          {record ? "Actualizar" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          <X size={20} />Cancelar
        </button>
      </div>
    </form>
  );
};

// Formulario para Transportista
const TransportistaForm = ({ record, onSave, onCancel, loading, clients = [] }) => {
  const [form, setForm] = useState({
    fecha: record?.fecha || todayISO(),
    cliente: record?.cliente || "",
    costo_t: record?.costo_t || 0,
    transporte: record?.transporte || "",
    servicio: record?.servicio || "",
    costo_l: record?.costo_l || 0,
    status: record?.status || "Pendiente",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const calculatedTotal = toNumber(form.costo_l);
  const calculatedSaldo = calculatedTotal - toNumber(form.costo_t);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          costo_t: toNumber(form.costo_t),
          costo_l: toNumber(form.costo_l),
          total: calculatedTotal,
          saldo_a_favor: calculatedSaldo,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Fecha</label>
          <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className="form-input w-full" required />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Cliente</label>
          <input list="clientes-lista-trans" type="text" name="cliente" value={form.cliente} onChange={handleChange} className="form-input w-full" />
          <datalist id="clientes-lista-trans">
            {clients.map((client) => <option key={client.id} value={client.nombre} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Transporte</label>
          <input type="text" name="transporte" value={form.transporte} onChange={handleChange} className="form-input w-full" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1 text-slate-700">Servicio</label>
        <input type="text" name="servicio" value={form.servicio} onChange={handleChange} className="form-input w-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Costo T</label>
          <input type="number" name="costo_t" value={form.costo_t} onChange={handleChange} className="form-input w-full" step="0.01" min="0" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Costo L</label>
          <input type="number" name="costo_l" value={form.costo_l} onChange={handleChange} className="form-input w-full" step="0.01" min="0" />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Total (Costo L)</label>
          <div className="form-input w-full bg-slate-100 tabular-nums font-medium text-slate-600">
            {formatCurrency(calculatedTotal)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Status</label>
          <select name="status" value={form.status} onChange={handleChange} className="form-input w-full">
            <option value="Pendiente">Pendiente</option>
            <option value="Pagado">Pagado</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Saldo a favor (L - T)</label>
          <div className={`form-input w-full bg-slate-100 tabular-nums font-medium ${calculatedSaldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatCurrency(calculatedSaldo)}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? <SpinnerGap className="spinner" size={20} /> : <Plus size={20} />}
          {record ? "Actualizar" : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          <X size={20} />Cancelar
        </button>
      </div>
    </form>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState("logistica");
  
  // Estados separados para Logística
  const [logisticaRecords, setLogisticaRecords] = useState([]);
  const [logisticaUploads, setLogisticaUploads] = useState([]);
  
  // Estados separados para Transportista
  const [transportistaRecords, setTransportistaRecords] = useState([]);
  const [transportistaUploads, setTransportistaUploads] = useState([]);
  
  const [favoriteFilters, setFavoriteFilters] = useState(() => readJSON(STORAGE_KEYS.favoriteFilters, []));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingUploadId, setLoadingUploadId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(STORAGE_KEYS.theme) === "dark");
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(() => localStorage.getItem(STORAGE_KEYS.premium) === "1");
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumKeyInput, setPremiumKeyInput] = useState("");
  const [showPremiumExpiredModal, setShowPremiumExpiredModal] = useState(false);
  const [premiumExpiredReason, setPremiumExpiredReason] = useState("");
  const [premiumFilters, setPremiumFilters] = useState({ from: "", to: "", field: "", servicio: "", status: "Todos" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [serverBooting, setServerBooting] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [noticeModal, setNoticeModal] = useState({ open: false, title: "", message: "" });
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showFavoriteFilterModal, setShowFavoriteFilterModal] = useState(false);
  const [showDeactivatePremiumConfirm, setShowDeactivatePremiumConfirm] = useState(false);
  const [favoriteFilterInput, setFavoriteFilterInput] = useState("");
  const [activeLogisticaView, setActiveLogisticaView] = useState("archivo_principal");
  const [companyLogo, setCompanyLogo] = useState(() => localStorage.getItem(STORAGE_KEYS.logo) || "");
  const [companyName, setCompanyName] = useState(() => localStorage.getItem(STORAGE_KEYS.companyName) || APP_NAME);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("Todos");
  const [activeSection, setActiveSection] = useState("principal");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === "1");
  const [clientViewMode, setClientViewMode] = useState("lista");
  const [editingClientId, setEditingClientId] = useState(null);
  const [licenseProfile, setLicenseProfile] = useState(() => readJSON(STORAGE_KEYS.firstLicenseSetup, { username: "", businessName: "" }));
  const [showLicenseOnboarding, setShowLicenseOnboarding] = useState(false);
  const [licenseAlert, setLicenseAlert] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [clientForm, setClientForm] = useState({ nombre: "", correo: "", telefono: "" });
  const [transportExportMode, setTransportExportMode] = useState("pendientes");
  const [exportSettings, setExportSettings] = useState({
    showModal: false,
    lastFormat: 'excel',
    empresa: "JAQ TRANSPORT LOGISTIC",
    direccion: "ZARAGOZA 1304",
    ubicacion: "NUEVO LAREDO TAMAULIPAS 88230",
    telefono: "867 318 1488",
    correo: "JAQTRANSPORT@GMAIL.COM",
    tituloReporte: "STATUS DE CRUCES Y FLETES PENDIENTES DE PAGO"
  });

  const showNotice = (message, title = "Aviso") => setNoticeModal({ open: true, title, message });

  const isLogistica = activeTab === "logistica";
  const activeApiBasePath = isLogistica ? "/transportista" : "/logistica";
  const currentRecords = isLogistica ? transportistaRecords : logisticaRecords;
  const currentUploads = isLogistica ? transportistaUploads : logisticaUploads;
  const currentColumns = isLogistica
    ? (activeLogisticaView === "cliente"
      ? LOGISTICA_CLIENTE_COLUMNS
      : activeLogisticaView === "transportista"
        ? LOGISTICA_TRANSPORTISTA_COLUMNS
        : LOGISTICA_ARCHIVO_PRINCIPAL_COLUMNS)
    : TRANSPORTE_COLUMNS;
  const currentColumnLabels = isLogistica ? LOGISTICA_COLUMN_LABELS : TRANSPORTE_COLUMN_LABELS;

  useEffect(() => localStorage.setItem(STORAGE_KEYS.favoriteFilters, JSON.stringify(favoriteFilters)), [favoriteFilters]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.theme, darkMode ? "dark" : "light"), [darkMode]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.premium, isPremiumUnlocked ? "1" : "0"), [isPremiumUnlocked]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.logo, companyLogo), [companyLogo]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.companyName, companyName), [companyName]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, sidebarCollapsed ? "1" : "0"), [sidebarCollapsed]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.firstLicenseSetup, JSON.stringify(licenseProfile)), [licenseProfile]);
  useEffect(() => { document.title = APP_NAME; }, []);
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEYS.premiumToken) || "";
    if (!storedToken) return;
    let mounted = true;
    validatePremiumToken(storedToken).then((status) => {
      if (!mounted) return;
      if (!status.valid) {
        setIsPremiumUnlocked(false);
        localStorage.removeItem(STORAGE_KEYS.premiumToken);
        setPremiumExpiredReason(status.reason || "Suscripción premium caducada");
        setShowPremiumExpiredModal(true);
      } else {
        setIsPremiumUnlocked(true);
        setShowPremiumExpiredModal(false);
        setPremiumExpiredReason("");
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const loadFromBackend = async () => {
      const maxAttempts = 8;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const [logRecordsRes, logUploadsRes, transRecordsRes, transUploadsRes, clientsRes] = await Promise.all([
            apiRequest("get", "/logistica/records"),
            apiRequest("get", "/logistica/uploads"),
            apiRequest("get", "/transportista/records"),
            apiRequest("get", "/transportista/uploads"),
            apiRequest("get", "/clients")
          ]);
          setLogisticaRecords(logRecordsRes.data || []);
          setLogisticaUploads(logUploadsRes.data || []);
          setTransportistaRecords(transRecordsRes.data || []);
          setTransportistaUploads(transUploadsRes.data || []);
          setClients(clientsRes.data || []);
          setBackendAvailable(true);
          setServerBooting(false);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
      setBackendAvailable(false);
      setServerBooting(false);
      showNotice("No se pudo conectar con el servidor. Reinicia la app.", "Error");
    };
    loadFromBackend();
  }, []);

  // Totales para Logística
  const logisticaTotals = useMemo(() => {
    const total_pendiente = logisticaRecords.filter((r) => r.status === "Pendiente").reduce((sum, r) => sum + toNumber(r.total), 0);
    const total_pagado = logisticaRecords.filter((r) => r.status === "Pagado").reduce((sum, r) => sum + toNumber(r.total), 0);
    return {
      total_pendiente,
      total_pagado,
      total_general: total_pendiente + total_pagado
    };
  }, [logisticaRecords]);

  const recordsByClient = useMemo(
    () => (selectedClient === "Todos" ? currentRecords : currentRecords.filter((r) => (r.cliente || "Sin cliente") === selectedClient)),
    [currentRecords, selectedClient]
  );

  // Totales para vista activa (filtrados por cliente)
  const transportistaTotals = useMemo(() => {
    const total_pendiente = recordsByClient.filter((r) => r.status === "Pendiente").reduce((sum, r) => sum + toNumber(r.total), 0);
    const total_pagado = recordsByClient.filter((r) => r.status === "Pagado").reduce((sum, r) => sum + toNumber(r.total), 0);
    const total_saldo_a_favor = recordsByClient.reduce((sum, r) => sum + toNumber(r.saldo_a_favor), 0);
    return {
      total_pendiente,
      total_pagado,
      total_general: total_pendiente + total_pagado,
      total_saldo_a_favor
    };
  }, [recordsByClient]);

  const currentTotals = transportistaTotals;

  const filteredRecords = useMemo(
    () => applyFilters(recordsByClient, searchTerm, statusFilter, premiumFilters, isPremiumUnlocked, isLogistica),
    [recordsByClient, searchTerm, statusFilter, premiumFilters, isPremiumUnlocked, isLogistica]
  );

  const displayedRecords = useMemo(() => {
    return filteredRecords.map((record) => ({
      ...record,
      total_pendiente: record.status === "Pendiente" ? toNumber(record.total) : 0,
    }));
  }, [filteredRecords, isLogistica, activeLogisticaView]);

  const reloadBackendData = async () => {
    const [logRecordsRes, logUploadsRes, transRecordsRes, transUploadsRes, clientsRes] = await Promise.all([
      apiRequest("get", "/logistica/records"),
      apiRequest("get", "/logistica/uploads"),
      apiRequest("get", "/transportista/records"),
      apiRequest("get", "/transportista/uploads"),
      apiRequest("get", "/clients")
    ]);
    setLogisticaRecords(logRecordsRes.data || []);
    setLogisticaUploads(logUploadsRes.data || []);
    setTransportistaRecords(transRecordsRes.data || []);
    setTransportistaUploads(transUploadsRes.data || []);
    setClients(clientsRes.data || []);
  };

  const autoSave = useAutoSave(async () => {
    if (backendAvailable) {
      await reloadBackendData();
    }
  });

  useEffect(() => {
    const saveOnClose = () => {
      if (backendAvailable) {
        reloadBackendData().catch(() => {});
      }
    };
    window.addEventListener("beforeunload", saveOnClose);
    return () => window.removeEventListener("beforeunload", saveOnClose);
  }, [backendAvailable]);

  const parseTokenExpiry = (token) => {
    const parts = (token || "").split(".");
    if (parts.length < 2) return null;
    const compact = parts[1];
    if (!/^\d{8}$/.test(compact)) return null;
    return new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T23:59:59Z`);
  };

  useEffect(() => {
    if (!licenseProfile.username || !licenseProfile.businessName) {
      setShowLicenseOnboarding(true);
    }
  }, [licenseProfile]);

  useEffect(() => {
    const checkLicenseHealth = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.premiumToken) || "";
      if (!token) {
        setLicenseAlert({ level: "warning", text: "No tienes una licencia activa. Haz clic aquí para adquirir una." });
        return;
      }

      try {
        const serverTime = await apiRequest("get", "/license/server-time");
        const now = new Date(serverTime.data.server_time);
        const expiry = parseTokenExpiry(token);
        if (!expiry) return;
        const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (days < 0) {
          setLicenseAlert({ level: "danger", text: "❌ Tu licencia ha expirado." });
          await apiRequest("post", "/license/notify", { data: { machine_id: "desktop-app", client_name: licenseProfile.businessName || "Cliente", license_status: "Caducada", expiry_date: expiry.toISOString(), days_remaining: days } });
        } else if (days <= 7) {
          setLicenseAlert({ level: "warning", text: `⚠️ Tu licencia está por expirar en ${days} días.` });
          await apiRequest("post", "/license/notify", { data: { machine_id: "desktop-app", client_name: licenseProfile.businessName || "Cliente", license_status: "Por expirar", expiry_date: expiry.toISOString(), days_remaining: days } });
        } else {
          setLicenseAlert(null);
        }
      } catch {
        // ignore network/license notification errors
      }
    };

    checkLicenseHealth();
    const intervalId = window.setInterval(checkLicenseHealth, 24 * 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [licenseProfile.businessName]);

  const handleSaveRecord = async (data) => {
    setSaving(true);
    try {
      if (!backendAvailable) throw new Error("backend_unavailable");

      const basePath = activeApiBasePath;

      if (selectedRecord) {
        await apiRequest("put", `${basePath}/records/${selectedRecord.id}`, { data });
      } else {
        await apiRequest("post", `${basePath}/records`, { data });
      }

      await reloadBackendData();
      showNotice(selectedRecord ? "Registro actualizado" : "Registro creado", "Éxito");
      setShowForm(false);
      setSelectedRecord(null);
    } catch (error) {
      console.error("Error al guardar:", error);
      showNotice("No se pudo guardar el registro", "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    
    const basePath = activeApiBasePath;
    await apiRequest("delete", `${basePath}/records/${id}`);
    await reloadBackendData();
    setShowDeleteConfirm(null);
    showNotice("Registro eliminado", "Éxito");
  };

  const handleFileUpload = async (e, sectionOverride = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (serverBooting) {
      showNotice("Espera un momento a que termine de iniciar el servidor y vuelve a subir el archivo.", "Servidor iniciando");
      e.target.value = "";
      return;
    }
    if (!backendAvailable) {
      showNotice("No se detectó el servidor en ejecución.", "Error");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const basePath = sectionOverride || activeApiBasePath;
      const response = await apiRequest("post", `${basePath}/upload-excel`, {
        data: formData,
        headers: { "Content-Type": "multipart/form-data" }
      });
      await reloadBackendData();
      showNotice(`${response.data?.records_imported || 0} registros importados en ${basePath === "/transportista" ? "Logística" : "Transporte"}`, "Éxito");
    } catch {
      showNotice("Error al procesar el Excel", "Error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(isLogistica ? 'Logística' : 'Transporte');

    const exportColumns = currentColumns.filter((col) => col !== "acciones");
    const exportRecords = transportExportMode === "total_pendientes"
      ? []
      : (transportExportMode === "todas" || isLogistica
        ? filteredRecords
        : filteredRecords.filter((r) => r.status === "Pendiente"));

    worksheet.columns = exportColumns.map(col => ({
      header: currentColumnLabels[col]?.toUpperCase() || col.toUpperCase(),
      key: col,
      width: col === 'servicio' ? 45 : col === 'transporte' ? 25 : 15
    }));

    worksheet.insertRow(1, []);
    worksheet.insertRow(2, []);
    worksheet.mergeCells(`A1:${String.fromCharCode(64 + exportColumns.length)}2`);

    const mainHeader = worksheet.getCell('A1');
    mainHeader.value = companyName || exportSettings.empresa;
    mainHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3399AA' } };
    mainHeader.font = { name: 'Arial Black', color: { argb: 'FFFFFF' }, size: 20, bold: true };
    mainHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    worksheet.getRow(3).values = [exportSettings.direccion, '', '', exportSettings.telefono, '', exportSettings.correo];
    worksheet.getRow(4).values = [exportSettings.ubicacion];

    [3, 4].forEach(rowNum => {
      const row = worksheet.getRow(rowNum);
      row.font = { bold: true, size: 9 };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    });

    if (companyLogo) {
      try {
        const imageId = workbook.addImage({ base64: companyLogo, extension: companyLogo.includes("image/png") ? "png" : "jpeg" });
        worksheet.addImage(imageId, "A1:B4");
      } catch (_) {}
    }

    const headerRow = worksheet.getRow(6);
    headerRow.values = exportColumns.map(col => {
      // Para transportista, cambiar "Costo T" a "Costo JAQ-Transport" en exportación
      if (isLogistica && col === 'costo_t') return 'COSTO JAQ-TRANSPORT';
      return currentColumnLabels[col]?.toUpperCase();
    });

    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
      cell.font = { bold: true, color: { argb: '1E293B' } };
      cell.border = { bottom: { style: 'medium' } };
      cell.alignment = { horizontal: 'center' };
    });

    exportRecords.forEach(record => {
      const rowData = {};
      exportColumns.forEach(col => {
        const numericCols = isLogistica 
          ? ['costo_t', 'costo_l', 'total', 'saldo_a_favor', 'total_pendiente']
          : ['costo', 'total'];
        rowData[col] = numericCols.includes(col)
          ? toNumber(record[col])
          : record[col] || "-";
      });

      const row = worksheet.addRow(rowData);

      exportColumns.forEach((col, index) => {
        const cell = row.getCell(index + 1);
        const numericCols = isLogistica 
          ? ['costo_t', 'costo_l', 'total', 'saldo_a_favor', 'total_pendiente']
          : ['costo', 'total'];
        if (numericCols.includes(col)) {
          cell.numFmt = '"$"#,##0.00';
        }
        if (col === 'status') {
          cell.font = {
            color: { argb: record.status === 'Pagado' ? '10B981' : 'EF4444' },
            bold: true
          };
        }
      });
    });

    // Totales al final
    worksheet.addRow([]);
    const totalRow = worksheet.addRow([]);
    const totalColIndex = exportColumns.length;
    totalRow.getCell(totalColIndex - 1).value = transportExportMode === "todas" ? "TOTAL GENERAL" : "TOTAL PENDIENTE";
    totalRow.getCell(totalColIndex).value = transportExportMode === "todas" ? currentTotals.total_general : currentTotals.total_pendiente;
    totalRow.getCell(totalColIndex).numFmt = '"$"#,##0.00';
    totalRow.getCell(totalColIndex).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `gestion_logistica_${activeTab}_${transportExportMode}_${todayISO()}.xlsx`);
    showNotice(`Excel de ${isLogistica ? "Logística" : "Transporte"} exportado`, "Éxito");
  };

  const exportToPDF = () => {
    if (!isPremiumUnlocked) return showNotice("Exportar PDF es Premium", "Premium");

    const doc = new jsPDF();
    
    const exportRecords = transportExportMode === "total_pendientes"
      ? []
      : (transportExportMode === "todas" || isLogistica
        ? filteredRecords
        : filteredRecords.filter(r => r.status === "Pendiente"));
    const exportColumns = currentColumns.filter((column) => column !== "acciones");
    const PRIMARY_COLOR = [51, 153, 170];

    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(14, 10, 182, 20, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(companyName || exportSettings.empresa, 20, 23);

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${exportSettings.direccion}  |  Tel: ${exportSettings.telefono}  |  ${exportSettings.correo}`, 14, 35);
    doc.text(exportSettings.ubicacion, 14, 39);

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text(`${exportSettings.tituloReporte} - ${isLogistica ? "LOGÍSTICA" : "TRANSPORTE"}`, 14, 46);

    const header = exportColumns.map((column) => {
      // Para transportista, cambiar "Costo T" a "Costo JAQ-Transport"
      if (isLogistica && column === 'costo_t') return 'COSTO JAQ-TRANSPORT';
      return currentColumnLabels[column].toUpperCase();
    });
    
    const body = exportRecords.map((record) => (
      exportColumns.map((column) => {
        if (column === "fecha") return record.fecha;
        const numericCols = isLogistica 
          ? ['costo_t', 'costo_l', 'total', 'saldo_a_favor', 'total_pendiente']
          : ['costo', 'total'];
        if (numericCols.includes(column)) return formatCurrency(record[column]);
        return record[column] || "-";
      })
    ));

    autoTable(doc, {
      startY: 50,
      head: [header],
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: [226, 232, 240],
        textColor: [30, 41, 59],
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      columnStyles: {
        [exportColumns.indexOf('status')]: { fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && exportColumns[data.column.index] === 'status') {
          const statusValue = data.cell.raw;
          if (statusValue === 'Pagado') data.cell.styles.textColor = [16, 185, 129];
          if (statusValue === 'Pendiente') data.cell.styles.textColor = [239, 68, 68];
        }
      }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text(transportExportMode === "todas" ? "TOTAL GENERAL:" : "TOTAL PENDIENTE:", 120, finalY);
    doc.setTextColor(239, 68, 68);
    doc.text(formatCurrency(transportExportMode === "todas" ? currentTotals.total_general : currentTotals.total_pendiente), 170, finalY);

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount} - Generado el ${todayISO()}`, 14, doc.internal.pageSize.height - 10);
    }

    doc.save(`gestion_logistica_${activeTab}_pendientes_${todayISO()}.pdf`);
    showNotice("PDF exportado (solo pendientes)", "Éxito");
  };

  const handleMassStatusChange = async (status) => {
    if (!selectedIds.length) return;
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    
    const basePath = activeApiBasePath;
    const selected = currentRecords.filter((r) => selectedIds.includes(r.id));
    await Promise.all(selected.map((record) => apiRequest("put", `${basePath}/records/${record.id}`, { data: { status } })));
    await reloadBackendData();
    setSelectedIds([]);
    showNotice(`Se actualizaron ${selectedIds.length} registros`, "Éxito");
  };

  const handleMassDelete = async () => {
    if (!selectedIds.length) return;
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    
    const basePath = activeApiBasePath;
    await Promise.all(selectedIds.map((id) => apiRequest("delete", `${basePath}/records/${id}`)));
    await reloadBackendData();
    setSelectedIds([]);
    showNotice("Registros eliminados", "Éxito");
  };

  const handleMassDuplicate = async () => {
    if (!selectedIds.length) return;
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    
    const basePath = activeApiBasePath;
    const selected = currentRecords.filter((r) => selectedIds.includes(r.id));
    
    for (const record of selected) {
      const newRecord = isLogistica
        ? { fecha: record.fecha, cliente: record.cliente, costo_t: record.costo_t, transporte: record.transporte, servicio: record.servicio, costo_l: record.costo_l, status: record.status }
        : { fecha: record.fecha, cliente: record.cliente, costo: record.costo, carta_porte: record.carta_porte, servicio: record.servicio, shipment: record.shipment, status: record.status };
      await apiRequest("post", `${basePath}/records`, { data: newRecord });
    }
    
    await reloadBackendData();
    showNotice(`${selected.length} registros duplicados`, "Éxito");
  };

  const handleLoadUploadedFile = async (uploadId) => {
    setLoadingUploadId(uploadId);
    if (!backendAvailable) {
      setLoadingUploadId(null);
      return showNotice("Servidor no disponible", "Error");
    }
    
    const basePath = activeApiBasePath;
    await apiRequest("post", `${basePath}/uploads/${uploadId}/load`);
    await reloadBackendData();
    showNotice("Historial cargado", "Éxito");
    setLoadingUploadId(null);
  };

  const handleDeleteUploadedFile = async (uploadId) => {
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    
    const basePath = activeApiBasePath;
    await apiRequest("delete", `${basePath}/uploads/${uploadId}`);
    await reloadBackendData();
    showNotice("Archivo eliminado del historial", "Éxito");
  };

  const handleClearAllData = async () => {
    setShowClearAllConfirm(true);
  };

  const confirmClearAllData = async () => {
    setClearingAll(true);
    setShowClearAllConfirm(false);
    if (!backendAvailable) {
      setClearingAll(false);
      return showNotice("Servidor no disponible", "Error");
    }
    
    const basePath = activeApiBasePath;
    await Promise.all([
      apiRequest("delete", `${basePath}/records`),
      apiRequest("delete", `${basePath}/uploads`)
    ]);
    await reloadBackendData();
    setSearchTerm("");
    setStatusFilter("Todos");
    setSelectedIds([]);
    setClearingAll(false);
    showNotice(`Todos los datos de ${isLogistica ? "Logística" : "Transporte"} fueron eliminados`, "Éxito");
  };

  const handleSaveFavoriteFilter = () => {
    if (!isPremiumUnlocked) return showNotice("Guardar filtros favoritos es Premium", "Premium");
    setFavoriteFilterInput("");
    setShowFavoriteFilterModal(true);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCompanyLogo(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleInsertEmptyRow = async () => {
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    const basePath = activeApiBasePath;
    const payload = isLogistica
      ? { fecha: todayISO(), cliente: selectedClient === "Todos" ? "" : selectedClient, costo_t: 0, transporte: "", servicio: "", costo_l: 0, status: "Pendiente", saldo_a_favor: 0 }
      : { fecha: todayISO(), cliente: selectedClient === "Todos" ? "" : selectedClient, costo: 0, carta_porte: "", servicio: "", shipment: "", status: "Pendiente" };
    await apiRequest("post", `${basePath}/records`, { data: payload });
    await reloadBackendData();
    showNotice("Fila vacía insertada", "Éxito");
  };

  const handleCreateClient = async () => {
    if (!clientForm.nombre.trim()) return showNotice("El nombre del cliente es obligatorio", "Error");
    if (editingClientId) {
      await apiRequest("put", `/clients/${editingClientId}`, { data: clientForm });
    } else {
      await apiRequest("post", "/clients", { data: clientForm });
    }
    setClientForm({ nombre: "", correo: "", telefono: "" });
    setEditingClientId(null);
    setShowClientModal(false);
    await reloadBackendData();
    showNotice(editingClientId ? "Cliente actualizado" : "Cliente registrado", "Éxito");
  };

  const handleEditClient = (client) => {
    setClientForm({ nombre: client.nombre || "", correo: client.correo || "", telefono: client.telefono || "" });
    setEditingClientId(client.id);
    setShowClientModal(true);
  };

  const handleDeleteClient = async (clientId) => {
    const confirmed = window.confirm("¿Eliminar este cliente?");
    if (!confirmed) return;
    await apiRequest("delete", `/clients/${clientId}`);
    await reloadBackendData();
    showNotice("Cliente eliminado", "Éxito");
  };

  const confirmSaveFavoriteFilter = () => {
    const name = favoriteFilterInput.trim();
    if (!name) return showNotice("Escribe un nombre para el filtro favorito.", "Falta información");
    setFavoriteFilters((prev) => [{ id: crypto.randomUUID(), name, filters: premiumFilters }, ...prev]);
    setShowFavoriteFilterModal(false);
    setFavoriteFilterInput("");
    showNotice("Filtro favorito guardado", "Éxito");
  };

  return (
    <div className={`app-container ${darkMode ? "dark-theme dark" : ""}`}>
      <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-top">
            <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((prev) => !prev)}>
              <SidebarSimple size={20} />
            </button>
            {!sidebarCollapsed && <h2>{APP_NAME}</h2>}
          </div>
          <nav className="sidebar-nav">
            <button className={`sidebar-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => setActiveSection("dashboard")}>
              <ChartLine size={18} /> {!sidebarCollapsed && "Dashboard"}
            </button>
            <button className={`sidebar-item ${activeSection === "principal" ? "active" : ""}`} onClick={() => setActiveSection("principal")}>
              <Package size={18} /> {!sidebarCollapsed && "Pantalla Principal"}
            </button>
            <button className={`sidebar-item ${activeSection === "clientes" ? "active" : ""}`} onClick={() => setActiveSection("clientes")}>
              <Users size={18} /> {!sidebarCollapsed && "Clientes"}
            </button>
            <button className={`sidebar-item ${activeSection === "licencia" ? "active" : ""}`} onClick={() => setActiveSection("licencia")}>
              <Crown size={18} /> {!sidebarCollapsed && "Licencia y Premium"}
            </button>
            <button className={`sidebar-item ${activeSection === "configuracion" ? "active" : ""}`} onClick={() => setActiveSection("configuracion")}>
              <Gear size={18} /> {!sidebarCollapsed && "Configuración"}
            </button>
          </nav>
        </aside>
        <div className="app-main">
      <header className="app-header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              {companyLogo ? <img src={companyLogo} alt="Logo empresa" className="h-10 w-10 object-contain rounded" /> : null}
              <h1 className="text-2xl font-bold text-slate-900">{companyName || APP_NAME}</h1>
            </div>
            <p className="text-sm text-slate-500">
              {APP_DESCRIPTION} · {serverBooting
                ? "Iniciando servidor..."
                : backendAvailable
                  ? "Conectado al servidor"
                  : "Error: Servidor no disponible"} • {isLogistica ? "Logística" : "Transporte"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="theme-switch" role="group" aria-label="Cambiar tema">
              <Sun size={16} className={!darkMode ? "theme-icon active" : "theme-icon"} />
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                className={`theme-switch-track ${darkMode ? "dark" : ""}`}
                aria-label={darkMode ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                aria-pressed={darkMode}
              >
                <span className="theme-switch-thumb" />
              </button>
              <Moon size={16} className={darkMode ? "theme-icon active" : "theme-icon"} />
            </div>
            <button onClick={() => setShowOptionsModal(true)} className="btn-primary">
              <Files size={20} weight="duotone" />Opciones
            </button>
          </div>
        </div>
      </header>

      <main className="main-content max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        {licenseAlert && (
          <div className={`license-alert ${licenseAlert.level}`}>
            <p>{licenseAlert.text}</p>
            <button className="btn-primary" onClick={() => window.open(RENEW_PAGE_URL, "_blank", "noopener,noreferrer")}>Renovar licencia</button>
          </div>
        )}
        {activeSection === "dashboard" && isPremiumUnlocked && (
          <div className="mb-6">
            {activeTab === "logistica"
              ? <PremiumDashboardLogistica records={logisticaRecords} />
              : <PremiumDashboardTransportista records={transportistaRecords} />}
          </div>
        )}
        {activeSection === "clientes" && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Clientes</h2>
              <div className="flex items-center gap-2">
                <button className={`btn-secondary ${clientViewMode === "lista" ? "ring-2 ring-blue-700" : ""}`} onClick={() => setClientViewMode("lista")}><List size={16} />Lista</button>
                <button className={`btn-secondary ${clientViewMode === "tarjetas" ? "ring-2 ring-blue-700" : ""}`} onClick={() => setClientViewMode("tarjetas")}><SquaresFour size={16} />Tarjetas</button>
              </div>
            </div>
            {clientViewMode === "tarjetas" ? (
              <div className="grid md:grid-cols-2 gap-4">
                {clients.map((client) => (
                  <div key={client.id} className="metric-card">
                    <p className="font-semibold">{client.nombre}</p>
                    <p className="text-sm text-slate-500">{client.correo || "Sin correo"}</p>
                    <p className="text-sm text-slate-500">{client.telefono || "Sin teléfono"}</p>
                    <div className="mt-3 flex gap-2">
                      <button className="btn-secondary" onClick={() => handleEditClient(client)}>Editar</button>
                      <button className="btn-danger" onClick={() => handleDeleteClient(client.id)}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id}>
                        <td>{client.nombre}</td><td>{client.correo || "-"}</td><td>{client.telefono || "-"}</td>
                        <td className="flex gap-2"><button className="btn-secondary" onClick={() => handleEditClient(client)}>Editar</button><button className="btn-danger" onClick={() => handleDeleteClient(client.id)}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {activeSection === "licencia" && (
          <div className="space-y-4 mb-6">
            <h2 className="text-xl font-bold">Licencia y Premium</h2>
            <p>Estado premium: <strong>{isPremiumUnlocked ? "Activo" : "Inactivo"}</strong></p>
            <p>Token actual: <code>{localStorage.getItem(STORAGE_KEYS.premiumToken) || "No registrado"}</code></p>
            <button className="btn-primary" onClick={() => setShowPremiumModal(true)}>Activar Premium</button>
          </div>
        )}
        {activeSection === "configuracion" && (
          <div className="space-y-5 mb-6">
            <AutoSaveConfig onSave={reloadBackendData} />
            <div className="metric-card">
              <h3 className="font-semibold mb-2">Información del Sistema</h3>
              <p className="text-slate-600">{APP_NAME}</p>
              <p className="text-slate-600">{APP_DESCRIPTION}</p>
              <p className="text-xs text-slate-500 mt-2">Auto guardado: {autoSave.enabled ? "Activo" : "Inactivo"} · Intervalo: {Math.round(Number(autoSave.interval) / 60000)} min</p>
            </div>
            <div className="metric-card">
              <h3 className="font-semibold mb-2">Persistencia de Datos</h3>
              <p className="text-slate-700">Tus datos están seguros</p>
              <p className="text-sm text-slate-500">Todos tus datos se guardan de forma segura. Esto incluye registros, clientes, configuración, filtros, preferencias y datos de licencia.</p>
            </div>
          </div>
        )}
        {activeSection === "principal" && (
        <>
        {/* Pestañas principales */}
        <div className="hidden md:flex border-b border-slate-300 mb-6">
          {TABS.map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => { setActiveTab(tab.id); setSelectedIds([]); setSearchTerm(""); setStatusFilter("Todos"); }} 
              className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-colors border-b-2 -mb-px ${activeTab === tab.id ? "text-[#002FA7] border-[#002FA7] bg-blue-50/50" : "text-slate-500 border-transparent hover:text-slate-700"}`}
            >
              <tab.icon size={22} weight={activeTab === tab.id ? "fill" : "regular"} />
              {tab.label}
            </button>
          ))}
        </div>

        {isLogistica && (
          <div className="flex gap-2 mb-4">
            <button className={`filter-chip ${activeLogisticaView === "archivo_principal" ? "active" : ""}`} onClick={() => setActiveLogisticaView("archivo_principal")}>Archivo Principal</button>
            <button className={`filter-chip ${activeLogisticaView === "cliente" ? "active" : ""}`} onClick={() => setActiveLogisticaView("cliente")}>Vista Cliente</button>
            <button className={`filter-chip ${activeLogisticaView === "transportista" ? "active" : ""}`} onClick={() => setActiveLogisticaView("transportista")}>Vista Transportista</button>
          </div>
        )}

        {/* Selector móvil de sección */}
        <div className="md:hidden mb-4">
          <select 
            value={activeTab} 
            onChange={(e) => { setActiveTab(e.target.value); setSelectedIds([]); setSearchTerm(""); setStatusFilter("Todos"); }}
            className="form-input w-full text-lg font-bold"
          >
            {TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>{tab.label}</option>
            ))}
          </select>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard label="Total General" value={currentTotals.total_general} variant="default" />
          <MetricCard label="Total Pendiente" value={currentTotals.total_pendiente} variant="danger" />
          <MetricCard label="Total Pagado" value={currentTotals.total_pagado} variant="success" />
          {isLogistica && isPremiumUnlocked && (
            <MetricCard label="Total Saldo a Favor" value={transportistaTotals.total_saldo_a_favor} variant="default" />
          )}
        </div>

        {/* Modal de exportación */}
        {exportSettings.showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9000] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-[#002FA7]">
                  <Files size={28} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">Configurar Exportación</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{isLogistica ? "Logística" : "Transporte"}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Formato</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportSettings({ ...exportSettings, lastFormat: 'excel' })}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${exportSettings.lastFormat === 'excel' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-400'}`}
                    >
                      <FileXls size={20} /> Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPremiumUnlocked) {
                          showNotice("PDF es Premium", "Premium");
                        } else {
                          setExportSettings({ ...exportSettings, lastFormat: 'pdf' });
                        }
                      }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${exportSettings.lastFormat === 'pdf' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-100 text-slate-400'}`}
                    >
                      {!isPremiumUnlocked ? <Lock size={18} /> : <FilePdf size={20} />} PDF
                    </button>
                  </div>
                </div>

                {!isLogistica && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Exportación Transporte</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => setTransportExportMode("pendientes")} className={`btn-secondary ${transportExportMode === "pendientes" ? "ring-2 ring-blue-500" : ""}`}>Solo Pendientes</button>
                      <button type="button" onClick={() => setTransportExportMode("total_pendientes")} className={`btn-secondary ${transportExportMode === "total_pendientes" ? "ring-2 ring-blue-500" : ""}`}>Total Pendientes</button>
                      <button type="button" onClick={() => setTransportExportMode("todas")} className={`btn-secondary ${transportExportMode === "todas" ? "ring-2 ring-blue-500" : ""}`}>Todas las Columnas</button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Empresa</label>
                  <input className="form-input w-full" value={companyName} onChange={(e) => setCompanyName(e.target.value.toUpperCase())} />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Correo</label>
                  <input className="form-input w-full" value={exportSettings.correo} onChange={(e) => setExportSettings({ ...exportSettings, correo: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Teléfono</label>
                    <input className="form-input w-full" value={exportSettings.telefono} onChange={(e) => setExportSettings({ ...exportSettings, telefono: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Dirección</label>
                    <input className="form-input w-full" value={exportSettings.direccion} onChange={(e) => setExportSettings({ ...exportSettings, direccion: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  className={`flex-1 py-4 rounded-2xl font-bold text-white shadow-lg transition-transform active:scale-95 ${exportSettings.lastFormat === 'pdf' ? 'bg-red-500' : 'bg-emerald-500'}`}
                  onClick={() => {
                    if (exportSettings.lastFormat === 'pdf') {
                      if (!isPremiumUnlocked) return showNotice("PDF es Premium", "Premium");
                      exportToPDF();
                    } else {
                      handleExportExcel();
                    }
                    setExportSettings(prev => ({ ...prev, showModal: false }));
                  }}
                >
                  Descargar
                </button>
                <button className="px-6 rounded-2xl font-bold text-slate-500 bg-slate-100" onClick={() => setExportSettings(prev => ({ ...prev, showModal: false }))}>
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botón Dashboard Premium */}
        {isPremiumUnlocked && (
          <div className="flex justify-end mb-4">
            <button onClick={() => setActiveSection("dashboard")} className="btn-primary flex items-center gap-2 bg-[#002FA7] hover:bg-blue-800">
              <ChartLine size={20} weight="bold" />
              Ir al Dashboard
            </button>
          </div>
        )}

        {/* Barra principal */}
        <div className="flex flex-col gap-3 mb-4 md:flex-row md:justify-between md:items-center">
          <p className="text-sm text-slate-500">{displayedRecords.length} registros en {isLogistica ? "Logística" : "Transporte"} • Cliente: {selectedClient}</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <button onClick={() => { setSelectedRecord(null); setShowForm(true); }} className="btn-primary">
              <Plus size={20} />Añadir Registro ({isLogistica ? "Logística" : "Transporte"})
            </button>
          </div>
        </div>

        {/* Filtros Premium */}
        {isPremiumUnlocked && (
          <div className="premium-toolbar mb-4">
            <div className="premium-filters">
              <div className="search-input-wrapper">
                <MagnifyingGlass size={18} className="text-slate-400" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar" className="search-input" />
              </div>
              <div className="filter-chip-group">
                {["Todos", "Pendiente", "Pagado"].map((f) => (
                  <button key={f} onClick={() => setStatusFilter(f)} className={`filter-chip ${statusFilter === f ? "active" : ""}`}>{f}</button>
                ))}
              </div>
              <input type="date" className="form-input" value={premiumFilters.from} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, from: e.target.value }))} />
              <input type="date" className="form-input" value={premiumFilters.to} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, to: e.target.value }))} />
              <input type="text" className="form-input" placeholder="Transportista / Cliente" value={premiumFilters.field} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, field: e.target.value }))} />
              <input type="text" className="form-input" placeholder="Servicio" value={premiumFilters.servicio} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, servicio: e.target.value }))} />
              <button className="btn-secondary" onClick={handleSaveFavoriteFilter}><FloppyDisk size={16} />Guardar</button>
              <select
                className="form-input"
                onChange={(e) => {
                  if (!e.target.value) {
                    setPremiumFilters({ from: "", to: "", field: "", servicio: "", status: "Todos" });
                    setSearchTerm("");
                    setStatusFilter("Todos");
                    return;
                  }
                  const f = favoriteFilters.find((x) => x.id === e.target.value);
                  if (f) setPremiumFilters(f.filters);
                }}
                defaultValue=""
              >
                <option value="">Sin filtro guardado</option>
                {favoriteFilters.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {isPremiumUnlocked && selectedIds.length > 0 && (
          <div className="selection-action-bar">
            <div className="selection-action-content">
              <p className="selection-counter">{selectedIds.length} seleccionados</p>
              <div className="premium-bulk">
                <button className="btn-secondary" onClick={() => handleMassStatusChange("Pagado")}><ArrowsClockwise size={16} />Pagado</button>
                <button className="btn-secondary" onClick={() => handleMassStatusChange("Pendiente")}><ArrowsClockwise size={16} />Pendiente</button>
                <button className="btn-secondary" onClick={handleMassDuplicate}><Copy size={16} />Duplicar</button>
                <button className="btn-danger" onClick={handleMassDelete}><Trash size={16} />Eliminar</button>
                <button className="btn-secondary" onClick={() => setSelectedIds([])}><X size={16} />Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Manejador de clientes */}
        <div className="upload-history mb-6">
          <div className="upload-history-header">
            <h3><ClockCounterClockwise size={18} /> Manejador de Clientes</h3>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            <button onClick={() => setSelectedClient("Todos")} className={`filter-chip ${selectedClient === "Todos" ? "active" : ""}`}>Todos</button>
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client.nombre)}
                className={`filter-chip ${selectedClient === client.nombre ? "active" : ""}`}
              >
                {client.nombre}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla de registros */}
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><SpinnerGap className="spinner inline-block" size={32} /><p className="mt-2">Cargando...</p></div>
          ) : displayedRecords.length === 0 ? (
            <div className="empty-state"><Warning size={48} className="mx-auto mb-4 text-slate-400" /><p className="text-lg font-medium">No hay registros</p></div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {isPremiumUnlocked && <th></th>}
                    {currentColumns.map((column) => {
                      const numericCols = isLogistica 
                        ? ["costo_t", "costo_l", "total", "saldo_a_favor", "total_pendiente"]
                        : ["costo", "total"];
                      const centerCol = column === "acciones";
                      return (
                        <th key={column} className={numericCols.includes(column) ? "text-right" : centerCol ? "text-center" : ""}>
                          {currentColumnLabels[column]}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedRecords.map((record) => (
                    <tr key={record.id} className={selectedIds.includes(record.id) ? "row-selected" : ""}>
                      {isPremiumUnlocked && (
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(record.id)} 
                            onChange={() => setSelectedIds((prev) => prev.includes(record.id) ? prev.filter((id) => id !== record.id) : [...prev, record.id])} 
                          />
                        </td>
                      )}
                      
                      {currentColumns
                        .filter((column) => column !== "acciones")
                        .map((column) => {
                          switch (column) {
                            case "fecha":
                              return <td key={column}>{formatDate(record.fecha)}</td>;
                            case "servicio":
                              return <td key={column}>{record.servicio || "-"}</td>;
                            case "costo_l":
                              return <td key={column} className="text-right tabular-nums">{formatCurrency(record.costo_l)}</td>;
                            case "status":
                              return <td key={column}><StatusBadge status={record.status} /></td>;
                            case "total_pendiente":
                              return <td key={column} className="text-right tabular-nums">{formatCurrency(record.total_pendiente)}</td>;
                            case "costo_t":
                              return <td key={column} className="text-right tabular-nums">{formatCurrency(record.costo_t)}</td>;
                            case "transporte":
                              return <td key={column}>{record.transporte || "-"}</td>;
                            case "total":
                              return <td key={column} className="text-right tabular-nums">{formatCurrency(record.total)}</td>;
                            case "saldo_a_favor":
                              return <td key={column} className="text-right tabular-nums">{formatCurrency(record.saldo_a_favor)}</td>;
                            case "costo":
                              return <td key={column} className="text-right tabular-nums">{formatCurrency(record.costo)}</td>;
                            case "carta_porte":
                              return <td key={column}>{record.carta_porte || "-"}</td>;
                            case "shipment":
                              return <td key={column}>{record.shipment || "-"}</td>;
                            default:
                              return <td key={column}>-</td>;
                          }
                        })}
                      
                      {currentColumns.includes("acciones") && (
                        <td className="text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => { if (!isPremiumUnlocked) return; setSelectedRecord(record); setShowForm(true); }}
                              className="p-1 hover:bg-slate-100 rounded disabled:opacity-40"
                              disabled={!isPremiumUnlocked}
                              title={isPremiumUnlocked ? "Editar" : "Premium"}
                            >
                              <PencilSimple size={18} />
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(record.id)}
                              className="p-1 hover:bg-red-50 rounded"
                              title="Eliminar"
                            >
                              <Trash size={18} className="text-red-500" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        )}
      </main>
      </div>
      </div>

      {/* Modal de formulario */}
      {showForm && (
        <>
          <div className="dialog-overlay" onClick={() => { setShowForm(false); setSelectedRecord(null); }} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              {selectedRecord ? "Editar Registro" : "Nuevo Registro"} - {isLogistica ? "Logística" : "Transporte"}
            </h2>
            {isLogistica ? (
              <TransportistaForm record={selectedRecord} onSave={handleSaveRecord} onCancel={() => { setShowForm(false); setSelectedRecord(null); }} loading={saving} clients={clients} />
            ) : (
              <LogisticaForm record={selectedRecord} onSave={handleSaveRecord} onCancel={() => { setShowForm(false); setSelectedRecord(null); }} loading={saving} clients={clients} />
            )}
          </div>
        </>
      )}

      {/* Modal Premium */}
      {showPremiumModal && (
        <>
          <div className="dialog-overlay" onClick={() => setShowPremiumModal(false)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Activar Suscripción Premium</h2>
            <p className="text-sm text-slate-500 mb-4">Ingresa tu token premium (QBP/QBP2).</p>
            <input type="text" value={premiumKeyInput} onChange={(e) => setPremiumKeyInput(e.target.value)} className="form-input w-full" placeholder="Token Premium" />
            <div className="flex gap-3 mt-4">
              <button className="btn-primary flex-1" onClick={async () => {
                const check = await validatePremiumToken(premiumKeyInput.trim());
                if (!check.valid) return showNotice(`Token premium inválido: ${check.reason}`, "Error");
                setIsPremiumUnlocked(true);
                localStorage.setItem(STORAGE_KEYS.premiumToken, premiumKeyInput.trim());
                setShowPremiumModal(false);
                setShowPremiumExpiredModal(false);
                setPremiumExpiredReason("");
                setLicenseAlert(null);
                setPremiumKeyInput("");
                showNotice("Premium activado", "Éxito");
              }}>Activar</button>
              <button className="btn-secondary" onClick={() => setShowPremiumModal(false)}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de opciones */}
      {showOptionsModal && (
        <>
          <div className="dialog-overlay" onClick={() => setShowOptionsModal(false)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Opciones</h2>
            <div className="space-y-5">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Subir archivos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="btn-primary cursor-pointer">
                    <input type="file" accept=".xlsx,.xls" onChange={(e) => { if (activeTab !== "logistica") setActiveTab("logistica"); handleFileUpload(e, "/transportista"); }} className="hidden" disabled={uploading} />
                    {uploading ? <SpinnerGap className="spinner" size={20} /> : <UploadSimple size={20} />}
                    Subir Logística
                  </label>
                  <label className="btn-secondary cursor-pointer">
                    <input type="file" accept=".xlsx,.xls" onChange={(e) => { if (activeTab !== "transporte") setActiveTab("transporte"); handleFileUpload(e, "/logistica"); }} className="hidden" disabled={uploading} />
                    <UploadSimple size={20} />
                    Subir Transportes
                  </label>
                  <label className="btn-secondary cursor-pointer">
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    <UploadSimple size={20} />
                    Logo
                  </label>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Modificar tablas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button onClick={() => { setShowClientModal(true); setShowOptionsModal(false); }} className="btn-secondary"><Plus size={18} />Cliente</button>
                  <button onClick={handleInsertEmptyRow} className="btn-secondary"><Plus size={18} />Fila vacía</button>
                  <button onClick={handleClearAllData} className="btn-danger" disabled={clearingAll}>{clearingAll ? <SpinnerGap className="spinner" size={20} /> : <Trash size={20} />}Borrar todo</button>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Acciones de app</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button onClick={() => { setExportSettings(prev => ({ ...prev, showModal: true })); setShowOptionsModal(false); }} className="btn-primary"><FileXls size={20} weight="bold" />Exportar Reporte</button>
                  <button
                    onClick={() => {
                      if (isPremiumUnlocked) {
                        setShowDeactivatePremiumConfirm(true);
                      } else {
                        setShowPremiumModal(true);
                      }
                    }}
                    className="btn-secondary"
                  >
                    {isPremiumUnlocked ? <LockOpen size={20} /> : <Lock size={20} />}{isPremiumUnlocked ? "Premium" : "Activar"}
                  </button>
                </div>
              </section>
            </div>
            <div className="mt-4">
              <button className="btn-secondary w-full justify-center" onClick={() => setShowOptionsModal(false)}>Cerrar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de premium expirado al abrir */}
      {showPremiumExpiredModal && (
        <>
          <div className="dialog-overlay" />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Suscripción Premium vencida</h2>
            <p className="text-sm text-slate-500 mb-4">
              Tu suscripción premium terminó ({premiumExpiredReason || "caducada"}). Puedes renovar ahora o continuar usando la app sin premium.
            </p>
            <div className="flex gap-3">
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  window.open(RENEW_PAGE_URL, "_blank", "noopener,noreferrer");
                  setShowPremiumExpiredModal(false);
                }}
              >
                Renovar suscripción
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowPremiumExpiredModal(false)}>
                Usar sin premium
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación para desactivar premium */}
      {showDeactivatePremiumConfirm && (
        <>
          <div className="dialog-overlay" onClick={() => setShowDeactivatePremiumConfirm(false)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Desactivar modo Premium</h2>
            <p className="text-sm text-slate-500 mb-5">
              Estás a punto de desactivar el modo Premium.
              Algunas funciones avanzadas dejarán de estar disponibles.
              ¿Deseas continuar?
            </p>
            <div className="flex gap-3">
              <button
                className="btn-danger flex-1"
                onClick={() => {
                  setIsPremiumUnlocked(false);
                  localStorage.removeItem(STORAGE_KEYS.premiumToken);
                  setShowDeactivatePremiumConfirm(false);
                }}
              >
                Confirmar
              </button>
              <button className="btn-secondary flex-1" onClick={() => setShowDeactivatePremiumConfirm(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación de borrar */}
      {showDeleteConfirm && (
        <>
          <div className="dialog-overlay" onClick={() => setShowDeleteConfirm(null)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-4">¿Eliminar registro?</h2>
            <p className="text-sm text-slate-500 mb-4">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={() => handleDeleteRecord(showDeleteConfirm)}>Eliminar</button>
              <button className="btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación borrar todo */}
      {showClearAllConfirm && (
        <>
          <div className="dialog-overlay" onClick={() => setShowClearAllConfirm(false)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-4">¿Borrar todos los datos de {isLogistica ? "Logística" : "Transporte"}?</h2>
            <p className="text-sm text-slate-500 mb-4">Se eliminarán todos los registros y el historial de archivos.</p>
            <div className="flex gap-3">
              <button className="btn-danger flex-1" onClick={confirmClearAllData}>Borrar todo</button>
              <button className="btn-secondary" onClick={() => setShowClearAllConfirm(false)}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal filtro favorito */}
      {showFavoriteFilterModal && (
        <>
          <div className="dialog-overlay" onClick={() => setShowFavoriteFilterModal(false)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Guardar filtro favorito</h2>
            <input type="text" value={favoriteFilterInput} onChange={(e) => setFavoriteFilterInput(e.target.value)} className="form-input w-full" placeholder="Nombre del filtro" />
            <div className="flex gap-3 mt-4">
              <button className="btn-primary flex-1" onClick={confirmSaveFavoriteFilter}>Guardar</button>
              <button className="btn-secondary" onClick={() => setShowFavoriteFilterModal(false)}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de aviso */}
      {showClientModal && (
        <>
          <div className="dialog-overlay" onClick={() => { setShowClientModal(false); setEditingClientId(null); }} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-4">{editingClientId ? "Editar Cliente" : "Registrar Cliente"}</h2>
            <div className="space-y-3">
              <input className="form-input w-full" placeholder="Nombre" value={clientForm.nombre} onChange={(e) => setClientForm((prev) => ({ ...prev, nombre: e.target.value }))} />
              <input className="form-input w-full" placeholder="Correo" value={clientForm.correo} onChange={(e) => setClientForm((prev) => ({ ...prev, correo: e.target.value }))} />
              <input className="form-input w-full" placeholder="Teléfono" value={clientForm.telefono} onChange={(e) => setClientForm((prev) => ({ ...prev, telefono: e.target.value }))} />
              <p className="text-xs text-slate-500">Clientes registrados: {clients.length}</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn-primary flex-1" onClick={handleCreateClient}>Guardar</button>
              <button className="btn-secondary" onClick={() => { setShowClientModal(false); setEditingClientId(null); }}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de aviso */}
      {showLicenseOnboarding && (
        <>
          <div className="dialog-overlay" />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Primera activación de licencia</h2>
            <p className="text-sm text-slate-500 mb-4">No tienes una licencia activa. Haz clic aquí para adquirir una.</p>
            <div className="space-y-3">
              <input className="form-input w-full" placeholder="Nombre de usuario" value={licenseProfile.username} onChange={(e) => setLicenseProfile((prev) => ({ ...prev, username: e.target.value }))} />
              <input className="form-input w-full" placeholder="Nombre completo o empresa" value={licenseProfile.businessName} onChange={(e) => setLicenseProfile((prev) => ({ ...prev, businessName: e.target.value }))} />
              <LicensePurchasePrompt variant="inline" message="No tienes una licencia activa. Haz clic aquí para adquirir una." />
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn-primary flex-1" onClick={() => setShowLicenseOnboarding(false)} disabled={!licenseProfile.username || !licenseProfile.businessName}>Continuar</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de aviso */}
      {noticeModal.open && (
        <>
          <div className="dialog-overlay" onClick={() => setNoticeModal({ open: false, title: "", message: "" })} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-2">{noticeModal.title}</h2>
            <p className="text-sm text-slate-500 mb-4">{noticeModal.message}</p>
            <button className="btn-primary w-full" onClick={() => setNoticeModal({ open: false, title: "", message: "" })}>Aceptar</button>
          </div>
        </>
      )}
      <DeveloperSignature developerName="Gestión Logística y de Transportes" position="bottom-right" />
    </div>
  );
}

export default App;
