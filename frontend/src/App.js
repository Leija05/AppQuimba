import { useState, useEffect, useMemo } from "react";
import "@/App.css";
import axios from "axios";
import ExcelJS from 'exceljs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Files,
  Truck,
  Users,
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
  Download,
  Copy,
  CalendarBlank,
  Bell,
  ChartLine
} from "@phosphor-icons/react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "file-saver";

const STORAGE_KEYS = {
  premium: "quimbar-premium-unlocked",
  theme: "quimbar-theme",
  favoriteFilters: "quimbar-favorite-filters"
};

const PREMIUM_ACCESS_KEY = process.env.REACT_APP_PREMIUM_KEY;
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

const TABS = [
  { id: "principal", label: "Archivo Principal", icon: Files },
  { id: "transporte", label: "Transporte", icon: Truck },
  { id: "cliente", label: "Cliente", icon: Users },
  { id: "gestion", label: "Gestión", icon: PencilSimple }
];

const formatCurrency = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(value || 0);
const formatDate = (dateStr) => (!dateStr ? "-" : new Date(dateStr).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" }));
const toNumber = (value) => Number.parseFloat(value || 0) || 0;
const todayISO = () => new Date().toISOString().split("T")[0];
const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const applyFilters = (records, searchTerm, statusFilter, premiumFilters, premiumEnabled) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  return records.filter((record) => {
    const matchesStatus = statusFilter === "Todos" || record.status === statusFilter;
    const matchesSearch =
      !normalizedSearch ||
      [record.fecha, record.transportista, record.servicio, record.status].some((field) =>
        String(field || "").toLowerCase().includes(normalizedSearch)
      );

    if (!premiumEnabled) return matchesStatus && matchesSearch;

    const dateOk =
      (!premiumFilters.from || new Date(record.fecha) >= new Date(premiumFilters.from)) &&
      (!premiumFilters.to || new Date(record.fecha) <= new Date(premiumFilters.to));
    const transportistaOk = !premiumFilters.transportista || (record.transportista || "").toLowerCase().includes(premiumFilters.transportista.toLowerCase());
    const servicioOk = !premiumFilters.servicio || (record.servicio || "").toLowerCase().includes(premiumFilters.servicio.toLowerCase());
    const premiumStatusOk = !premiumFilters.status || premiumFilters.status === "Todos" || record.status === premiumFilters.status;

    return matchesStatus && matchesSearch && dateOk && transportistaOk && servicioOk && premiumStatusOk;
  });
};

const StatusBadge = ({ status }) => <span className={status === "Pagado" ? "badge-paid" : "badge-pending"}>{status}</span>;

const TAB_COLUMNS = {
  principal: ["fecha", "costo_t", "transportista", "servicio", "costo_l", "status", "total", "saldo_a_favor", "acciones"],
  transporte: ["fecha", "costo_t", "transportista", "servicio"],
  cliente: ["fecha", "servicio", "costo_l", "status"]
};

const COLUMN_LABELS = {
  fecha: "Fecha",
  costo_t: "Costo T",
  transportista: "Transportista",
  servicio: "Servicio",
  costo_l: "Costo L",
  status: "Status",
  total: "Total",
  saldo_a_favor: "Saldo a favor",
  acciones: "Acciones"
};

const MetricCard = ({ label, value, variant = "default" }) => {
  const colors = { default: "text-slate-900", success: "text-emerald-600", danger: "text-red-600" };
  return (
    <div className="metric-card" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colors[variant]}`}>{formatCurrency(value)}</p>
    </div>
  );
};

const RecordForm = ({ record, onSave, onCancel, loading }) => {
  const [form, setForm] = useState({
    fecha: record?.fecha || todayISO(),
    costo_t: record?.costo_t || 0,
    transportista: record?.transportista || "",
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
        // Al enviar, usamos los valores ya calculados en el cuerpo del componente
        onSave({
          ...form,
          costo_t: toNumber(form.costo_t),
          costo_l: toNumber(form.costo_l),
          total: calculatedTotal, // Asegura que Total = Costo L
          saldo_a_favor: calculatedSaldo, // Asegura que Saldo = L - T
        });
      }}
      className="space-y-4"
    >
      {/* Fecha y Transportista */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Fecha</label>
          <input
            type="date"
            name="fecha"
            value={form.fecha}
            onChange={handleChange}
            className="form-input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Transportista</label>
          <input
            type="text"
            name="transportista"
            value={form.transportista}
            onChange={handleChange}
            className="form-input w-full"
          />
        </div>
      </div>

      {/* Servicio/Cliente */}
      <div>
        <label className="block text-sm font-semibold mb-1 text-slate-700">Servicio/Cliente</label>
        <input
          type="text"
          name="servicio"
          value={form.servicio}
          onChange={handleChange}
          className="form-input w-full"
        />
      </div>

      {/* Costos y Total */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Costo T</label>
          <input
            type="number"
            name="costo_t"
            value={form.costo_t}
            onChange={handleChange}
            className="form-input w-full"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Costo L</label>
          <input
            type="number"
            name="costo_l"
            value={form.costo_l}
            onChange={handleChange}
            className="form-input w-full"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Total (Costo L)</label>
          <div className="form-input w-full bg-slate-100 tabular-nums font-medium text-slate-600">
            {formatCurrency(calculatedTotal)}
          </div>
        </div>
      </div>

      {/* Status y Saldo a Favor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="form-input w-full"
          >
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

      {/* Acciones */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          className="btn-primary flex-1"
          disabled={loading}
        >
          {loading ? <SpinnerGap className="spinner" size={20} /> : <Plus size={20} />}
          {record ? "Actualizar Registro" : "Guardar Registro"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          <X size={20} />
          Cancelar
        </button>
      </div>
    </form>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl">
        <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
        <p className="text-sm font-semibold text-emerald-600">Pagado: {formatCurrency(payload[0].value)}</p>
        <p className="text-sm font-semibold text-red-500">Pendiente: {formatCurrency(payload[1].value)}</p>
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Total: {formatCurrency(payload[0].value + payload[1].value)}</p>
        </div>
      </div>
    );
  }
  return null;
};

function App() {
  const [activeTab, setActiveTab] = useState("principal");
  const [records, setRecords] = useState([]);
  const [uploads, setUploads] = useState([]);
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
  const [premiumFilters, setPremiumFilters] = useState({ from: "", to: "", transportista: "", servicio: "", status: "Todos" });
  const [selectedIds, setSelectedIds] = useState([]);
  const [serverBooting, setServerBooting] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [noticeModal, setNoticeModal] = useState({ open: false, title: "", message: "" });
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [showFavoriteFilterModal, setShowFavoriteFilterModal] = useState(false);
  const [favoriteFilterInput, setFavoriteFilterInput] = useState("");
  const [showPremiumDashboard, setShowPremiumDashboard] = useState(false);
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

  useEffect(() => localStorage.setItem(STORAGE_KEYS.favoriteFilters, JSON.stringify(favoriteFilters)), [favoriteFilters]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.theme, darkMode ? "dark" : "light"), [darkMode]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.premium, isPremiumUnlocked ? "1" : "0"), [isPremiumUnlocked]);

  useEffect(() => {
    const loadFromBackend = async () => {
      const maxAttempts = 8;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const [recordsRes, uploadsRes] = await Promise.all([apiRequest("get", "/records"), apiRequest("get", "/uploads")]);
          setRecords(recordsRes.data || []);
          setUploads(uploadsRes.data || []);
          setBackendAvailable(true);
          setServerBooting(false);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }
      setBackendAvailable(false);
      setServerBooting(false);
      showNotice("No se pudo conectar con quimbar-server.exe. Reinicia la app.", "Error");
    };
    loadFromBackend();
  }, []);

  const totals = useMemo(() => {
    const total_pendiente = records.filter((r) => r.status === "Pendiente").reduce((sum, r) => sum + toNumber(r.total), 0);
    const total_pagado = records.filter((r) => r.status === "Pagado").reduce((sum, r) => sum + toNumber(r.total), 0);
    const total_costo_l_pendiente = records.filter((r) => r.status === "Pendiente").reduce((sum, r) => sum + toNumber(r.costo_l), 0);
    const total_general = total_pendiente + total_pagado;
    const total_saldo_a_favor = records.reduce((sum, r) => sum + toNumber(r.saldo_a_favor), 0);
    return {
      total_pendiente,
      total_pagado,
      total_costo_l_pendiente,
      total_general,
      total_saldo_a_favor
    };
  }, [records]);

  const filteredRecords = useMemo(
    () => applyFilters(records, searchTerm, statusFilter, premiumFilters, isPremiumUnlocked),
    [records, searchTerm, statusFilter, premiumFilters, isPremiumUnlocked]
  );
  const currentColumns = TAB_COLUMNS[activeTab] || TAB_COLUMNS.principal;

  const premiumAnalytics = useMemo(() => {
    // 1. AGRUPACIÓN POR MES (Flujo Mensual)
    const groupedByMonth = records.reduce((acc, record) => {
      const date = new Date(record.fecha || todayISO());
      const key = date.toLocaleDateString("es-MX", { month: 'short', year: '2-digit' }).toUpperCase();

      if (!acc[key]) acc[key] = { month: key, pendiente: 0, pagado: 0, total: 0, fullDate: date };
      const amount = toNumber(record.total);
      acc[key].total += amount;
      acc[key][record.status === "Pagado" ? "pagado" : "pendiente"] += amount;
      return acc;
    }, {});

    const sortedMonths = Object.values(groupedByMonth)
      .sort((a, b) => a.fullDate - b.fullDate)
      .slice(-6);

    // 2. TOPS (Transportistas y Clientes)
    const topTransportistas = Object.entries(
      records.reduce((acc, r) => {
        const key = (r.transportista || "Sin transportista").trim();
        acc[key] = (acc[key] || 0) + toNumber(r.total);
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const topClientes = Object.entries(
      records.reduce((acc, r) => {
        const key = (r.servicio || "Sin cliente").trim();
        acc[key] = (acc[key] || 0) + toNumber(r.costo_l);
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // --- NUEVA SECCIÓN: ANÁLISIS DE MÁRGENES (Utility Analysis) ---
    const totalCostoT = records.reduce((sum, r) => sum + toNumber(r.costo_t), 0);
    const totalCostoL = records.reduce((sum, r) => sum + toNumber(r.costo_l), 0);
    const margenUtilidad = totalCostoL - totalCostoT;
    const porcentajeMargen = totalCostoL > 0 ? (margenUtilidad / totalCostoL) * 100 : 0;

    // --- NUEVA SECCIÓN: PRONÓSTICO DE INGRESOS (Upcoming Cashflow) ---
    const hoy = new Date();
    const limiteProximo = new Date();
    limiteProximo.setDate(hoy.getDate() + 7); // Miramos 7 días hacia adelante

    const upcomingCashflow = records
      .filter(r => {
        const fechaRec = new Date(r.fecha);
        return r.status === "Pendiente" && fechaRec <= limiteProximo;
      })
      .sort((a, b) => toNumber(b.total) - toNumber(a.total))
      .slice(0, 3);

    const totalEsperado = upcomingCashflow.reduce((sum, r) => sum + toNumber(r.total), 0);

    // 3. ALERTAS Y ESTADOS
    const overdue = records.filter(r =>
      r.status === "Pendiente" &&
      (Date.now() - new Date(r.fecha).getTime()) / (1000 * 60 * 60 * 24) > 30
    );

    return {
      monthData: sortedMonths,
      topTransportistas,
      topClientes,
      overdue,
      incomplete: records.filter(r => !r.transportista || !r.servicio),
      // Exportamos las nuevas métricas
      margenUtilidad,
      porcentajeMargen,
      totalCostoT,
      totalCostoL,
      upcomingCashflow,
      totalEsperado
    };
  }, [records]);

  const reloadBackendData = async () => {
    const [recordsRes, uploadsRes] = await Promise.all([apiRequest("get", "/records"), apiRequest("get", "/uploads")]);
    setRecords(recordsRes.data || []);
    setUploads(uploadsRes.data || []);
  };

  const handleSaveRecord = async (data) => {
    setSaving(true);
    try {
      if (!backendAvailable) throw new Error("backend_unavailable");

      if (selectedRecord) {

        await apiRequest("put", `/records/${selectedRecord.id}`, { data });
      } else {
        await apiRequest("post", "/records", { data });
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
    if (!isPremiumUnlocked) return showNotice("Borrar registros es Premium", "Premium");
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    await apiRequest("delete", `/records/${id}`);
    await reloadBackendData();
    setShowDeleteConfirm(null);
    showNotice("Registro eliminado", "Éxito");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (serverBooting) {
      showNotice("Espera un momento a que termine de iniciar el servidor y vuelve a subir el archivo.", "Servidor iniciando");
      e.target.value = "";
      return;
    }
    if (!backendAvailable) {
      showNotice("No se detectó quimbar-server.exe en ejecución.", "Error");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiRequest("post", "/upload-excel", {
        data: formData,
        headers: { "Content-Type": "multipart/form-data" }
      });
      await reloadBackendData();
      showNotice(`${response.data?.records_imported || 0} registros importados`, "Éxito");
    } catch {
      showNotice("Error al procesar el Excel", "Error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(TABS.find(t => t.id === activeTab)?.label || 'Reporte');

    // 1. Obtener columnas dinámicas según la pestaña (excluyendo acciones)
    const exportColumns = currentColumns.filter((col) => col !== "acciones");

    // Configurar las columnas en ExcelJS
    worksheet.columns = exportColumns.map(col => ({
      header: COLUMN_LABELS[col]?.toUpperCase() || col.toUpperCase(),
      key: col,
      width: col === 'servicio' ? 45 : col === 'transportista' ? 25 : 15
    }));

    // 2. DISEÑO DE CABECERA (JAQ TRANSPORT LOGISTIC / Datos del Modal)
    worksheet.insertRow(1, []);
    worksheet.insertRow(2, []);
    worksheet.mergeCells(`A1:${String.fromCharCode(64 + exportColumns.length)}2`);

    const mainHeader = worksheet.getCell('A1');
    mainHeader.value = exportSettings.empresa;
    mainHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3399AA' } };
    mainHeader.font = { name: 'Arial Black', color: { argb: 'FFFFFF' }, size: 20, bold: true };
    mainHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Sub-cabeceras (Dirección, Teléfono, etc.)
    worksheet.getRow(3).values = [exportSettings.direccion, '', '', exportSettings.telefono, '', exportSettings.correo];
    worksheet.getRow(4).values = [exportSettings.ubicacion];

    [3, 4].forEach(rowNum => {
      const row = worksheet.getRow(rowNum);
      row.font = { bold: true, size: 9 };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
    });

    // 3. ENCABEZADOS DE TABLA (Fila 6)
    const headerRow = worksheet.getRow(6);
    headerRow.values = exportColumns.map(col => COLUMN_LABELS[col]?.toUpperCase());

    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
      cell.font = { bold: true, color: { argb: '1E293B' } };
      cell.border = { bottom: { style: 'medium' } };
      cell.alignment = { horizontal: 'center' };
    });

    // 4. AGREGAR DATOS FILTRADOS
    filteredRecords.forEach(record => {
      const rowData = {};
      exportColumns.forEach(col => {
        rowData[col] = (['costo_t', 'costo_l', 'total', 'saldo_a_favor'].includes(col))
          ? toNumber(record[col])
          : record[col] || "-";
      });

      const row = worksheet.addRow(rowData);

      // Estilos por celda (Moneda y Status)
      exportColumns.forEach((col, index) => {
        const cell = row.getCell(index + 1);
        if (['costo_t', 'costo_l', 'total', 'saldo_a_favor'].includes(col)) {
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

    // 5. TOTALES AL FINAL (Lógica por pestaña)
    if (activeTab === "cliente") {
      worksheet.addRow([]);
      const totalRow = worksheet.addRow([]);
      totalRow.getCell(exportColumns.indexOf('servicio') + 1).value = "TOTAL PENDIENTE";
      totalRow.getCell(exportColumns.indexOf('costo_l') + 1).value = totals.total_costo_l_pendiente;
      totalRow.getCell(exportColumns.indexOf('costo_l') + 1).numFmt = '"$"#,##0.00';
      totalRow.getCell(exportColumns.indexOf('costo_l') + 1).font = { bold: true };
    } else if (activeTab === "principal") {
      worksheet.addRow([]);
      const totalRow = worksheet.addRow([]);
      totalRow.getCell(exportColumns.length - 1).value = "TOTAL PENDIENTE";
      totalRow.getCell(exportColumns.length).value = totals.total_pendiente;
      totalRow.getCell(exportColumns.length).numFmt = '"$"#,##0.00';
      totalRow.getCell(exportColumns.length).font = { bold: true };
    }

    // 6. DESCARGA
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `quimbar_${activeTab}_${todayISO()}.xlsx`);
    showNotice(`Excel de ${activeTab} exportado`, "Éxito");
  };

  const exportToPDF = () => {
    if (!isPremiumUnlocked) return showNotice("Exportar PDF es Premium", "Premium");

    const doc = new jsPDF();
    const exportColumns = currentColumns.filter((column) => column !== "acciones");
    const PRIMARY_COLOR = [51, 153, 170];

    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(14, 10, 182, 20, 'F');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(exportSettings.empresa, 20, 23);

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${exportSettings.direccion}  |  Tel: ${exportSettings.telefono}  |  ${exportSettings.correo}`, 14, 35);
    doc.text(exportSettings.ubicacion, 14, 39);

    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.text(exportSettings.tituloReporte, 14, 46);

    const header = exportColumns.map((column) => COLUMN_LABELS[column].toUpperCase());
    const body = filteredRecords.map((record) => (
      exportColumns.map((column) => {
        if (column === "fecha") return record.fecha;
        if (["costo_t", "costo_l", "total", "saldo_a_favor"].includes(column)) return formatCurrency(record[column]);
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

    if (activeTab === "cliente") {
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL PENDIENTE:", 120, finalY);
      doc.setTextColor(239, 68, 68);
      doc.text(formatCurrency(totals.total_costo_l_pendiente), 170, finalY);
    } else if (activeTab === "principal") {
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL PENDIENTE:", 120, finalY);
      doc.setTextColor(239, 68, 68);
      doc.text(formatCurrency(totals.total_pendiente), 170, finalY);
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount} - Generado el ${todayISO()}`, 14, doc.internal.pageSize.height - 10);
    }

    doc.save(`quimbar_reporte_${activeTab}_${todayISO()}.pdf`);
    showNotice("PDF exportado con diseño", "Éxito");
  };

  const handleMassStatusChange = async (status) => {
    if (!selectedIds.length) return;
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    const selected = records.filter((r) => selectedIds.includes(r.id));
    await Promise.all(selected.map((record) => apiRequest("put", `/records/${record.id}`, { data: { status } })));
    await reloadBackendData();
    showNotice(`Se actualizaron ${selectedIds.length} registros`, "Éxito");
  };

  const handleMassDelete = async () => {
    if (!selectedIds.length) return;
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    await Promise.all(selectedIds.map((id) => apiRequest("delete", `/records/${id}`)));
    await reloadBackendData();
    setSelectedIds([]);
    showNotice("Registros eliminados por lote", "Éxito");
  };

  const handleMassDuplicate = async () => {
    if (!selectedIds.length) return;
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    const selected = records.filter((r) => selectedIds.includes(r.id));
    await Promise.all(selected.map((record) => apiRequest("post", "/records", {
      data: {
        fecha: record.fecha,
        costo_t: record.costo_t,
        transportista: record.transportista,
        servicio: record.servicio,
        costo_l: record.costo_l,
        status: record.status,
        saldo_a_favor: record.saldo_a_favor
      }
    })));
    await reloadBackendData();
    showNotice(`${selected.length} registros duplicados`, "Éxito");
  };

  const handleLoadUploadedFile = async (uploadId) => {
    setLoadingUploadId(uploadId);
    if (!backendAvailable) {
      setLoadingUploadId(null);
      return showNotice("Servidor no disponible", "Error");
    }
    await apiRequest("post", `/uploads/${uploadId}/load`);
    await reloadBackendData();
    showNotice("Historial cargado", "Éxito");
    setLoadingUploadId(null);
  };

  const handleDeleteUploadedFile = async (uploadId) => {
    if (!backendAvailable) return showNotice("Servidor no disponible", "Error");
    await apiRequest("delete", `/uploads/${uploadId}`);
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
    await Promise.all([apiRequest("delete", "/records"), apiRequest("delete", "/uploads")]);
    await reloadBackendData();
    setFavoriteFilters([]);
    setSearchTerm("");
    setStatusFilter("Todos");
    setSelectedIds([]);
    setClearingAll(false);
    showNotice("Todos los datos fueron eliminados", "Éxito");
  };

  const handleSaveFavoriteFilter = () => {
    if (!isPremiumUnlocked) return showNotice("Guardar filtros favoritos es Premium", "Premium");
    setFavoriteFilterInput("");
    setShowFavoriteFilterModal(true);
  };

  const confirmSaveFavoriteFilter = () => {
    const name = favoriteFilterInput.trim();
    if (!name) return showNotice("Escribe un nombre para el filtro favorito.", "Falta información");
    setFavoriteFilters((prev) => [{ id: crypto.randomUUID(), name, filters: premiumFilters }, ...prev]);
    setShowFavoriteFilterModal(false);
    setFavoriteFilterInput("");
    showNotice("Filtro favorito guardado", "Éxito");
  };

  const handleExportBackup = () => {
    const payload = { version: 1, exported_at: new Date().toISOString(), records, uploads, favoriteFilters };
    saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `quimbar_backup_${todayISO()}.json`);
    showNotice("Backup exportado", "Éxito");
  };

  return (
    <div className={`app-container ${darkMode ? "dark-theme" : ""}`}>
      <header className="app-header">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sistema de Quimbar</h1>
            <p className="text-sm text-slate-500">
              {serverBooting
                ? "Iniciando servidor local en 127.0.0.1:8000..."
                : backendAvailable
                  ? "Conectado a quimbar-server.exe (127.0.0.1:8000)"
                  : "Error: quimbar-server.exe no disponible"} • Gestión de Registros
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-primary cursor-pointer">
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" disabled={uploading} />
              {uploading ? <SpinnerGap className="spinner" size={20} /> : <UploadSimple size={20} />}Subir Excel
            </label>
            <button onClick={() => setExportSettings(prev => ({ ...prev, showModal: true }))} className="btn-primary"><Download size={20} weight="bold" />Exportar Reporte</button>
            <button onClick={handleClearAllData} className="btn-danger" disabled={clearingAll}>{clearingAll ? <SpinnerGap className="spinner" size={20} /> : <Trash size={20} />}Borrar todo</button>
            <button onClick={() => setDarkMode((prev) => !prev)} className="btn-theme">{darkMode ? <Sun size={20} /> : <Moon size={20} />}{darkMode ? "Tema claro" : "Tema oscuro"}</button>
            <button onClick={() => (isPremiumUnlocked ? setIsPremiumUnlocked(false) : setShowPremiumModal(true))} className="btn-secondary">{isPremiumUnlocked ? <LockOpen size={20} /> : <Lock size={20} />}{isPremiumUnlocked ? "Premium activo" : "Activar Premium"}</button>
          </div>
        </div>
      </header>

      <main className="main-content max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="hidden md:flex border-b border-slate-300 mb-6">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? "text-[#002FA7] border-[#002FA7]" : "text-slate-500 border-transparent hover:text-slate-700"}`}>
              <tab.icon size={20} />
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === "principal" || activeTab === "cliente") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {activeTab === "principal" && (
              <>
                {/* Estas siempre visibles */}
                <MetricCard label="Total General" value={totals.total_general} variant="default" />
                <MetricCard label="Total Pendiente" value={totals.total_pendiente} variant="danger" />
                <MetricCard label="Total Pagado" value={totals.total_pagado} variant="success" />

                {/* Esta solo si es Premium */}
                {isPremiumUnlocked ? (
                  <MetricCard label="Total Saldo a Favor" value={totals.total_saldo_a_favor} variant="default" />
                ) : (
                  <div
                    className="metric-card flex flex-col items-center justify-center cursor-pointer border-dashed border-2 border-slate-300 opacity-60 hover:opacity-100 transition-opacity"
                    onClick={() => setShowPremiumModal(true)}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Saldo a Favor</p>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Lock size={18} />
                      <span className="text-sm font-semibold">Desbloquear</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {activeTab === "cliente" && <MetricCard label="Total Pendiente" value={totals.total_costo_l_pendiente} variant="danger" />}
          </div>
        )}

        {exportSettings.showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-[#002FA7]">
                  <Files size={28} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white">Configurar Exportación</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Personaliza los datos del reporte</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Selector de Formato con Validación Premium */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Selecciona Formato</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportSettings({ ...exportSettings, lastFormat: 'excel' })}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${exportSettings.lastFormat === 'excel' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700' : 'border-slate-100 dark:border-slate-700 text-slate-400'}`}
                    >
                      <FileXls size={20} /> Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPremiumUnlocked) {
                          showNotice("La exportación a PDF es una función exclusiva de la versión Premium.", "Opción solo disponible en Premium");
                        } else {
                          setExportSettings({ ...exportSettings, lastFormat: 'pdf' });
                        }
                      }}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${exportSettings.lastFormat === 'pdf' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700' : 'border-slate-100 dark:border-slate-700 text-slate-400'}`}
                    >
                      {!isPremiumUnlocked ? <Lock size={18} className="opacity-60" /> : <FilePdf size={20} />}
                      PDF
                    </button>
                  </div>
                </div>

                {/* Campos Editables */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Nombre de la Empresa</label>
                  <input
                    className="form-input w-full bg-slate-50 dark:bg-slate-900"
                    value={exportSettings.empresa}
                    onChange={(e) => setExportSettings({ ...exportSettings, empresa: e.target.value.toUpperCase() })}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Título/Descripción del Reporte</label>
                  <input
                    className="form-input w-full bg-slate-50 dark:bg-slate-900"
                    value={exportSettings.tituloReporte}
                    onChange={(e) => setExportSettings({ ...exportSettings, tituloReporte: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Teléfono</label>
                    <input
                      className="form-input w-full bg-slate-50 dark:bg-slate-900"
                      value={exportSettings.telefono}
                      onChange={(e) => setExportSettings({ ...exportSettings, telefono: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Dirección</label>
                    <input
                      className="form-input w-full bg-slate-50 dark:bg-slate-900"
                      value={exportSettings.direccion}
                      onChange={(e) => setExportSettings({ ...exportSettings, direccion: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  className={`flex-1 py-4 rounded-2xl font-bold text-white shadow-lg transition-transform active:scale-95 ${exportSettings.lastFormat === 'pdf' ? 'bg-red-500 shadow-red-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}
                  onClick={() => {
                    if (exportSettings.lastFormat === 'pdf') {
                      if (!isPremiumUnlocked) return showNotice("Opción solo disponible en Premium", "Premium");
                      exportToPDF();
                    } else {
                      handleExportExcel();
                    }
                    setExportSettings(prev => ({ ...prev, showModal: false }));
                  }}
                >
                  Generar y Descargar
                </button>
                <button
                  className="px-6 rounded-2xl font-bold text-slate-500 bg-slate-100 dark:bg-slate-700"
                  onClick={() => setExportSettings(prev => ({ ...prev, showModal: false }))}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        )}

        {isPremiumUnlocked && activeTab === "principal" && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowPremiumDashboard(true)}
              className="btn-primary flex items-center gap-2 bg-[#002FA7] hover:bg-blue-800"
            >
              <ChartLine size={20} weight="bold" />
              Ver Dashboard Avanzado
            </button>
          </div>
        )}

        {activeTab !== "gestion" && (
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:justify-between md:items-center">
            <p className="text-sm text-slate-500">{records.length} registros</p>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="search-input-wrapper"><MagnifyingGlass size={18} className="text-slate-400" /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar" className="search-input" /></div>
              <div className="filter-chip-group">
                {["Todos", "Pendiente", "Pagado"].map((f) => <button key={f} onClick={() => setStatusFilter(f)} className={`filter-chip ${statusFilter === f ? "active" : ""}`}>{f}</button>)}
              </div>
              {activeTab === "principal" && <button onClick={() => { setSelectedRecord(null); setShowForm(true); }} className="btn-primary"><Plus size={20} />Añadir Registro</button>}
            </div>
          </div>
        )}

        {exportSettings.showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileXls size={24} className="text-emerald-600" />
                Configurar Reporte Excel
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de la Empresa</label>
                  <input
                    className="form-input w-full"
                    value={exportSettings.empresa}
                    onChange={(e) => setExportSettings({ ...exportSettings, empresa: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Teléfono</label>
                    <input
                      className="form-input w-full"
                      value={exportSettings.telefono}
                      onChange={(e) => setExportSettings({ ...exportSettings, telefono: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo</label>
                    <input
                      className="form-input w-full"
                      value={exportSettings.correo}
                      onChange={(e) => setExportSettings({ ...exportSettings, correo: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  className="btn-primary flex-1"
                  onClick={() => {
                    if (exportSettings.lastFormat === 'pdf') {
                      exportToPDF();
                    } else {
                      handleExportExcel();
                    }
                    setExportSettings(prev => ({ ...prev, showModal: false }));
                  }}
                >
                  Generar {exportSettings.lastFormat === 'pdf' ? 'PDF' : 'Excel'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setExportSettings(prev => ({ ...prev, showModal: false }))}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {showPremiumDashboard && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800">

              {/* Cabecera del Modal */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                    <ChartLine size={36} weight="duotone" className="text-blue-600" />
                    Panel de Inteligencia Premium
                  </h2>
                  <p className="text-slate-500 font-medium">Análisis avanzado de operaciones</p>
                </div>
                <button onClick={() => setShowPremiumDashboard(false)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <X size={24} weight="bold" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna Izquierda: Gráfico y Nuevas Estadísticas */}
                <div className="lg:col-span-2 space-y-6">

                  {/* Gráfico de Flujo Mensual */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Flujo Mensual</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={premiumAnalytics.monthData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                          <YAxis hide />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="pagado" stackId="a" fill="#10B981" barSize={40} />
                          <Bar dataKey="pendiente" stackId="a" fill="#EF4444" radius={[10, 10, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* --- NUEVA SECCIÓN: GRID DE MÉTRICAS AVANZADAS --- */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Card: Margen de Utilidad (Utility Analysis) */}
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-3xl border border-slate-100 dark:border-slate-700">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Margen de Utilidad</p>
                          <p className="text-2xl font-bold text-emerald-500">{formatCurrency(premiumAnalytics.margenUtilidad)}</p>
                        </div>
                        <div className="bg-emerald-500/10 text-emerald-600 text-xs font-bold px-2 py-1 rounded-lg">
                          {premiumAnalytics.porcentajeMargen.toFixed(1)}%
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                          <span>COSTO OPERATIVO (T)</span>
                          <span>{formatCurrency(premiumAnalytics.totalCostoT)}</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-slate-400 h-full transition-all duration-700"
                            style={{ width: `${(premiumAnalytics.totalCostoT / premiumAnalytics.totalCostoL * 100) || 0}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 italic mt-2 text-center">
                          Utilidad basada en la diferencia de Costo L vs Costo T
                        </p>
                      </div>
                    </div>

                    {/* Card: Próximos Ingresos (Upcoming Cashflow) */}
                    <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-3xl border border-slate-100 dark:border-slate-700">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Ingresos Esperados (7D)</p>
                      <div className="space-y-3">
                        {premiumAnalytics.upcomingCashflow.length > 0 ? (
                          premiumAnalytics.upcomingCashflow.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 pb-2 last:border-0">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.servicio}</p>
                                <p className="text-[9px] text-slate-500 uppercase">{formatDate(item.fecha)}</p>
                              </div>
                              <p className="text-xs font-bold text-blue-500">{formatCurrency(item.total)}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400 italic py-4 text-center">No hay cobros proyectados esta semana.</p>
                        )}
                        <div className="pt-2 mt-2 flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Total Proyectado</span>
                          <span className="text-base font-black text-blue-600">{formatCurrency(premiumAnalytics.totalEsperado)}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Columna Derecha: Rankings */}
                <div className="space-y-6">
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800/50">
                    <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-500 uppercase tracking-widest mb-4">Top Transportistas</h3>
                    {premiumAnalytics.topTransportistas.map(([name, total]) => (
                      <button
                        key={name}
                        onClick={() => { setSearchTerm(name); setShowPremiumDashboard(false); }}
                        className="w-full flex justify-between items-center mb-3 hover:bg-emerald-100/50 dark:hover:bg-emerald-800/30 p-2 rounded-xl transition-all group"
                      >
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-emerald-700">{name}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(total)}</span>
                      </button>
                    ))}
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-3xl border border-blue-100 dark:border-blue-800/50">
                    <h3 className="text-xs font-bold text-blue-700 dark:text-blue-500 uppercase tracking-widest mb-4">Top Clientes (Logística)</h3>
                    {premiumAnalytics.topClientes.map(([name, total]) => (
                      <button
                        key={name}
                        onClick={() => { setSearchTerm(name); setShowPremiumDashboard(false); }}
                        className="w-full flex justify-between items-center mb-3 hover:bg-blue-100/50 dark:hover:bg-blue-800/30 p-2 rounded-xl transition-all group"
                      >
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-blue-700">{name}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(total)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isPremiumUnlocked && activeTab === "principal" && (
          <div className="premium-toolbar mb-4">
            <div className="premium-filters">
              <input type="date" className="form-input" value={premiumFilters.from} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, from: e.target.value }))} />
              <input type="date" className="form-input" value={premiumFilters.to} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, to: e.target.value }))} />
              <input type="text" className="form-input" placeholder="Transportista" value={premiumFilters.transportista} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, transportista: e.target.value }))} />
              <input type="text" className="form-input" placeholder="Cliente/Servicio" value={premiumFilters.servicio} onChange={(e) => setPremiumFilters((prev) => ({ ...prev, servicio: e.target.value }))} />
              <button className="btn-secondary" onClick={handleSaveFavoriteFilter}><FloppyDisk size={16} />Guardar filtro</button>
              <select className="form-input" onChange={(e) => { const f = favoriteFilters.find((x) => x.id === e.target.value); if (f) setPremiumFilters(f.filters); }} defaultValue="">
                <option value="">Filtros favoritos</option>
                {favoriteFilters.map((f) => <option value={f.id} key={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="premium-bulk">
              <button className="btn-secondary" onClick={() => handleMassStatusChange("Pagado")}><ArrowsClockwise size={16} />Marcar pagado</button>
              <button className="btn-secondary" onClick={() => handleMassStatusChange("Pendiente")}><ArrowsClockwise size={16} />Marcar pendiente</button>
              <button className="btn-secondary" onClick={handleMassDuplicate}><Copy size={16} />Duplicar</button>
              <button className="btn-danger" onClick={handleMassDelete}><Trash size={16} />Eliminar lote</button>
              <button className="btn-secondary" onClick={handleExportBackup}><Download size={16} />Backup</button>
            </div>
          </div>
        )}

        {activeTab !== "gestion" && (
          <div className="upload-history mb-6">
            <div className="upload-history-header"><h3><ClockCounterClockwise size={18} /> Historial de archivos</h3></div>
            {uploads.length === 0 ? <p className="upload-history-empty">Aún no has subido archivos.</p> : (
              <div className="upload-history-list">
                {uploads.map((upload) => (
                  <div className="upload-history-item" key={upload.id}>
                    <div>
                      <p className="upload-history-name">{upload.filename}</p>
                      <p className="upload-history-meta">{upload.records_count} registros • {formatDate(upload.uploaded_at)}</p>
                    </div>
                    <div className="upload-history-actions">
                      <button className="btn-secondary" onClick={() => handleLoadUploadedFile(upload.id)} disabled={loadingUploadId === upload.id}>{loadingUploadId === upload.id ? <SpinnerGap className="spinner" size={16} /> : <FolderOpen size={16} />}Cargar</button>
                      <button className="btn-danger" onClick={() => handleDeleteUploadedFile(upload.id)}><TrashSimple size={16} />Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "gestion" ? (
          <div className="table-container p-6"><h2 className="text-xl font-bold text-slate-900 mb-6">{selectedRecord ? "Editar Registro" : "Nuevo Registro"}</h2><RecordForm record={selectedRecord} onSave={handleSaveRecord} onCancel={() => { setShowForm(false); setSelectedRecord(null); setActiveTab("principal"); }} loading={saving} /></div>
        ) : (
          <div className="table-container">
            {loading ? (
              <div className="empty-state"><SpinnerGap className="spinner inline-block" size={32} /><p className="mt-2">Cargando...</p></div>
            ) : filteredRecords.length === 0 ? (
              <div className="empty-state"><Warning size={48} className="mx-auto mb-4 text-slate-400" /><p className="text-lg font-medium">No hay registros</p></div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {isPremiumUnlocked && activeTab === "principal" && <th></th>}
                      {currentColumns.map((column) => {
                        const numericCol = ["costo_t", "costo_l", "total", "saldo_a_favor"].includes(column);
                        const centerCol = column === "acciones";
                        return (
                          <th key={column} className={numericCol ? "text-right" : centerCol ? "text-center" : ""}>
                            {COLUMN_LABELS[column]}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((record) => (
                      <tr key={record.id} className={selectedIds.includes(record.id) ? "row-selected" : ""}>
                        {isPremiumUnlocked && activeTab === "principal" && <td><input type="checkbox" checked={selectedIds.includes(record.id)} onChange={() => setSelectedIds((prev) => (prev.includes(record.id) ? prev.filter((id) => id !== record.id) : [...prev, record.id]))} /></td>}
                        {currentColumns.includes("fecha") && <td>{formatDate(record.fecha)}</td>}
                        {currentColumns.includes("costo_t") && <td className="text-right tabular-nums">{formatCurrency(record.costo_t)}</td>}
                        {currentColumns.includes("transportista") && <td>{record.transportista || "-"}</td>}
                        {currentColumns.includes("servicio") && <td>{record.servicio || "-"}</td>}
                        {currentColumns.includes("costo_l") && <td className="text-right tabular-nums">{formatCurrency(record.costo_l)}</td>}
                        {currentColumns.includes("status") && <td><StatusBadge status={record.status} /></td>}
                        {currentColumns.includes("total") && <td className="text-right tabular-nums">{formatCurrency(record.total)}</td>}
                        {currentColumns.includes("saldo_a_favor") && <td className="text-right tabular-nums">{formatCurrency(record.saldo_a_favor)}</td>}
                        {currentColumns.includes("acciones") && (
                          <td className="text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => { if (!isPremiumUnlocked) return; setSelectedRecord(record); setShowForm(true); }}
                                className="p-1 hover:bg-slate-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                disabled={!isPremiumUnlocked}
                                title={isPremiumUnlocked ? "Editar registro" : "Disponible solo en Premium"}
                              >
                                <PencilSimple size={18} />
                              </button>
                              <button
                                onClick={() => { if (!isPremiumUnlocked) return; setShowDeleteConfirm(record.id); }}
                                className="p-1 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                disabled={!isPremiumUnlocked}
                                title={isPremiumUnlocked ? "Eliminar registro" : "Disponible solo en Premium"}
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
        )}
      </main>

      {showForm && activeTab !== "gestion" && (
        <>
          <div className="dialog-overlay" onClick={() => { setShowForm(false); setSelectedRecord(null); }} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-6">{selectedRecord ? "Editar Registro" : "Nuevo Registro"}</h2>
            <RecordForm record={selectedRecord} onSave={handleSaveRecord} onCancel={() => { setShowForm(false); setSelectedRecord(null); }} loading={saving} />
          </div>
        </>
      )}

      {showPremiumModal && (
        <>
          <div className="dialog-overlay" onClick={() => setShowPremiumModal(false)} />
          <div className="dialog-content">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Activar Premium</h2>
            <p className="text-sm text-slate-500 mb-4">Incluye filtros pro, dashboard, alertas, edición masiva y backup avanzado.</p>
            <input type="password" value={premiumKeyInput} onChange={(e) => setPremiumKeyInput(e.target.value)} className="form-input w-full" placeholder="Clave Premium" />
            <div className="flex gap-3 mt-4">
              <button className="btn-primary flex-1" onClick={() => {
                if (premiumKeyInput.trim() !== PREMIUM_ACCESS_KEY) return showNotice("Clave incorrecta", "Error");
                setIsPremiumUnlocked(true);
                setShowPremiumModal(false);
                setPremiumKeyInput("");
                showNotice("Premium activado", "Éxito");
              }}>Activar</button>
              <button className="btn-secondary" onClick={() => setShowPremiumModal(false)}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <>
          <div className="dialog-overlay" onClick={() => setShowDeleteConfirm(null)} />
          <div className="dialog-content text-center">
            <Warning size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar registro?</h3>
            <p className="text-slate-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => handleDeleteRecord(showDeleteConfirm)} className="btn-danger"><Trash size={20} />Eliminar</button>
              <button onClick={() => setShowDeleteConfirm(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </>
      )}

      {showClearAllConfirm && (
        <>
          <div className="dialog-overlay" onClick={() => setShowClearAllConfirm(false)} />
          <div className="dialog-content text-center">
            <Warning size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">¿Borrar todos los datos?</h3>
            <p className="text-slate-500 mb-6">Se eliminarán todos los registros e historial de archivos.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={confirmClearAllData} className="btn-danger"><Trash size={20} />Sí, borrar todo</button>
              <button onClick={() => setShowClearAllConfirm(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </>
      )}

      {showFavoriteFilterModal && (
        <>
          <div className="dialog-overlay" onClick={() => setShowFavoriteFilterModal(false)} />
          <div className="dialog-content">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Guardar filtro favorito</h3>
            <p className="text-slate-500 mb-4">Escribe un nombre para identificar este filtro.</p>
            <input
              className="form-input w-full"
              value={favoriteFilterInput}
              onChange={(e) => setFavoriteFilterInput(e.target.value)}
              placeholder="Ej. Pendientes de abril"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowFavoriteFilterModal(false)} className="btn-secondary">Cancelar</button>
              <button onClick={confirmSaveFavoriteFilter} className="btn-primary">Guardar</button>
            </div>
          </div>
        </>
      )}

      {noticeModal.open && (
        <>
          {/* Agregamos z-[200] para que tape el modal de exportación */}
          <div
            className="dialog-overlay !z-[200]"
            onClick={() => setNoticeModal({ open: false, title: "", message: "" })}
          />

          {/* Agregamos z-[201] para que el contenido esté por encima del overlay */}
          <div className="dialog-content text-center !z-[201]">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{noticeModal.title}</h3>
            <p className="text-slate-600 mb-6">{noticeModal.message}</p>
            <button
              className="btn-primary w-full justify-center"
              onClick={() => setNoticeModal({ open: false, title: "", message: "" })}
            >
              Aceptar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
