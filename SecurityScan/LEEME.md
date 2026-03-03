# SecurityScan - Escáner de Seguridad del Sistema

## Archivos incluidos

### 1. `escanear_seguridad.bat`
Escanea el sistema y genera un reporte detallado. **No modifica nada**, solo lee información.

**Qué analiza:**
- **Puertos abiertos** y conexiones de red activas (busca puerto 1688 KMS)
- **Reglas del Firewall** de Windows
- **IFEO (Image File Execution Options)** - detecta hijacking de procesos del sistema
- **Servicios** del sistema (busca servicios KMS/AutoKMS)
- **Tareas programadas** sospechosas
- **Registro de Windows** - claves de activación KMS
- **Archivos sospechosos** - SECOH-QAD, KMSpico en el sistema
- **Windows Defender** - estado y amenazas detectadas

**Cómo usar:**
1. Clic derecho → **Ejecutar como administrador** (recomendado para resultados completos)
2. Esperar a que termine el escaneo
3. Se abrirá automáticamente la carpeta con los resultados
4. Leer primero `RESUMEN_LEER_PRIMERO.txt`

### 2. `limpiar_kms.bat`
Elimina los residuos de KMSpico/activadores KMS del sistema. **SÍ modifica el sistema**.

**Qué elimina:**
- Entrada IFEO de SppExtComObj.exe (hijacking)
- Claves KMS del registro de Windows
- Archivos SECOH-QAD de System32/SysWOW64
- Servicio AutoKMS si existe
- Tareas programadas AutoKMS/AutoPico

**Cómo usar:**
1. **Primero ejecuta `escanear_seguridad.bat`** para saber qué hay
2. Clic derecho → **Ejecutar como administrador** (OBLIGATORIO)
3. Confirmar con "S" cuando pregunte
4. Ejecutar `escanear_seguridad.bat` otra vez para verificar limpieza

## ⚠️ Notas importantes
- Después de limpiar, Windows puede mostrar que **no está activado** si se usaba KMS
- El escáner **no modifica nada**, es seguro ejecutarlo siempre
- El limpiador **sí modifica** el sistema, úsalo solo si el escáner encontró cosas
