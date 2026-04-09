import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY_ENABLED = 'gestion-logistica-autosave-enabled';
const STORAGE_KEY_INTERVAL = 'gestion-logistica-autosave-interval';
const STORAGE_KEY_LAST_SAVE = 'gestion-logistica-autosave-last-save';

export const useAutoSave = (saveFunction) => {
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

  const updateEnabled = useCallback((newEnabled) => {
    setEnabled(newEnabled);
    localStorage.setItem(STORAGE_KEY_ENABLED, newEnabled);
  }, []);

  const updateInterval = useCallback((newInterval) => {
    setAutoSaveInterval(newInterval);
    localStorage.setItem(STORAGE_KEY_INTERVAL, newInterval);
  }, []);

  useEffect(() => {
    if (!enabled || !saveFunction) return;

    const performSave = async () => {
      try {
        await saveFunction();
        const now = new Date();
        setLastSave(now);
        localStorage.setItem(STORAGE_KEY_LAST_SAVE, now.toISOString());
      } catch (error) {
        console.error('Error en auto-guardado:', error);
      }
    };

    const intervalId = window.setInterval(performSave, parseInt(interval, 10));

    return () => window.clearInterval(intervalId);
  }, [enabled, interval, saveFunction]);

  return {
    enabled,
    interval,
    lastSave,
    updateEnabled,
    updateInterval
  };
};
