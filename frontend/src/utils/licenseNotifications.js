const LICENSE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const DAYS_BEFORE_WARNING = 7;

export const checkLicenseExpiration = async (token, machineId, clientName) => {
  if (!token) return null;

  try {
    const parts = token.split('.');
    const version = parts[0];

    let expiryDateStr = '';

    if (version === 'QBP2' || version === 'QBM2') {
      if (parts.length >= 2) {
        expiryDateStr = parts[1];
      }
    } else if (version === 'QBP' || version === 'QBM') {
      if (parts.length >= 2) {
        expiryDateStr = parts[1];
      }
    }

    if (!expiryDateStr || expiryDateStr.length !== 8) {
      return null;
    }

    const year = parseInt(expiryDateStr.substring(0, 4));
    const month = parseInt(expiryDateStr.substring(4, 6)) - 1;
    const day = parseInt(expiryDateStr.substring(6, 8));

    const expiryDate = new Date(year, month, day, 23, 59, 59);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    const status = {
      expiryDate: expiryDate.toISOString(),
      daysUntilExpiry,
      isExpired: daysUntilExpiry < 0,
      isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= DAYS_BEFORE_WARNING,
      machineId,
      clientName
    };

    if (status.isExpired || status.isExpiringSoon) {
      return status;
    }

    return null;
  } catch (error) {
    console.error('Error checking license expiration:', error);
    return null;
  }
};

export const sendExpirationNotification = async (status) => {
  if (!status) return;

  const message = status.isExpired
    ? `Computadora con id ${status.machineId} con nombre de dueño ${status.clientName} ha caducado. Fecha de expiración: ${new Date(status.expiryDate).toLocaleDateString('es-MX')}. Atento a renovación.`
    : `Computadora con id ${status.machineId} con nombre de dueño ${status.clientName} está a punto de caducar en ${status.daysUntilExpiry} días. Fecha de expiración: ${new Date(status.expiryDate).toLocaleDateString('es-MX')}. Atento a renovación.`;

  console.log('Notificación de licencia:', message);

  const notificationData = {
    machineId: status.machineId,
    clientName: status.clientName,
    expiryDate: status.expiryDate,
    daysUntilExpiry: status.daysUntilExpiry,
    isExpired: status.isExpired,
    message
  };

  const lastNotification = localStorage.getItem('last-license-notification');
  const lastNotificationDate = lastNotification ? new Date(lastNotification) : null;
  const now = new Date();

  if (!lastNotificationDate || (now - lastNotificationDate) > LICENSE_CHECK_INTERVAL) {
    try {
      console.log('Enviando notificación:', notificationData);
      localStorage.setItem('last-license-notification', now.toISOString());

      return notificationData;
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  return null;
};

export const startLicenseMonitoring = (token, machineId, clientName, onNotification) => {
  const checkAndNotify = async () => {
    const status = await checkLicenseExpiration(token, machineId, clientName);
    if (status) {
      const notification = await sendExpirationNotification(status);
      if (notification && onNotification) {
        onNotification(notification);
      }
    }
  };

  checkAndNotify();

  const intervalId = setInterval(checkAndNotify, LICENSE_CHECK_INTERVAL);

  return () => clearInterval(intervalId);
};
