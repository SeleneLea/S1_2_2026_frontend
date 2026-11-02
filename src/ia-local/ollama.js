/**
 * IA local con Ollama instalado en el equipo (http://localhost:11434).
 *
 * Frente al modelo dentro del navegador tiene tres ventajas: los modelos se descargan una
 * sola vez en la PC (no en cada navegador ni en cada perfil), usan la tarjeta gráfica
 * dedicada con sus controladores, y pueden ser mucho más grandes (7B o más).
 *
 * Para que la app pueda hablarle desde su dirección de internet, Ollama tiene que permitir
 * ese origen con la variable OLLAMA_ORIGINS; si se usa la app desde localhost no hace falta.
 */

export const URL_OLLAMA = 'http://localhost:11434';

let ultimaRevision = { cuando: 0, estado: null };

const consultar = async (ruta, opciones = {}, milisegundos = 2500) => {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), milisegundos);
  try {
    return await fetch(`${URL_OLLAMA}${ruta}`, { ...opciones, signal: control.signal });
  } finally {
    clearTimeout(reloj);
  }
};

/**
 * ¿Hay un Ollama escuchando en este equipo? Devuelve también los modelos instalados.
 * El resultado se recuerda unos segundos para no consultar en cada pulsación.
 */
export const estadoOllama = async ({ forzar = false } = {}) => {
  if (!forzar && ultimaRevision.estado && Date.now() - ultimaRevision.cuando < 15000) return ultimaRevision.estado;
  let estado;
  try {
    const respuesta = await consultar('/api/tags');
    if (!respuesta.ok) {
      estado = { disponible: false, modelos: [], motivo: `Ollama respondió ${respuesta.status}` };
    } else {
      const datos = await respuesta.json();
      const modelos = (datos.models || []).map((m) => ({
        nombre: m.name,
        mb: Math.round((m.size || 0) / 1048576),
        familia: m.details?.family || '',
      }));
      estado = { disponible: true, modelos, motivo: null };
    }
  } catch (error) {
    // Para el navegador, "Ollama no permite esta página" (responde 403, sin permiso CORS) y "no
    // hay nadie escuchando" se ven igual. Una consulta sin CORS lo distingue: si Ollama está
    // abierto, contesta aunque no permita esta página.
    const origenNoPermitido = error.name !== 'AbortError' && await respondeSinCors();
    // Sin respuesta y desde https: puede ser el navegador bloqueando los programas del equipo
    const bloqueoDelNavegador = !origenNoPermitido && error.name !== 'AbortError'
      && typeof window !== 'undefined' && window.location.protocol === 'https:';
    estado = {
      disponible: false,
      modelos: [],
      motivo: origenNoPermitido
        ? 'Ollama está abierto, pero no tiene permitida esta página'
        : error.name === 'AbortError' ? 'No respondió a tiempo' : 'No se pudo conectar',
      origenNoPermitido,
      bloqueoDelNavegador,
    };
  }
  ultimaRevision = { cuando: Date.now(), estado };
  return estado;
};

export const olvidarEstadoOllama = () => { ultimaRevision = { cuando: 0, estado: null }; };

/** ¿Hay algo escuchando en el puerto de Ollama? (respuesta opaca: no necesita su permiso) */
const respondeSinCors = async () => {
  try {
    await consultar('/api/version', { mode: 'no-cors' }, 2000);
    return true;
  } catch {
    return false;
  }
};

/**
 * Comando de PowerShell que AGREGA una página a OLLAMA_ORIGINS sin quitar las que ya estaban.
 * Antes se usaba `setx OLLAMA_ORIGINS "<página>"`, que reemplaza el valor: al cambiar la
 * dirección de la app (de Render a AWS) quedaba permitida solo la vieja.
 */
const agregarOrigenPowerShell = (origen) =>
  "$o=[Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS','User'); $l=@(); "
  + "if($o){$l=@($o -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })}; "
  + `if($l -notcontains '${origen}'){$l+='${origen}'}; `
  + "[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS',($l -join ','),'User'); "
  + "Write-Output ('Paginas permitidas: ' + ($l -join ', '))";

/** Para pegar en una terminal de Windows (después hay que reiniciar Ollama). */
export const comandoPermitirPagina = (origen) => `powershell -NoProfile -Command "${agregarOrigenPowerShell(origen)}"`;

/** Pasos .bat: agregar la página y reiniciar Ollama con el permiso ya aplicado. */
const pasosPermitirWindows = (origen) => [
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "${agregarOrigenPowerShell(origen)}"`,
  // El Ollama que se abra desde aquí hereda el valor nuevo (los programas ya abiertos no lo ven)
  'for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'OLLAMA_ORIGINS\',\'User\')"`) do set "OLLAMA_ORIGINS=%%v"',
];
/** Espera a que Ollama conteste (hasta 30 s): en una PC lenta tarda más que unos segundos fijos. */
const esperarOllamaWindows = [
  'set /a ESPERA=0',
  ':esperar_ollama',
  'curl -s -o nul http://localhost:11434/api/version',
  'if not errorlevel 1 goto :ollama_listo',
  'set /a ESPERA+=1',
  'if %ESPERA% GEQ 30 goto :ollama_listo',
  'timeout /t 1 /nobreak >nul',
  'goto :esperar_ollama',
  ':ollama_listo',
];
const abrirOllamaWindows = 'if exist "%LOCALAPPDATA%\\Programs\\Ollama\\ollama app.exe" (start "" "%LOCALAPPDATA%\\Programs\\Ollama\\ollama app.exe") else (start "" /B "%LOCALAPPDATA%\\Programs\\Ollama\\ollama.exe" serve)';
const arrancarOllamaWindows = [
  'taskkill /IM "ollama app.exe" /F >nul 2>&1',
  'taskkill /IM ollama.exe /F >nul 2>&1',
  'timeout /t 2 /nobreak >nul',
  // La aplicación de la bandeja sigue funcionando aunque se cierre esta ventana
  abrirOllamaWindows,
  ...esperarOllamaWindows,
];

/**
 * Archivo para quien YA tiene Ollama: permite esta página (conservando las anteriores) y lo
 * reinicia. No reinstala nada ni descarga modelos.
 */
export const guionPermitirPagina = ({ origen, windows = true }) => {
  if (windows) {
    return {
      nombre: 'permitir-ollama.bat',
      tipo: 'application/bat',
      contenido: [
        '@echo off',
        'chcp 65001 >nul',
        'title Permitir que el Diagramador UML use Ollama',
        `echo [1/2] Permitiendo ${origen} (se conservan las paginas ya permitidas)...`,
        ...pasosPermitirWindows(origen),
        'echo [2/2] Reiniciando Ollama para que tome el permiso...',
        ...arrancarOllamaWindows,
        'echo.',
        'echo Listo. Vuelve al navegador y pulsa "Volver a comprobar".',
        'pause',
        '',
      ].join('\r\n'),
    };
  }
  return {
    nombre: 'permitir-ollama.sh',
    tipo: 'application/x-sh',
    contenido: [
      '#!/bin/sh',
      '# Permite esta pagina en Ollama, conservando las ya permitidas, y lo reinicia.',
      `NUEVA="${origen}"`,
      'ACTUALES="${OLLAMA_ORIGINS:-}"',
      'case ",$ACTUALES," in *",$NUEVA,"*) VALOR="$ACTUALES" ;; *) VALOR="${ACTUALES:+$ACTUALES,}$NUEVA" ;; esac',
      'if [ "$(uname)" = "Darwin" ]; then launchctl setenv OLLAMA_ORIGINS "$VALOR"; fi',
      'export OLLAMA_ORIGINS="$VALOR"',
      'pkill ollama >/dev/null 2>&1 || true',
      '(ollama serve >/dev/null 2>&1 &)',
      'sleep 5',
      'echo "Listo. Paginas permitidas: $VALOR"',
      'echo "Para que quede permanente agrega a tu perfil: export OLLAMA_ORIGINS=\\"$VALOR\\""',
      '',
    ].join('\n'),
  };
};

/**
 * Elige el modelo instalado más adecuado para las órdenes de texto: se prefieren los de
 * instrucciones o código y, entre ellos, los solo de texto (los que ven imágenes responden más
 * lento y los de embeddings no conversan).
 */
export const modeloOllamaPorDefecto = (modelos = []) => {
  if (!modelos.length) return null;
  const conversan = modelos.filter((m) => !/embed/i.test(m.nombre));
  const deTexto = conversan.filter((m) => !NOMBRE_CON_VISTA.test(m.nombre));
  const preferido = (lista) => lista.find((m) => /instruct|coder|llama3|qwen|mistral|phi/i.test(m.nombre));
  return (preferido(deTexto) || deTexto[0] || preferido(conversan) || conversan[0] || modelos[0]).nombre;
};

// ------------------------------------------------------------------ modelos que ven imágenes

// Familias multimodales de Ollama. Se usa como respaldo: lo que manda es lo que declare
// /api/show, porque la lista de modelos con vista cambia a menudo.
const NOMBRE_CON_VISTA = /llava|bakllava|vl\b|-vl|vision|minicpm-v|moondream|gemma3|granite3\.\d-vision|mistral-small3/i;

/** Orden de preferencia para leer un diagrama: primero los que mejor leen texto dentro de la imagen. */
const PREFERENCIA_VISTA = [/qwen2\.?5vl|qwen2-vl/i, /minicpm-v/i, /gemma3/i, /llava/i, /llama3\.2-vision/i, /mistral-small3/i, /moondream/i];

const vistaDeclarada = new Map();

/**
 * ¿Este modelo instalado acepta imágenes? Ollama lo dice en /api/show ("capabilities"),
 * y en las versiones viejas se deduce del nombre y de la familia del proyector.
 */
export const modeloVeImagenes = async (nombre) => {
  if (!nombre) return false;
  if (vistaDeclarada.has(nombre)) return vistaDeclarada.get(nombre);
  let vista = NOMBRE_CON_VISTA.test(nombre);
  try {
    const respuesta = await consultar('/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: nombre }),
    }, 4000);
    if (respuesta.ok) {
      const datos = await respuesta.json();
      const capacidades = (datos.capabilities || []).map((c) => String(c).toLowerCase());
      const familias = (datos.details?.families || []).map((f) => String(f).toLowerCase());
      if (capacidades.length) vista = capacidades.includes('vision');
      else if (familias.some((f) => ['clip', 'mllama', 'qwen2vl', 'gemma3'].includes(f))) vista = true;
    }
  } catch {
    // Sin respuesta se queda con lo que diga el nombre
  }
  vistaDeclarada.set(nombre, vista);
  return vista;
};

/** Modelos instalados que aceptan imágenes, ya ordenados por lo bien que leen un diagrama. */
export const modelosConVista = async (modelos = []) => {
  const marcados = await Promise.all(modelos.map(async (m) => ({ ...m, vista: await modeloVeImagenes(m.nombre) })));
  const conVista = marcados.filter((m) => m.vista);
  const puesto = (nombre) => {
    const i = PREFERENCIA_VISTA.findIndex((patron) => patron.test(nombre));
    return i === -1 ? PREFERENCIA_VISTA.length : i;
  };
  return conVista.sort((a, b) => puesto(a.nombre) - puesto(b.nombre));
};

/** El mejor modelo instalado para leer una imagen, o null si no hay ninguno. */
export const modeloVistaPorDefecto = async (modelos = []) => {
  const conVista = await modelosConVista(modelos);
  return conVista.length ? conVista[0].nombre : null;
};

/**
 * Modelo con vista recomendado para este equipo. Los de 7B leen bastante mejor el texto
 * dentro de una foto, pero piden memoria; en equipos modestos va uno de 3B o 4B.
 */
export const modeloVistaSugerido = (capacidades) => {
  const memoriaGB = capacidades?.memoriaGB ?? 8;
  const dedicada = /nvidia|geforce|rtx|gtx|quadro|radeon rx|\barc\b|apple/i.test(capacidades?.adaptador || '');
  if (dedicada && memoriaGB >= 16) return 'qwen2.5vl:7b';
  if (memoriaGB >= 8) return 'gemma3:4b';
  return 'moondream';
};

/**
 * Genera texto con Ollama. Los mensajes son los mismos que usa el modelo del navegador.
 *
 * Un mensaje puede llevar `images: ['<base64 sin el prefijo data:>']`: los modelos con vista
 * leen la imagen y responden sobre ella. Leer una imagen tarda mucho más que responder texto,
 * así que la espera es más larga cuando alguna la trae.
 */
export const generarConOllama = async (mensajes, modelo, { temperatura = 0.2, maxTokens = 512 } = {}) => {
  const conImagen = mensajes.some((m) => Array.isArray(m.images) && m.images.length);
  // La respuesta llega por partes y la espera se cuenta desde la última: un 7B en un equipo sin
  // gráfica dedicada tarda varios minutos en una revisión, pero mientras siga escribiendo no se
  // corta (antes había un tope total de 2 minutos y fallaba con "signal is aborted").
  const hastaLaPrimera = conImagen ? 420000 : 180000; // cargar el modelo y leer el pedido
  const entrePartes = 60000;
  const control = new AbortController();
  let reloj = null;
  const esperar = (ms) => {
    clearTimeout(reloj);
    reloj = setTimeout(() => control.abort(), ms);
  };
  let texto = '';
  const leerLinea = (linea) => {
    if (!linea.trim()) return;
    const parte = JSON.parse(linea);
    if (parte.error) throw new Error(`Ollama no pudo responder: ${String(parte.error).slice(0, 120)}`);
    texto += parte.message?.content || '';
  };
  try {
    esperar(hastaLaPrimera);
    const respuesta = await fetch(`${URL_OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        stream: true,
        options: { temperature: temperatura, num_predict: maxTokens },
      }),
      signal: control.signal,
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Ollama no pudo responder (${respuesta.status}). ${detalle.slice(0, 120)}`);
    }
    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let pendiente = '';
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      esperar(entrePartes);
      pendiente += decodificador.decode(value, { stream: true });
      const lineas = pendiente.split('\n');
      pendiente = lineas.pop();
      lineas.forEach(leerLinea);
    }
    leerLinea(pendiente + decodificador.decode());
    return texto;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(texto
        ? `${modelo} dejó de escribir durante más de ${entrePartes / 1000} s`
        : `${modelo} no empezó a responder en ${hastaLaPrimera / 60000} minutos (es pesado para este equipo: prueba uno más liviano en 💻 IA local)`);
    }
    throw error;
  } finally {
    clearTimeout(reloj);
  }
};

/**
 * Modelo recomendado para este equipo. Con gráfica dedicada y memoria de sobra vale la pena un
 * modelo de 7B; si no, uno de 3B o 1B, que responden rápido en equipos modestos.
 * El navegador informa la memoria con un tope de 8 GB: "8" quiere decir "8 o más".
 */
export const modeloSugeridoOllama = (capacidades) => {
  const memoriaGB = capacidades?.memoriaGB ?? 8;
  const dedicada = /nvidia|geforce|rtx|gtx|quadro|radeon rx|\barc\b|apple/i.test(capacidades?.adaptador || '');
  if (dedicada && memoriaGB >= 8) return 'qwen2.5-coder:7b';
  if (memoriaGB >= 8) return 'llama3.2:3b';
  return 'llama3.2:1b';
};

const OLLAMA_EXE = '%LOCALAPPDATA%\\Programs\\Ollama\\ollama.exe';

/** Familias que leen imágenes, para `findstr` (cualquiera de las palabras). */
const FAMILIAS_CON_VISTA = 'vl llava gemma3 moondream vision minicpm-v';

/**
 * Pasos .bat: bajar el modelo recomendado solo si la PC no tiene ya uno que sirva. Para texto
 * sirve cualquier modelo instalado; para fotos, uno de una familia con vista. Así no se bajan
 * varios GB de más en una PC que ya tenía, por ejemplo, qwen2.5:7b.
 */
const pasosModeloWindows = (paso, titulo, modelo, { vista = false } = {}) => [
  `echo ${paso} ${titulo}: ${modelo}`,
  vista
    ? `"${OLLAMA_EXE}" list | findstr /i "${FAMILIAS_CON_VISTA}" >nul`
    : `"${OLLAMA_EXE}" list | findstr /v /b /c:"NAME" | findstr /r "." >nul`,
  `if errorlevel 1 ("${OLLAMA_EXE}" pull ${modelo}) else (echo   Ya hay uno instalado, no hace falta descargarlo.)`,
];

/** El paso del navegador, que ningún archivo puede hacer por el usuario. */
const PASO_NAVEGADOR = [
  'echo.',
  'echo Falta un paso en el navegador, si la pagina no esta en este equipo:',
  'echo   candado de la barra de direcciones, Configuracion del sitio, Acceso a la red local, Permitir.',
  'echo Despues vuelve a la pagina y pulsa "Volver a comprobar".',
];

/**
 * Configurador para una PC: hace SOLO lo que falta y se puede abrir las veces que haga falta.
 *   1. instala Ollama si no está;  2. permite esta página (sin quitar las ya permitidas);
 *   3. reinicia Ollama con el permiso;  4-5. descarga los modelos que falten (texto y fotos).
 * El navegador no puede instalar programas ni cambiar permisos: entrega este archivo.
 */
export const guionConfigurar = ({ origen, modelo, modeloVista = null, windows = true }) => {
  if (windows) {
    return {
      nombre: 'configurar-ollama.bat',
      tipo: 'application/bat',
      contenido: [
        '@echo off',
        'chcp 65001 >nul',
        'title Configurar Ollama para el Diagramador UML',
        'echo ================================================',
        'echo  Configurar Ollama para el Diagramador UML',
        'echo  Solo hace lo que falta en este equipo.',
        'echo ================================================',
        'echo.',
        'echo [1/5] Ollama',
        `if exist "${OLLAMA_EXE}" goto :instalado`,
        'echo   Instalando Ollama, acepta el permiso de Windows si lo pide...',
        'where winget >nul 2>&1',
        'if errorlevel 1 goto :sinwinget',
        'winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements',
        'goto :verificar',
        ':sinwinget',
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://ollama.com/download/OllamaSetup.exe -OutFile $env:TEMP\\OllamaSetup.exe; Start-Process -Wait -FilePath $env:TEMP\\OllamaSetup.exe"',
        ':verificar',
        `if exist "${OLLAMA_EXE}" goto :instalado`,
        'echo   No se pudo instalar Ollama. Descargalo de https://ollama.com/download y vuelve a abrir este archivo.',
        'pause',
        'exit /b 1',
        ':instalado',
        'echo   Ollama esta instalado.',
        `echo [2/5] Permitiendo esta pagina: ${origen}`,
        ...pasosPermitirWindows(origen),
        'echo [3/5] Reiniciando Ollama con el permiso...',
        ...arrancarOllamaWindows,
        ...pasosModeloWindows('[4/5]', 'Modelo de texto', modelo),
        ...(modeloVista ? pasosModeloWindows('[5/5]', 'Modelo para leer fotos', modeloVista, { vista: true }) : ['echo [5/5] Modelo para leer fotos: no hace falta en este equipo.']),
        'echo.',
        'curl -s -o nul http://localhost:11434/api/version',
        'if errorlevel 1 (echo Ollama todavia no responde: abrelo desde el menu Inicio.) else (echo Listo: Ollama responde en http://localhost:11434)',
        ...PASO_NAVEGADOR,
        'pause',
        '',
      ].join('\r\n'),
    };
  }
  const modeloUnix = (m, vista = false) => [vista
    ? `ollama list | grep -Eqi "${FAMILIAS_CON_VISTA.replaceAll(' ', '|')}" || ollama pull ${m}`
    : `[ "$(ollama list | tail -n +2 | wc -l)" -gt 0 ] || ollama pull ${m}`];
  return {
    nombre: 'configurar-ollama.sh',
    tipo: 'application/x-sh',
    contenido: [
      '#!/bin/sh',
      '# Configura Ollama para el Diagramador UML: solo hace lo que falta.',
      'set -e',
      'if ! command -v ollama >/dev/null 2>&1; then',
      '  echo "[1/4] Instalando Ollama..."',
      '  curl -fsSL https://ollama.com/install.sh | sh',
      'fi',
      'echo "[2/4] Permitiendo esta pagina..."',
      `NUEVA="${origen}"`,
      'case ",${OLLAMA_ORIGINS:-}," in *",$NUEVA,"*) ;; *) OLLAMA_ORIGINS="${OLLAMA_ORIGINS:+$OLLAMA_ORIGINS,}$NUEVA" ;; esac',
      'export OLLAMA_ORIGINS',
      'if [ "$(uname)" = "Darwin" ]; then launchctl setenv OLLAMA_ORIGINS "$OLLAMA_ORIGINS"; fi',
      'pkill ollama >/dev/null 2>&1 || true',
      '(ollama serve >/dev/null 2>&1 &)',
      'sleep 5',
      `echo "[3/4] Modelo de texto ${modelo}..."`,
      ...modeloUnix(modelo),
      ...(modeloVista ? [`echo "[4/4] Modelo para leer fotos ${modeloVista}..."`, ...modeloUnix(modeloVista, true)] : []),
      'echo "Listo. Paginas permitidas: $OLLAMA_ORIGINS"',
      'echo "Para que quede permanente agrega a tu perfil: export OLLAMA_ORIGINS=\\"$OLLAMA_ORIGINS\\""',
      'echo "Falta un paso en el navegador: candado, Configuracion del sitio, Acceso a la red local, Permitir."',
      '',
    ].join('\n'),
  };
};

/** Entrega un guion (configurador, permisos, modelos) como archivo descargado. */
export const descargarGuion = (guion) => {
  const url = URL.createObjectURL(new Blob([guion.contenido], { type: `${guion.tipo};charset=utf-8` }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = guion.nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/** Compatibilidad: el instalador de antes es el configurador (también instala si falta). */
export const guionInstalacion = guionConfigurar;

/** Solo los modelos que falten (Ollama ya instalado y con permiso). */
export const guionModelos = ({ modelo, modeloVista = null, windows = true }) => {
  if (windows) {
    return {
      nombre: 'modelos-ollama.bat',
      tipo: 'application/bat',
      contenido: [
        '@echo off',
        'chcp 65001 >nul',
        'title Modelos de Ollama para el Diagramador UML',
        `if not exist "${OLLAMA_EXE}" (echo Ollama no esta instalado: usa el configurador. & pause & exit /b 1)`,
        // Si Ollama está cerrado, se abre y se espera a que conteste (la descarga la hace su servidor)
        'curl -s -o nul http://localhost:11434/api/version',
        'if errorlevel 1 goto :abrir_ollama',
        'goto :ollama_listo',
        ':abrir_ollama',
        // Con la lista de páginas permitidas al día (una consola vieja puede tener la anterior)
        pasosPermitirWindows('').at(-1),
        abrirOllamaWindows,
        ...esperarOllamaWindows,
        ...pasosModeloWindows('[1/2]', 'Modelo de texto', modelo),
        ...(modeloVista ? pasosModeloWindows('[2/2]', 'Modelo para leer fotos', modeloVista, { vista: true }) : []),
        'echo.',
        'echo Listo. Vuelve a la pagina y pulsa "Volver a comprobar".',
        'pause',
        '',
      ].join('\r\n'),
    };
  }
  return {
    nombre: 'modelos-ollama.sh',
    tipo: 'application/x-sh',
    contenido: [
      '#!/bin/sh',
      `ollama list | grep -q "^${modelo}" || ollama pull ${modelo}`,
      ...(modeloVista ? [`ollama list | grep -q "^${modeloVista}" || ollama pull ${modeloVista}`] : []),
      'echo "Listo. Vuelve a la pagina y pulsa Volver a comprobar."',
      '',
    ].join('\n'),
  };
};
