import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Users, TrendUp, CurrencyDollar, Package, Award } from '@phosphor-icons/react';

const COLORS = ['#002FA7', '#0052CC', '#2684FF', '#4C9AFF', '#B3D4FF'];

const PremiumDashboardLogistica = ({ records = [] }) => {
  const [selectedClient, setSelectedClient] = useState(null);

  const clientsData = useMemo(() => {
    const clientMap = new Map();

    records.forEach(record => {
      const cliente = record.cliente || 'Sin Cliente';
      if (!clientMap.has(cliente)) {
        clientMap.set(cliente, {
          nombre: cliente,
          totalRegistros: 0,
          totalPendiente: 0,
          totalPagado: 0,
          registrosPorMes: {},
          servicios: {}
        });
      }

      const data = clientMap.get(cliente);
      data.totalRegistros++;

      const total = parseFloat(record.total || record.costo || 0);
      if (record.status === 'Pendiente') {
        data.totalPendiente += total;
      } else if (record.status === 'Pagado') {
        data.totalPagado += total;
      }

      const fecha = new Date(record.fecha || Date.now());
      const mesKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!data.registrosPorMes[mesKey]) {
        data.registrosPorMes[mesKey] = { mes: mesKey, pendiente: 0, pagado: 0 };
      }
      if (record.status === 'Pendiente') {
        data.registrosPorMes[mesKey].pendiente += total;
      } else if (record.status === 'Pagado') {
        data.registrosPorMes[mesKey].pagado += total;
      }

      const servicio = record.servicio || 'Sin Servicio';
      data.servicios[servicio] = (data.servicios[servicio] || 0) + total;
    });

    return Array.from(clientMap.values()).map(client => ({
      ...client,
      total: client.totalPendiente + client.totalPagado,
      registrosPorMes: Object.values(client.registrosPorMes).sort((a, b) => a.mes.localeCompare(b.mes))
    }));
  }, [records]);

  const globalChartData = useMemo(() => {
    return clientsData.map(client => ({
      nombre: client.nombre.length > 15 ? client.nombre.substring(0, 15) + '...' : client.nombre,
      total: client.total,
      fullName: client.nombre
    })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [clientsData]);

  const selectedClientData = useMemo(() => {
    if (!selectedClient) return null;
    return clientsData.find(c => c.nombre === selectedClient);
  }, [selectedClient, clientsData]);

  const topServicios = useMemo(() => {
    if (!selectedClientData) return [];
    return Object.entries(selectedClientData.servicios)
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);
  }, [selectedClientData]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0
    }).format(value);
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-300 rounded-sm shadow-lg">
          <p className="font-semibold text-slate-900">{payload[0].payload.fullName || payload[0].name}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-300 rounded-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users size={28} weight="duotone" className="text-[#002FA7]" />
          <h2 className="text-2xl font-bold text-slate-900">Clientes Registrados</h2>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={globalChartData} onClick={(data) => {
            if (data && data.activePayload) {
              setSelectedClient(data.activePayload[0].payload.fullName);
            }
          }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="nombre" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
            <YAxis tickFormatter={(value) => formatCurrency(value)} style={{ fontSize: '12px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="total" fill="#002FA7" radius={[4, 4, 0, 0]} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>

        <p className="text-xs text-slate-500 text-center mt-4">
          Haz clic en una barra para ver detalles del cliente
        </p>
      </div>

      {selectedClientData && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-[#002FA7] to-[#0052CC] text-white p-6 rounded-sm">
            <h3 className="text-2xl font-bold mb-2">{selectedClientData.nombre}</h3>
            <p className="text-sm opacity-90">Análisis detallado del cliente</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-300 rounded-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total Facturado</span>
                <CurrencyDollar size={20} weight="duotone" className="text-green-600" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(selectedClientData.total)}</p>
            </div>

            <div className="bg-white border border-slate-300 rounded-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total Pendiente</span>
                <TrendUp size={20} weight="duotone" className="text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(selectedClientData.totalPendiente)}</p>
            </div>

            <div className="bg-white border border-slate-300 rounded-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Total Pagado</span>
                <Award size={20} weight="duotone" className="text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(selectedClientData.totalPagado)}</p>
            </div>

            <div className="bg-white border border-slate-300 rounded-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Registros</span>
                <Package size={20} weight="duotone" className="text-[#002FA7]" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{selectedClientData.totalRegistros}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-300 rounded-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Flujo Mensual de Dinero</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={selectedClientData.registrosPorMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="mes" style={{ fontSize: '12px' }} />
                <YAxis tickFormatter={(value) => formatCurrency(value)} style={{ fontSize: '12px' }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="pendiente" stroke="#EF4444" strokeWidth={2} name="Pendiente" />
                <Line type="monotone" dataKey="pagado" stroke="#10B981" strokeWidth={2} name="Pagado" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-slate-300 rounded-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Top Servicios</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={topServicios}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ nombre, percent }) => `${nombre}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="valor"
                  >
                    {topServicios.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2">
                {topServicios.map((servicio, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-sm font-medium text-slate-700">{servicio.nombre}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(servicio.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PremiumDashboardLogistica;
