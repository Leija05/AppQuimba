import React, { useState, useEffect, useCallback } from 'react';
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
const STORAGE_KEY_LAST_SAVE = 'gestion-logistica-autosave-last-save';

const AutoSaveConfig = ({ onSave }) => {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ENABLED);
    return saved === null ? true : saved === 'true';
  });

  const [interval, setAutoSaveInterval] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_INTERVAL) || '300000';
  });

  const [lastSave, setLastSave] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LAST_SAVE);
    if (!saved) return null;
    const parsed = new Date(saved);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
  const [isSavingNow, setIsSavingNow] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ENABLED, enabled);
  }, [enabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INTERVAL, interval);
  }, [interval]);

  const performSave = useCallback(async () => {
    if (!onSave) return;
    setIsSavingNow(true);
    try {
      await onSave();
      const now = new Date();
      setLastSave(now);
      localStorage.setItem(STORAGE_KEY_LAST_SAVE, now.toISOString());
    } finally {
      setIsSavingNow(false);
    }
  }, [onSave]);

  useEffect(() => {
    if (!enabled || !onSave) return;

    const intervalId = setInterval(() => {
      performSave();
    }, parseInt(interval));

    return () => clearInterval(intervalId);
  }, [enabled, interval, performSave]);

  const formatLastSave = () => {
    if (!lastSave) return 'Nunca';
    return lastSave.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4 p-4 border border-slate-300 dark:border-slate-700 rounded-sm bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <FloppyDisk size={24} weight="duotone" className="text-[#002FA7]" />
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Auto Guardado</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="autosave-enabled" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Activar Auto Guardado
            </Label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
              <Label htmlFor="autosave-interval" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Frecuencia de guardado
              </Label>
              <Select value={interval} onValueChange={setAutoSaveInterval}>
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

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300 p-2 bg-slate-50 dark:bg-slate-800 rounded-sm">
              <Clock size={16} />
              <span>
                Último guardado: {formatLastSave()}
                {isSavingNow ? " · Guardando..." : ""}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary w-full sm:w-auto"
              onClick={performSave}
              disabled={isSavingNow}
            >
              {isSavingNow ? "Guardando..." : "Guardar ahora"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AutoSaveConfig;
