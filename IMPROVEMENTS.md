# Recomendaciones de Mejora - File Archiver for Toonboom Harmony

## Resumen Ejecutivo

Este documento identifica áreas de mejora para el módulo `sevenzip.js`, un wrapper de 7-Zip para Toonboom Harmony Scripts. El análisis encontró **3 bugs críticos**, múltiples problemas de calidad de código, y oportunidades de mejora en documentación y arquitectura.

---

## 1. Bugs Críticos (Arreglar Inmediatamente)

### 1.1 Bug en Asignación de Callback (Línea 33)

**Problema:**
```javascript
if (typeof processStartCallback === "undefined") var progressCallback = null;
```

**Impacto:** El código verifica `processStartCallback` pero asigna a `progressCallback`. Los callbacks de inicio del proceso **nunca funcionarán**.

**Solución:**
```javascript
if (typeof processStartCallback === "undefined") var processStartCallback = null;
```

### 1.2 Lógica de Progreso Invertida (Líneas 213, 338)

**Problema:**
```javascript
if (isNaN(output7z)) {
  this.progressCallback.call(this.parentContext, parseInt(output7z));
}
```

**Impacto:** La condición está invertida. El callback se ejecuta cuando `output7z` es `NaN` (no encontrado), no cuando hay un porcentaje válido. **El progreso nunca se reporta correctamente.**

**Solución:**
```javascript
if (!isNaN(output7z)) {
  this.progressCallback.call(this.parentContext, parseInt(output7z));
}
```

### 1.3 Variable Global No Declarada (Línea 172)

**Problema:**
```javascript
var sizeCalculator = function (sourcePath) {
  totalSize = 0;  // Falta 'var' - crea variable global!
```

**Impacto:** Contamina el scope global y puede causar conflictos.

**Solución:**
```javascript
var totalSize = 0;
```

---

## 2. Problemas de Alta Prioridad

### 2.1 Fugas de Conexiones de Señales

**Ubicación:** Líneas 209-267, 334-373

**Problema:**
```javascript
this.process.readyReadStandardOutput.connect(this, function () { ... });
// No hay disconnect() antes de reutilizar el proceso
```

**Impacto:**
- Fugas de memoria con operaciones prolongadas
- Callbacks duplicados por cada evento
- Degradación exponencial del rendimiento

**Solución:** Implementar limpieza de conexiones:
```javascript
// Almacenar referencia a la conexión
this._readyReadConnection = function() { ... };
this.process.readyReadStandardOutput.connect(this, this._readyReadConnection);

// Antes de nueva conexión o al finalizar:
this.process.readyReadStandardOutput.disconnect(this, this._readyReadConnection);
```

### 2.2 Inconsistencia en Parámetro `sources`

**Problema:**
- Constructor JSDoc indica `source` (singular)
- `zipAsync()` espera un array de rutas
- `zip()` usa concatenación de string: `this.sources + "/*"`
- Usa `for...in` con arrays (anti-patrón)

**Solución:**
```javascript
// Normalizar siempre a array
this.sources = Array.isArray(sources) ? sources : [sources];

// Usar iteración estándar
for (var i = 0; i < this.sources.length; i++) {
  this.command.push(this.sources[i]);
}
```

### 2.3 Manejo de Errores Silencioso

**Problema:**
```javascript
try {
  // operaciones 7zip
} catch (error) {
  this.log(error);  // Solo registra si debug=true
}
```

**Impacto:** El llamador nunca sabe si falló la operación.

**Solución:** Agregar callback de error:
```javascript
// En constructor
this.errorCallback = errorCallback || null;

// En catch
catch (error) {
  this.log(error);
  if (typeof this.errorCallback === "function") {
    this.errorCallback.call(this.parentContext, error);
  }
}
```

### 2.4 Método `unzip()` Síncrono Faltante

**Problema:** Existe `zip()`, `zipAsync()`, `unzipAsync()`, pero **no hay `unzip()` síncrono**.

**Solución:** Implementar método síncrono de descompresión para consistencia de API.

---

## 3. Problemas de Prioridad Media

### 3.1 Sin Validación de Parámetros

**Problema:** El constructor no valida:
- Si las rutas de origen existen
- Si el destino es escribible
- Si los callbacks son funciones válidas
- Si el filtro regex es válido

**Solución:**
```javascript
function SevenZip(parentContext, sources, destination, ...) {
  // Validar rutas
  if (!QFile.exists(sources)) {
    throw new Error("Source path does not exist: " + sources);
  }

  // Validar callbacks
  if (progressCallback && typeof progressCallback !== "function") {
    throw new Error("progressCallback must be a function");
  }
}
```

### 3.2 URLs y Rutas Hardcodeadas

**Ubicación:** Líneas 142-148

**Problema:**
```javascript
"powershell (New-Object Net.WebClient).DownloadFile('https://www.7-zip.org/a/7zr.exe', ...)"
```

**Impacto:**
- No hay validación de checksum
- Sin fuentes alternativas
- Sin forma de especificar binario personalizado

**Solución:** Usar configuración:
```javascript
SevenZip.config = {
  downloadUrl: "https://www.7-zip.org/a/7zr.exe",
  expectedChecksum: "abc123...",
  customBinaryPath: null
};
```

### 3.3 Clase `Connection` Incompleta

**Ubicación:** Líneas 381-464

**Problema:**
- Referencia `this.bin` no inicializado
- Mezcla slashes adelante/atrás
- Nunca usada por SevenZip
- Timeout hardcodeado

**Solución:** Completar implementación o eliminar código muerto.

### 3.4 Uso de `__proto__`

**Problema:**
```javascript
SevenZip.__proto__.binPath = ...  // Afecta todas las instancias
```

**Solución:** Usar propiedad estática de clase:
```javascript
SevenZip._cachedBinPath = null;

Object.defineProperty(SevenZip.prototype, 'binPath', {
  get: function() {
    if (!SevenZip._cachedBinPath) {
      // detectar y cachear
    }
    return SevenZip._cachedBinPath;
  }
});
```

---

## 4. Mejoras de Documentación

### 4.1 README.md Mínimo

El README actual solo tiene el título. Debería incluir:
- Descripción del proyecto
- Requisitos de sistema
- Instrucciones de instalación
- Ejemplos de uso
- Documentación de API
- Manejo de errores
- Licencia

### 4.2 JSDoc Incompleto

**Problemas encontrados:**
- Línea 64: Typedef duplicado (`processStartCallback` en vez de `processEndCallback`)
- Parámetros del constructor no coinciden con docs
- `debugCallback` falta en documentación
- Tipos inconsistentes (`{ string }` vs `{ bool }`)

---

## 5. Mejoras de Arquitectura

### 5.1 Separación de Responsabilidades

La clase `SevenZip` actualmente maneja:
- Detección de binarios
- Gestión de procesos
- Enrutamiento de callbacks
- Logging de errores
- Manejo de parámetros

**Recomendación:** Extraer a clases separadas:
```
BinaryResolver    - Detectar rutas de binarios por plataforma
ProcessManager    - Gestionar QProcess y señales
ProgressTracker   - Manejar callbacks de progreso
SevenZip         - Orquestación de alto nivel
```

### 5.2 Patrón de Configuración

Reemplazar múltiples parámetros con objeto de configuración:
```javascript
var archiver = new SevenZip({
  context: this,
  sources: ["/path/to/source"],
  destination: "/path/to/dest.7z",
  filter: "*.txt",
  callbacks: {
    onProgress: function(percent) { },
    onStart: function() { },
    onEnd: function(success) { },
    onError: function(error) { }
  },
  options: {
    debug: false,
    deleteSource: false,
    overwrite: true
  }
});
```

### 5.3 Agregar Tests

No hay tests en el repositorio. Implementar:
- Tests unitarios para validación de parámetros
- Tests de integración para operaciones zip/unzip
- Tests de plataforma (Windows, macOS, Linux)

---

## 6. Consideraciones de Seguridad

### 6.1 Potencial Inyección de Comandos

**Problema:** Concatenación de script PowerShell en Windows.

**Recomendación:** Sanitizar todas las rutas de archivo antes de usarlas en comandos shell.

### 6.2 Binarios Descargados Sin Verificar

**Problema:** El binario 7zr.exe se descarga sin validación de checksum o firma.

**Recomendación:** Implementar verificación de integridad:
```javascript
var expectedHash = "sha256:abc123...";
// Después de descarga
var actualHash = calculateHash(downloadedFile);
if (actualHash !== expectedHash) {
  throw new Error("Downloaded binary failed integrity check");
}
```

### 6.3 Eliminación de Archivos Sin Confirmación

El flag `deleteSource` elimina datos originales sin confirmación. Considerar agregar validación adicional o backup temporal.

---

## 7. Resumen de Prioridades

| Prioridad | Cantidad | Acción |
|-----------|----------|--------|
| Crítica | 3 | Bugs que rompen funcionalidad - arreglar inmediatamente |
| Alta | 4 | Problemas que causan comportamiento inesperado |
| Media | 4 | Mejoras de calidad y mantenibilidad |
| Baja | 5+ | Mejoras de arquitectura y documentación |

---

## 8. Plan de Implementación Sugerido

### Fase 1: Corrección de Bugs (Inmediato)
1. Corregir bug de `processStartCallback`
2. Arreglar lógica invertida de progreso (`!isNaN`)
3. Declarar variable `totalSize` con `var`

### Fase 2: Estabilización (Corto plazo)
1. Implementar limpieza de conexiones de señales
2. Normalizar manejo de `sources` array/string
3. Agregar callbacks de error
4. Implementar `unzip()` síncrono

### Fase 3: Mejoras (Mediano plazo)
1. Validación de parámetros de entrada
2. Mejorar documentación JSDoc
3. Expandir README con ejemplos
4. Externalizar configuración

### Fase 4: Refactorización (Largo plazo)
1. Separar responsabilidades en clases
2. Agregar tests
3. Implementar seguridad (checksums, sanitización)
4. Completar o eliminar clase `Connection`

---

*Documento generado el 2026-01-09*
