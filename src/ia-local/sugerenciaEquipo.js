/**
 * Qué conviene usar en ESTE equipo según sus componentes (gráfica, memoria, núcleos, WebGPU) y lo
 * que ya tiene instalado (Ollama y sus modelos). Junta en un solo lugar las recomendaciones que el
 * panel de la IA local repartía en cada selector, con el porqué de cada una, para que el usuario
 * pueda dejar todo listo con un clic en vez de adivinar qué modelo le sirve.
 */
import {
  CATALOGO_TEXTO, CATALOGO_VOZ, NOMBRE_NIVEL, graficaDedicada, textoRecomendado, vozRecomendada,
} from './configuracionIA.js';
import { modeloOllamaPorDefecto, modeloSugeridoOllama, modeloVistaSugerido } from './ollama.js';

// Tamaño aproximado de lo que baja `ollama pull` (biblioteca de Ollama, cuantización por defecto)
const GB_OLLAMA = {
  'llama3.2:1b': 1.3,
  'llama3.2:3b': 2.0,
  'qwen2.5-coder:7b': 4.7,
  'gemma3:4b': 3.3,
  'qwen2.5vl:7b': 6.0,
  moondream: 1.7,
};

export const gbDeOllama = (modelo) => GB_OLLAMA[modelo] ?? null;

/** Lo que se detectó del equipo, en frases cortas para mostrar. */
export const describirEquipo = (capacidades) => {
  if (!capacidades) return [];
  const partes = [];
  if (capacidades.webgpu) {
    const nombre = capacidades.adaptador || 'gráfica sin nombre';
    partes.push(`Gráfica: ${nombre} (${graficaDedicada(capacidades) ? 'dedicada' : 'integrada'})`);
    partes.push(capacidades.f16 ? 'WebGPU con f16' : 'WebGPU sin f16');
  } else {
    partes.push('El navegador no puede usar la gráfica (sin WebGPU)');
  }
  partes.push(capacidades.memoriaGB ? `memoria ≥ ${capacidades.memoriaGB} GB` : 'memoria no informada por el navegador');
  if (capacidades.nucleos) partes.push(`${capacidades.nucleos} núcleos`);
  if (capacidades.libreMB) partes.push(`${Math.round(capacidades.libreMB / 1024)} GB libres para modelos`);
  return partes;
};

const porqueDelNivel = (nivel, capacidades) => {
  if (nivel === 'gpu') {
    return graficaDedicada(capacidades)
      ? 'Tu gráfica dedicada admite WebGPU con f16: los modelos corren en la tarjeta gráfica.'
      : 'Tu gráfica integrada admite WebGPU con f16: alcanza para modelos livianos.';
  }
  if (nivel === 'cpu') return 'El navegador no puede usar la gráfica con f16, pero la memoria y los núcleos alcanzan para la voz en el procesador.';
  return 'Memoria o núcleos justos: conviene lo más liviano y el intérprete de órdenes.';
};

/**
 * @param capacidades  lo que devolvió detectarCapacidades()
 * @param ollama       lo que devolvió estadoOllama() (o null si no se comprobó)
 * @returns {{ nivel, porqueNivel, equipo: string[], voz, texto, vista } | null}
 *   voz:   { opcion, mb, porque }                       — siempre en el navegador
 *   texto: { motor: 'ollama'|'navegador', opcion?, mb?, modelo?, gb?, listo?, alternativa?, porque }
 *   vista: { modelo, gb, porque }                        — leer fotos, siempre con Ollama (opcional)
 */
export const sugerenciaParaEquipo = (capacidades, ollama = null) => {
  if (!capacidades) return null;
  const nivel = capacidades.recomendado;
  const dedicada = graficaDedicada(capacidades);
  const opcionVoz = CATALOGO_VOZ.find((o) => o.clave === vozRecomendada(capacidades, nivel));
  const opcionTexto = CATALOGO_TEXTO.find((o) => o.clave === textoRecomendado(capacidades, nivel)) || null;
  const conModelos = Boolean(ollama?.disponible && ollama.modelos?.length);
  const modeloOllama = modeloSugeridoOllama(capacidades);
  const modeloVista = modeloVistaSugerido(capacidades);

  const voz = {
    opcion: opcionVoz,
    mb: nivel === 'gpu' ? opcionVoz.mbGpu : opcionVoz.mbCpu,
    porque: nivel === 'basico'
      ? 'El más liviano: en un equipo modesto transcribe sin trabar la página.'
      : `En ${nivel === 'gpu' ? 'la gráfica' : 'el procesador'} transcribe bien el español técnico en pocos segundos y pesa poco.`,
  };

  let texto;
  if (conModelos) {
    texto = {
      motor: 'ollama',
      modelo: modeloOllamaPorDefecto(ollama.modelos),
      listo: true,
      porque: 'Ya tienes Ollama con modelos: responde mejor y más rápido que un modelo dentro del navegador.',
    };
  } else if (opcionTexto) {
    texto = {
      motor: 'navegador',
      opcion: opcionTexto,
      mb: opcionTexto.mb,
      alternativa: { modelo: modeloOllama, gb: gbDeOllama(modeloOllama) },
      porque: dedicada
        ? `Tu gráfica dedicada mueve ${opcionTexto.nombre} dentro del navegador, sin instalar nada.`
        : `Con gráfica integrada conviene ${opcionTexto.nombre}: responde en segundos; uno más grande iría lento.`,
    };
  } else {
    texto = {
      motor: 'ollama',
      modelo: modeloOllama,
      gb: gbDeOllama(modeloOllama),
      listo: false,
      porque: 'Sin la gráfica, un modelo dentro del navegador tardaría más de un minuto por respuesta. Ollama corre como programa del equipo y responde en segundos aun en el procesador.',
    };
  }

  const vista = {
    modelo: modeloVista,
    gb: gbDeOllama(modeloVista),
    porque: 'Opcional: lee fotos del diagrama sin internet. Siempre corre en Ollama.',
  };

  return {
    nivel,
    nombreNivel: NOMBRE_NIVEL[nivel],
    porqueNivel: porqueDelNivel(nivel, capacidades),
    equipo: describirEquipo(capacidades),
    voz,
    texto,
    vista,
  };
};

export default sugerenciaParaEquipo;
