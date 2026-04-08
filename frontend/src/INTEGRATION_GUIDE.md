# Guía de Integración - Gestión Logística y de Transportes

## Cambios Implementados

### 1. Componentes Nuevos Creados

- **DeveloperSignature.jsx**: Marca personal con animación de escritura
- **AutoSaveConfig.jsx**: Configuración de guardado automático
- **LicensePurchasePrompt.jsx**: Prompt de compra de licencia
- **PremiumDashboardLogistica.jsx**: Dashboard premium para logística
- **PremiumDashboardTransportista.jsx**: Dashboard premium para transportista
- **useAutoSave.js**: Hook personalizado para auto-guardado
- **licenseNotifications.js**: Sistema de notificaciones de licencia

### 2. Actualizaciones de Nombre de Aplicación

Se actualizó en:
- `manifest.json`
- `index.html`
- `package.json`

Nuevo nombre: **Gestión Logística y de Transportes**
Nueva descripción: **Solución profesional para control logístico**

### 3. Integración en App.js

#### Importaciones necesarias (agregar al inicio del archivo):

```javascript
import DeveloperSignature from '@/components/DeveloperSignature';
import AutoSaveConfig from '@/components/AutoSaveConfig';
import LicensePurchasePrompt from '@/components/LicensePurchasePrompt';
import PremiumDashboardLogistica from '@/components/PremiumDashboardLogistica';
import PremiumDashboardTransportista from '@/components/PremiumDashboardTransportista';
import { useAutoSave } from '@/hooks/useAutoSave';
import { startLicenseMonitoring } from '@/utils/licenseNotifications';
```

#### Actualizar constantes:

```javascript
const STORAGE_KEYS = {
  premium: "gestion-logistica-premium-unlocked",
  premiumToken: "gestion-logistica-premium-token",
  theme: "gestion-logistica-theme",
  favoriteFilters: "gestion-logistica-favorite-filters",
  logo: "gestion-logistica-company-logo",
  companyName: "gestion-logistica-company-name"
};
```

#### Agregar en el componente App (después de otros estados):

```javascript
// Estado para notificaciones de licencia
const [licenseNotification, setLicenseNotification] = useState(null);

// Hook de auto-guardado
const autoSave = useAutoSave(reloadBackendData);

// Monitoreo de licencia
useEffect(() => {
  if (isPremiumUnlocked && premiumToken) {
    const cleanup = startLicenseMonitoring(
      premiumToken,
      'machine-id-placeholder', // Usar ID real de máquina
      companyName || 'Cliente',
      (notification) => {
        setLicenseNotification(notification);
        showNotice(notification.message, 'Licencia');
      }
    );
    return cleanup;
  }
}, [isPremiumUnlocked, premiumToken]);
```

#### Actualizar la función handleClearAllData (modo no premium):

```javascript
const handleClearAllData = async () => {
  // Verificar si es premium
  if (!isPremiumUnlocked) {
    showNotice("El borrado masivo requiere Premium. Solo puedes borrar registros individuales.", "Premium");
    return;
  }

  // Código existente...
};
```

#### Modificar filtros para modo no premium:

Reemplazar la lógica de filtros con:

```javascript
const [filterStatus, setFilterStatus] = useState("all");

const filteredRecords = useMemo(() => {
  const records = isLogistica ? logisticaRecords : transportistaRecords;

  // Aplicar filtro de status
  let filtered = records;
  if (filterStatus === "pendiente") {
    filtered = records.filter(r => r.status === "Pendiente");
  } else if (filterStatus === "pagado") {
    filtered = records.filter(r => r.status === "Pagado");
  }

  // Búsqueda (solo premium)
  if (isPremiumUnlocked && searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(r => {
      return Object.values(r).some(val =>
        String(val).toLowerCase().includes(term)
      );
    });
  }

  return filtered;
}, [isLogistica, logisticaRecords, transportistaRecords, filterStatus, searchTerm, isPremiumUnlocked]);
```

#### Agregar controles de filtros mejorados:

```javascript
{/* Filtros mejorados para modo básico y premium */}
<div className="flex items-center gap-3 flex-wrap">
  <div className="filter-chip-group">
    <button
      className={`filter-chip ${filterStatus === 'all' ? 'active' : ''}`}
      onClick={() => setFilterStatus('all')}
    >
      Todos
    </button>
    <button
      className={`filter-chip ${filterStatus === 'pendiente' ? 'active' : ''}`}
      onClick={() => setFilterStatus('pendiente')}
    >
      Pendientes
    </button>
    <button
      className={`filter-chip ${filterStatus === 'pagado' ? 'active' : ''}`}
      onClick={() => setFilterStatus('pagado')}
    >
      Pagados
    </button>
  </div>
</div>
```

#### Integrar Dashboards Premium:

En la sección del dashboard premium, reemplazar con:

```javascript
{isPremiumUnlocked && showDashboard && (
  <div className="mt-6">
    {activeTab === "logistica" ? (
      <PremiumDashboardLogistica records={logisticaRecords} />
    ) : (
      <PremiumDashboardTransportista records={transportistaRecords} />
    )}
  </div>
)}
```

#### Modificar el modal de premium para incluir enlace de compra:

```javascript
{showPremiumModal && !isPremiumUnlocked && (
  <>
    <div className="dialog-overlay" onClick={() => setShowPremiumModal(false)} />
    <div className="dialog-content max-w-lg">
      <LicensePurchasePrompt
        title="Activa Premium"
        message="Para activar funciones premium, necesitas una licencia válida."
        variant="inline"
      />

      {/* Formulario de activación existente */}
      <div className="mt-6">
        <h3 className="text-lg font-bold mb-3">O ingresa tu token premium:</h3>
        {/* Resto del formulario... */}
      </div>
    </div>
  </>
)}
```

#### Agregar configuración de Auto Guardado en Opciones:

```javascript
{showOptionsModal && (
  <>
    <div className="dialog-overlay" onClick={() => setShowOptionsModal(false)} />
    <div className="dialog-content max-w-2xl max-h-[80vh] overflow-y-auto">
      <h2 className="text-xl font-bold text-slate-900 mb-4">Opciones</h2>

      {/* Sección de Auto Guardado */}
      <section className="mb-5">
        <AutoSaveConfig onSave={reloadBackendData} />
      </section>

      {/* Resto de las opciones... */}
    </div>
  </>
)}
```

#### Agregar firma del desarrollador al final del componente (antes del cierre del div principal):

```javascript
{/* Firma del desarrollador */}
<DeveloperSignature
  developerName="Desarrollado por Leija05"
  position="bottom-right"
/>
```

### 4. Actualizar backend/server.py

Actualizar el mensaje del servidor:

```python
@api_router.get("/")
async def root():
    return {"message": "Gestión Logística y de Transportes API"}
```

### 5. Funciones de Borrado con Restricción

Actualizar todas las funciones de borrado para verificar premium:

```javascript
const handleDeleteRecord = async (id) => {
  // Permitir borrado individual siempre
  if (!backendAvailable) return showNotice("Servidor no disponible", "Error");

  const basePath = activeApiBasePath;
  await apiRequest("delete", `${basePath}/records/${id}`);
  await reloadBackendData();
  setShowDeleteConfirm(null);
  showNotice("Registro eliminado", "Éxito");
};

const handleClearAllData = async () => {
  // Solo premium puede borrar todo
  if (!isPremiumUnlocked) {
    showNotice("El borrado masivo es una función Premium.", "Premium");
    return;
  }

  // Código existente...
};
```

### 6. Estilos CSS Adicionales

Ya están incluidos en `App.css` con las clases:
- `.notice-overlay` y `.notice-content` para el z-index correcto
- `.filter-chip-group` y `.filter-chip` para filtros mejorados
- Estilos de animación para la firma

### 7. Testing

1. Verificar que el nombre aparece correctamente en toda la aplicación
2. Probar el auto-guardado con diferentes intervalos
3. Verificar que los filtros funcionan en modo básico
4. Confirmar que el borrado individual funciona sin premium
5. Verificar que el borrado masivo requiere premium
6. Probar los dashboards premium con datos reales
7. Verificar que la firma del desarrollador se muestre y anime correctamente
8. Comprobar el sistema de notificaciones de licencia

## Notas Importantes

1. **Auto-guardado**: Guardará automáticamente cada vez que se cumpla el intervalo configurado
2. **Filtros**: Funcionan tanto en modo básico como premium
3. **Borrado**: Individual permitido siempre, masivo solo con premium
4. **Dashboards**: Solo visibles con premium activo
5. **Firma**: Siempre visible, no se puede eliminar fácilmente
6. **Notificaciones**: Se envían automáticamente cuando la licencia está próxima a vencer

## Siguiente Paso

Ejecutar `npm run build` para compilar la aplicación con todos los cambios.
