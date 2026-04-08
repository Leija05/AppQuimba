import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { FloppyDisk, Clock } from '@phosphor-icons/react';

const AUTO_SAVE_INTERVALS = [
  { value: '60000', label: 'Cada 1 minuto' },
  { value: '300000', label: 'Cada 5 minutos' },
  { value: '600000', label: 'Cada 10 minutos' },
  { value: '1800000', label: 'Cada 30 minutos' },
  { value: '3600000', label: 'Cada 1 hora' },
];

const STORAGE_KEY_ENABLED = 'gestion-logistica-autosave-enabled';
const STORAGE_KEY_INTERVAL = 'gestion-logistica-autosave-interval';

const AutoSaveConfig = ({ onSave }) => {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ENABLED);
    return saved === null ? true : saved === 'true';
  });

  const [interval, setInterval] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_INTERVAL) || '300000';
  });

  const [lastSave, setLastSave] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ENABLED, enabled);
  }, [enabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INTERVAL, interval);
  }, [interval]);

  useEffect(() => {
    if (!enabled || !onSave) return;

    const intervalId = setInterval(() => {
      onSave();
      setLastSave(new Date());
    }, parseInt(interval));

    return () => clearInterval(intervalId);
  }, [enabled, interval, onSave]);

  const formatLastSave = () => {
    if (!lastSave) return 'Nunca';
    return lastSave.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-4 p-4 border border-slate-300 rounded-sm bg-white">
      <div className="flex items-center gap-3">
        <FloppyDisk size={24} weight="duotone" className="text-[#002FA7]" />
        <h3 className="text-lg font-semibold text-slate-900">Auto Guardado</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="autosave-enabled" className="text-sm font-medium text-slate-700">
              Activar Auto Guardado
            </Label>
            <p className="text-xs text-slate-500">
              Guarda automáticamente todos los cambios
            </p>
          </div>
          <Switch
            id="autosave-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="autosave-interval" className="text-sm font-medium text-slate-700">
                Frecuencia de guardado
              </Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger id="autosave-interval" className="w-full">
                  <SelectValue placeholder="Selecciona un intervalo" />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_SAVE_INTERVALS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 p-2 bg-slate-50 rounded-sm">
              <Clock size={16} />
              <span>Último guardado: {formatLastSave()}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AutoSaveConfig;
