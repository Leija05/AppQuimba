import React from 'react';
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

const AutoSaveConfig = ({ autoSave }) => {
  const {
    enabled = true,
    interval = '300000',
    lastSave = null,
    isSaving = false,
    updateEnabled,
    updateInterval,
    performSave,
  } = autoSave || {};

  const formatLastSave = () => {
    if (!lastSave) return 'Nunca';
    return new Date(lastSave).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
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
            onCheckedChange={updateEnabled}
          />
        </div>

        {enabled && (
          <>
            <div className="space-y-2">
              <Label htmlFor="autosave-interval" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Frecuencia de guardado
              </Label>
              <Select value={interval} onValueChange={updateInterval}>
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
                {isSaving ? ' · Guardando...' : ''}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary w-full sm:w-auto"
              onClick={() => performSave?.('manual')}
              disabled={isSaving}
            >
              {isSaving ? 'Guardando...' : 'Guardar ahora'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AutoSaveConfig;
