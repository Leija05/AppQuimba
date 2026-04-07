# Quimbar - Notas rápidas

## Generar token de licencia o premium

1. Define el mismo secreto para **Electron** y **Backend**:
   ```bash
   export QUIMBAR_LICENSE_SECRET="QuimbarToken2026"
   ```
2. Obtén el **Hardware ID** de la computadora destino (la app lo muestra en el modal de licencia).
3. Genera token de licencia (plan bimestral, ligado a equipo):
   ```bash
   python tools/generate_token.py --type license --plan bimestral --machine-id "HARDWARE_ID_AQUI"
   ```
   O con fecha exacta:
   ```bash
   python tools/generate_token.py --type license --date 2026-08-31 --machine-id "HARDWARE_ID_AQUI"
   ```
4. Token premium (ejemplo mensual):
   ```bash
   python tools/generate_token.py --type premium --plan mensual --machine-id "HARDWARE_ID_AQUI"
   ```
5. Planes soportados en `--plan`: `mensual`, `bimestral`, `trimestral`, `semestral`, `anual`.

## Ingresar token en la app

1. Abre Quimbar.
2. Si la licencia está vencida/inválida, se mostrará un modal pidiendo token (incluye Hardware ID).
3. Pega el token y pulsa **Activar token**.
4. Si es válido, la app guarda localmente la licencia cifrada y permite abrir la ventana principal.
5. Si la suscripción Premium caduca, al abrir la app se mostrará un aviso para renovar o continuar sin Premium.
6. Si intentas usar ese mismo token en otra computadora, será rechazado porque el hash de hardware no coincide.
