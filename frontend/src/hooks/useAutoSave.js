import { useEffect, useState, useCallback, useRef } from 'react';

const STORAGE_KEY_ENABLED = 'gestion-logistica-autosave-enabled';
const STORAGE_KEY_INTERVAL = 'gestion-logistica-autosave-interval';
const STORAGE_KEY_LAST_SAVE = 'gestion-logistica-autosave-last-save';

export const useAutoSave = (saveFunction, options = {}) => {
  const { onAutoSaveSuccess } = options;
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
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const updateEnabled = useCallback((newEnabled) => {
    setEnabled(newEnabled);
    localStorage.setItem(STORAGE_KEY_ENABLED, String(newEnabled));
  }, []);

  const updateInterval = useCallback((newInterval) => {
    setAutoSaveInterval(newInterval);
    localStorage.setItem(STORAGE_KEY_INTERVAL, newInterval);
  }, []);

  const performSave = useCallback(async (source = 'manual') => {
    if (!saveFunction || savingRef.current) return false;

    savingRef.current = true;
    setIsSaving(true);
    try {
      await saveFunction();
      const now = new Date();
      setLastSave(now);
      localStorage.setItem(STORAGE_KEY_LAST_SAVE, now.toISOString());
      if (onAutoSaveSuccess) {
        onAutoSaveSuccess({ source, savedAt: now });
      }
      return true;
    } catch (error) {
      console.error('Error en auto-guardado:', error);
      return false;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [saveFunction, onAutoSaveSuccess]);

  useEffect(() => {
    if (!enabled || !saveFunction) return;

    const intervalMs = Number.parseInt(interval, 10);
    if (Number.isNaN(intervalMs) || intervalMs <= 0) return;

    const intervalId = window.setInterval(() => {
      performSave('auto');
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, interval, saveFunction, performSave]);

  return {
    enabled,
    interval,
    lastSave,
    isSaving,
    updateEnabled,
    updateInterval,
    performSave
  };
};
