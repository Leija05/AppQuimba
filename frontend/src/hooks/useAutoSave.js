import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY_ENABLED = 'gestion-logistica-autosave-enabled';
const STORAGE_KEY_INTERVAL = 'gestion-logistica-autosave-interval';

export const useAutoSave = (saveFunction) => {
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_ENABLED);
    return saved === null ? true : saved === 'true';
  });

  const [interval, setInterval] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_INTERVAL) || '300000';
  });

  const [lastSave, setLastSave] = useState(null);

  const updateEnabled = useCallback((newEnabled) => {
    setEnabled(newEnabled);
    localStorage.setItem(STORAGE_KEY_ENABLED, newEnabled);
  }, []);

  const updateInterval = useCallback((newInterval) => {
    setInterval(newInterval);
    localStorage.setItem(STORAGE_KEY_INTERVAL, newInterval);
  }, []);

  useEffect(() => {
    if (!enabled || !saveFunction) return;

    const performSave = async () => {
      try {
        await saveFunction();
        setLastSave(new Date());
      } catch (error) {
        console.error('Error en auto-guardado:', error);
      }
    };

    const intervalId = setInterval(performSave, parseInt(interval));

    return () => clearInterval(intervalId);
  }, [enabled, interval, saveFunction]);

  return {
    enabled,
    interval,
    lastSave,
    updateEnabled,
    updateInterval
  };
};
