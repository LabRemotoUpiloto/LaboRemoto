# Comandos útiles — Cliente SSH Unipiloto

## Desarrollo

```powershell
# Iniciar app en modo desarrollo (frontend + backend)
npm run dev

# Solo frontend (Vite dev server)
npm run dev:frontend
```

## Build & Release (ciclo completo)

```powershell
# 1. Subir versión en Cliente-Rust/backend/tauri.conf.json
# 2. Construir la app (firma automática si las env vars están bien)
cd Cliente-Rust/backend

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath "..\.tauri\keys.key" | ForEach-Object { $_.Trim() }
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "#NifHJaEBQq))UGd!B#^8zE=X5iiT|tP"
cargo tauri build
```

### Si la firma falló, firmar manualmente

```powershell
cd Cliente-Rust/backend
$key = Get-Content -Raw -LiteralPath "..\.tauri\keys.key"
cargo tauri signer sign -k $key.Trim() -p "#NifHJaEBQq))UGd!B#^8zE=X5iiT|tP" "target/release/bundle/nsis/Cliente SSH Unipiloto_0.1.X_x64-setup.exe"
```

### Crear release en GitHub

```powershell
# Desde la raíz del proyecto (LaboRemoto/)
gh release create v0.1.X `
  "Cliente-Rust/backend/target/release/bundle/nsis/Cliente SSH Unipiloto_0.1.X_x64-setup.exe" `
  "Cliente-Rust/backend/target/release/bundle/nsis/latest.json" `
  --repo Haider2231/Releases-Cliente-SSH-Unipiloto `
  --title "v0.1.X" `
  --notes "Descripción del cambio"
```

## Notas

- El `latest.json` se sube a la release para que el updater lo detecte.
- La URL del installer en `latest.json` usa puntos en vez de espacios (GitHub reemplaza automáticamente).
- El endpoint del updater ya configurado: `releases/latest/download/latest.json`
- La contraseña de la llave de firma está en `Cliente-Rust/.env`.
- La llave privada está en `Cliente-Rust/.tauri/keys.key`.
