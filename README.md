# Quimbar - Notas rápidas

## Generar un token válido de licencia

1. Define el mismo secreto para **Electron** y **Backend**:
   ```bash
   export QUIMBAR_LICENSE_SECRET="QuimbarToken2026"
   ```
2. Genera token con vencimiento a 2 meses:
   ```bash
   python tools/generate_token.py --months 2
   ```
   O con fecha exacta:
   ```bash
   python tools/generate_token.py --date 2026-08-31
   ```
3. Copia el valor mostrado en `Token: QBM.YYYYMMDD.FIRMA`.

## Ingresar token en la app

1. Abre Quimbar.
2. Si la licencia está vencida/inválida, se mostrará un modal pidiendo token.
3. Pega el token y pulsa **Activar token**.
4. Si es válido, la app guarda localmente la licencia cifrada y permite abrir la ventana principal.
