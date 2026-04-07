# Quimbar - Notas rápidas

## Generar un token válido de licencia

1. Define el mismo secreto para **Electron** y **Backend**:
   ```bash
   export QUIMBAR_LICENSE_SECRET="QuimbarToken2026"
   ```
2. Obtén el **Hardware ID** de la computadora destino (la app lo muestra en el modal de licencia).
3. Genera token con vencimiento a 2 meses:
   ```bash
   python tools/generate_token.py --months 2 --machine-id "HARDWARE_ID_AQUI"
   ```
   O con fecha exacta:
   ```bash
   python tools/generate_token.py --date 2026-08-31 --machine-id "HARDWARE_ID_AQUI"
   ```
4. Copia el valor mostrado en `Token: QBM2.YYYYMMDD.HW_HASH.FIRMA`.

## Ingresar token en la app

1. Abre Quimbar.
2. Si la licencia está vencida/inválida, se mostrará un modal pidiendo token (incluye Hardware ID).
3. Pega el token y pulsa **Activar token**.
4. Si es válido, la app guarda localmente la licencia cifrada y permite abrir la ventana principal.
5. Si intentas usar ese mismo token en otra computadora, será rechazado porque el hash de hardware no coincide.
