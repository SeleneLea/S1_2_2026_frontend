/**
 * Revisión del diagrama SIN internet ni modelos: reglas fijas de UML y de lo que necesita el
 * generador de código. Cada hallazgo dice qué está mal y cómo corregirlo, con el mismo formato que
 * la revisión de la IA del equipo ({ clase, nodoId, gravedad, texto }), así se marca en la pizarra.
 *
 * Es determinista: el mismo diagrama da siempre el mismo resultado, en cualquier PC y al instante.
 * Si hay Ollama, la IA local suma su revisión encima de esta (ia-local/asistenteLocal.js).
 */

const TIPOS_CONOCIDOS = new Set([
  'string', 'varchar', 'char', 'character', 'text', 'int', 'integer', 'smallint', 'short', 'long', 'bigint',
  'serial', 'bigserial', 'double', 'float', 'real', 'decimal', 'numeric', 'bigdecimal', 'money', 'boolean', 'bool',
  'date', 'localdate', 'datetime', 'timestamp', 'localdatetime', 'time', 'localtime', 'uuid', 'byte', 'byte[]',
  'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometry', 'geography',
]);
// Palabras que en Java o SQL no sirven como nombre de tabla, columna o campo
const RESERVADAS = new Set([
  'class', 'public', 'private', 'protected', 'static', 'final', 'abstract', 'new', 'return', 'void', 'int', 'long',
  'double', 'float', 'boolean', 'char', 'package', 'import', 'interface', 'enum', 'extends', 'implements', 'this',
  'super', 'default', 'switch', 'case', 'break', 'continue', 'for', 'while', 'do', 'if', 'else', 'try', 'catch',
  'throw', 'throws', 'select', 'from', 'where', 'order', 'group', 'by', 'table', 'user', 'insert', 'update', 'delete',
  'join', 'limit', 'offset', 'having', 'index', 'key', 'primary', 'references', 'check', 'column', 'constraint',
]);
const TIPOS_ASOCIACION = new Set(['association', 'aggregation', 'composition']);
const TIPOS_HERENCIA = new Set(['generalization', 'inheritance']);
const ORDEN = { error: 0, aviso: 1, sugerencia: 2 };
const MAX_OBSERVACIONES = 25;

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
const clave = (s) => sinTildes(s).trim().toLowerCase();
const tieneTildes = (s) => sinTildes(s) !== String(s || '');
const tipoDe = (arista) => String(arista?.data?.type || 'Association').toLowerCase();

/** "- nombre: String {unico}" -> { nombre: 'nombre', tipo: 'String' } (también acepta objetos) */
export const leerAtributo = (a) => {
  if (a && typeof a === 'object') return { nombre: String(a.name || '').trim(), tipo: String(a.type || '').trim() };
  const sinRestricciones = String(a || '').replace(/\{[^}]*\}/g, '').replace(/^[+\-#~]\s*/, '');
  const sinValor = sinRestricciones.split('=')[0];
  const [nombre = '', tipo = ''] = sinValor.split(':').map((x) => x.trim());
  return { nombre, tipo };
};

const esClase = (n) => n?.type === 'classNode' && !n.data?.isNote && !n.data?.isConnectionPoint;
const esAuxiliar = (n) => ['interface', 'enumeration'].includes(n?.data?.stereotype);

/**
 * @returns {{ observaciones: Array<{clase, nodoId, gravedad, texto}>, clases: number, total: {error, aviso, sugerencia} }}
 */
export const revisarDiagrama = (nodes = [], edges = []) => {
  const clases = nodes.filter(esClase);
  const porId = new Map(clases.map((n) => [n.id, n]));
  const nombreDe = (n) => String(n?.data?.className || '').trim();
  const hallazgos = [];
  const anotar = (nodo, gravedad, problema, solucion) => hallazgos.push({
    clase: nombreDe(nodo) || '(sin nombre)',
    nodoId: nodo?.id || null,
    gravedad,
    texto: solucion ? `${problema} Cómo corregir: ${solucion}` : problema,
  });

  const relaciones = edges.filter((e) => !e.data?.isAssociationConnection && !e.data?.isNoteConnection);
  const nombresDeClase = new Set(clases.map((n) => clave(nombreDe(n))));

  // ---- Clases
  const porNombre = new Map();
  for (const n of clases) {
    const nombre = nombreDe(n);
    if (!nombre) { anotar(n, 'error', 'Hay una clase sin nombre.', 'ponle un nombre en singular, por ejemplo «Cliente».'); continue; }
    const k = clave(nombre);
    porNombre.set(k, [...(porNombre.get(k) || []), n]);
    if (/^[a-z]/.test(nombre)) anotar(n, 'sugerencia', `«${nombre}» empieza con minúscula.`, `en UML las clases van en PascalCase: «${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}».`);
    if (/\s/.test(nombre)) anotar(n, 'aviso', `«${nombre}» tiene espacios.`, `júntalo en PascalCase: «${nombre.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')}».`);
    if (tieneTildes(nombre)) anotar(n, 'sugerencia', `«${nombre}» tiene tildes o eñes.`, `el código se generará como «${sinTildes(nombre).replace(/[^A-Za-z0-9]/g, '')}»; si prefieres, escríbelo así en el diagrama.`);
    if (RESERVADAS.has(clave(nombre))) anotar(n, 'aviso', `«${nombre}» es una palabra reservada de Java o SQL.`, 'usa un nombre más específico (por ejemplo «Usuario» en vez de «User»).');

    const atributos = (n.data?.attributes || []).map(leerAtributo).filter((a) => a.nombre);
    if (!atributos.length && !esAuxiliar(n) && n.data?.stereotype !== 'abstract') {
      anotar(n, 'aviso', `«${nombre}» no tiene atributos.`, 'agrégale sus datos (por ejemplo «nombre: String»); si solo agrupa comportamiento, márcala como interfaz o abstracta.');
    }
    const vistos = new Map();
    for (const a of atributos) {
      const k2 = clave(a.nombre);
      if (vistos.has(k2)) { anotar(n, 'error', `«${nombre}» repite el atributo «${a.nombre}».`, 'deja uno solo o cámbiale el nombre al otro.'); continue; }
      vistos.set(k2, a);
      if (esAuxiliar(n)) continue;
      if (!a.tipo && k2 !== 'id') anotar(n, 'sugerencia', `El atributo «${a.nombre}» de «${nombre}» no tiene tipo.`, `indícalo («${a.nombre}: String»); sin tipo se genera como texto.`);
      if (a.tipo && !TIPOS_CONOCIDOS.has(clave(a.tipo).replace(/\s*\(.*\)$/, '')) && !nombresDeClase.has(clave(a.tipo))) {
        anotar(n, 'aviso', `El atributo «${a.nombre}» de «${nombre}» tiene un tipo desconocido: «${a.tipo}».`,
          'usa String, Integer, Long, Double, BigDecimal, Boolean, Date, DateTime o el nombre de una clase o enumeración del diagrama.');
      }
      if (/^[A-Z]/.test(a.nombre) && a.nombre !== a.nombre.toUpperCase()) anotar(n, 'sugerencia', `El atributo «${a.nombre}» de «${nombre}» empieza con mayúscula.`, `los atributos van en camelCase: «${a.nombre.charAt(0).toLowerCase()}${a.nombre.slice(1)}».`);
      if (RESERVADAS.has(k2)) anotar(n, 'aviso', `El atributo «${a.nombre}» de «${nombre}» es una palabra reservada de Java o SQL.`, 'cámbialo por uno más específico (por ejemplo «fechaOrden» en vez de «order»).');
    }
  }
  for (const [, repetidas] of porNombre) {
    if (repetidas.length > 1) {
      for (const n of repetidas) anotar(n, 'error', `Hay ${repetidas.length} clases llamadas «${nombreDe(n)}».`, 'renombra una o júntalas: no se pueden generar dos tablas con el mismo nombre.');
    }
  }

  // ---- Relaciones
  const padres = new Map();
  const pares = new Map();
  const conRelacion = new Set();
  for (const e of relaciones) {
    const a = porId.get(e.source);
    const b = porId.get(e.target);
    if (!a || !b) {
      const existente = a || b;
      if (existente) anotar(existente, 'error', `«${nombreDe(existente)}» tiene una relación con un extremo que no es una clase o que ya no existe.`, 'bórrala o vuelve a conectarla a una clase.');
      continue;
    }
    conRelacion.add(a.id); conRelacion.add(b.id);
    const tipo = tipoDe(e);
    const nombreRel = `«${nombreDe(a)} — ${nombreDe(b)}»`;
    if (TIPOS_HERENCIA.has(tipo)) {
      // La flecha de una generalización va del hijo (source) al padre (target)
      padres.set(a.id, [...(padres.get(a.id) || []), b.id]);
      continue;
    }
    if (!TIPOS_ASOCIACION.has(tipo)) continue;
    const inicio = String(e.data?.startLabel || '').trim();
    const fin = String(e.data?.endLabel || '').trim();
    if (!inicio || !fin) {
      anotar(a, 'aviso', `La relación ${nombreRel} no tiene cardinalidad en ${!inicio && !fin ? 'ningún extremo' : 'un extremo'}.`, 'indica 1, 0..1 o * en los dos extremos: de eso sale la clave foránea al generar el código.');
    }
    if (tipo === 'composition' && /\*|\.\.[2-9]|^[2-9]/.test(inicio)) {
      anotar(a, 'aviso', `En la composición ${nombreRel}, el todo («${nombreDe(a)}») tiene cardinalidad «${inicio}».`, 'en una composición cada parte pertenece a un solo todo: usa 1 (o 0..1) del lado del todo, o cámbiala por una asociación.');
    }
    const par = [a.id, b.id].sort().join('|') + '|' + tipo;
    const sinNombre = !e.data?.label && !e.data?.sourceRole && !e.data?.targetRole;
    if (sinNombre) {
      if (pares.has(par)) anotar(a, 'sugerencia', `Hay dos relaciones iguales ${nombreRel} sin nombre ni rol.`, 'si son distintas, ponles nombre o rol a cada una (por ejemplo «origen» y «destino»); si no, borra la repetida.');
      pares.set(par, e);
    }
  }

  // Herencia: ciclos, herencia múltiple y atributos repetidos del padre
  const atributosDe = (n) => new Set((n?.data?.attributes || []).map(leerAtributo).map((x) => clave(x.nombre)).filter((x) => x && x !== 'id'));
  for (const [hijo, listaPadres] of padres) {
    const n = porId.get(hijo);
    if (listaPadres.length > 1) anotar(n, 'aviso', `«${nombreDe(n)}» hereda de ${listaPadres.length} clases.`, 'Java no admite herencia múltiple de clases: deja un padre y convierte los demás en interfaces o asociaciones.');
    const visitados = new Set([hijo]);
    let actual = listaPadres[0];
    while (actual) {
      if (visitados.has(actual)) { anotar(n, 'error', `La herencia de «${nombreDe(n)}» forma un ciclo.`, 'revisa las flechas: una clase no puede terminar heredando de sí misma.'); break; }
      visitados.add(actual);
      actual = (padres.get(actual) || [])[0];
    }
    const delPadre = atributosDe(porId.get(listaPadres[0]));
    for (const a of atributosDe(n)) {
      if (delPadre.has(a)) anotar(n, 'aviso', `«${nombreDe(n)}» repite el atributo «${a}», que ya hereda de «${nombreDe(porId.get(listaPadres[0]))}».`, 'bórralo de la clase hija: lo recibe por herencia.');
    }
  }

  // Clases de asociación sin su relación y clases sueltas
  const idsRelaciones = new Set(relaciones.map((e) => e.id));
  for (const n of clases) {
    if (n.data?.isAssociationClass && n.data?.associatedEdgeId && !idsRelaciones.has(n.data.associatedEdgeId)) {
      anotar(n, 'error', `«${nombreDe(n)}» es una clase de asociación, pero su relación ya no existe.`, 'vuelve a unirla a una asociación o quítale la marca de clase de asociación.');
    }
    const esDeAsociacion = n.data?.isAssociationClass || relaciones.some((e) => e.data?.associationClassNodeId === n.id);
    if (clases.length > 1 && !conRelacion.has(n.id) && !esDeAsociacion && !esAuxiliar(n)) {
      anotar(n, 'sugerencia', `«${nombreDe(n)}» no está relacionada con ninguna clase.`, 'conéctala con la clase a la que pertenece; si de verdad es independiente, déjala así.');
    }
  }

  hallazgos.sort((x, y) => ORDEN[x.gravedad] - ORDEN[y.gravedad]);
  const total = { error: 0, aviso: 0, sugerencia: 0 };
  for (const h of hallazgos) total[h.gravedad] += 1;
  return { observaciones: hallazgos.slice(0, MAX_OBSERVACIONES), clases: clases.length, total, recortadas: Math.max(0, hallazgos.length - MAX_OBSERVACIONES) };
};

/** Diagrama en texto para un modelo de lenguaje: clases con atributos tipados y relaciones con cardinalidad. */
export const diagramaEnTexto = (nodes = [], edges = []) => {
  const clases = nodes.filter(esClase).slice(0, 40);
  if (!clases.length) return 'El diagrama está vacío.';
  const porId = new Map(clases.map((n) => [n.id, n.data?.className || '(sin nombre)']));
  const lineas = clases.map((n) => {
    const atributos = (n.data?.attributes || []).map(leerAtributo).filter((a) => a.nombre).map((a) => (a.tipo ? `${a.nombre}: ${a.tipo}` : a.nombre));
    const extra = n.data?.stereotype ? ` <<${n.data.stereotype}>>` : '';
    return `- ${porId.get(n.id)}${extra}: ${atributos.join(', ') || '(sin atributos)'}`;
  });
  const rels = edges
    .filter((e) => porId.has(e.source) && porId.has(e.target) && !e.data?.isAssociationConnection)
    .slice(0, 50)
    .map((e) => {
      const tipo = e.data?.type || 'Association';
      if (TIPOS_HERENCIA.has(tipo.toLowerCase())) return `- ${porId.get(e.source)} hereda de ${porId.get(e.target)}`;
      return `- ${tipo} ${porId.get(e.source)} [${e.data?.startLabel || '?'}] — [${e.data?.endLabel || '?'}] ${porId.get(e.target)}${e.data?.label ? ` "${e.data.label}"` : ''}`;
    });
  return `Clases:\n${lineas.join('\n')}${rels.length ? `\nRelaciones:\n${rels.join('\n')}` : '\nRelaciones: ninguna'}`;
};

export default revisarDiagrama;
