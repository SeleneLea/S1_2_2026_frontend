/**
 * Código Spring Boot → diagrama de clases (la otra mitad de la sincronización: el generador hace
 * diagrama → código).
 *
 * Se lee en el navegador, también sin conexión: un .zip del proyecto o archivos .java sueltos.
 * De cada clase @Entity / @MappedSuperclass salen sus atributos (con tipo), sus relaciones JPA
 * (@ManyToOne, @OneToMany, @ManyToMany, @OneToOne), su herencia y las clases de asociación que
 * arma el generador (dos claves obligatorias con un par único).
 *
 * Después se compara con el diagrama: las clases se emparejan por nombre (sin distinguir
 * mayúsculas ni tildes: "Dia" es "Día") y lo que es equivalente se conserva tal como está dibujado
 * ("id: int" = "id: Integer", "1..*" = "*", una composición = una asociación obligatoria), para
 * que el resultado traiga solo las diferencias reales.
 */

// ------------------------------------------------------------------ lectura de archivos

const CARPETAS_IGNORADAS = /(^|\/)(test|target|build|node_modules|\.git|\.mvn)\//i;

/** Los .java de un .zip y de archivos sueltos. */
export const leerArchivosJava = async (archivos) => {
  const salida = [];
  for (const f of Array.from(archivos || [])) {
    if (/\.zip$/i.test(f.name)) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(f);
      const entradas = Object.values(zip.files).filter((e) => !e.dir && /\.java$/i.test(e.name) && !CARPETAS_IGNORADAS.test(e.name));
      for (const e of entradas) salida.push({ ruta: e.name, contenido: await e.async('string') });
    } else if (/\.java$/i.test(f.name)) {
      salida.push({ ruta: f.webkitRelativePath || f.name, contenido: await f.text() });
    }
  }
  return salida;
};

// ------------------------------------------------------------------ lectura de Java

const sinComentarios = (src) => String(src || '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');

/** Posición del cierre de una cadena que empieza en i. */
const finCadena = (s, i) => {
  const comilla = s[i];
  let j = i + 1;
  while (j < s.length && s[j] !== comilla) j += s[j] === '\\' ? 2 : 1;
  return j;
};

/** Posición de la llave que cierra la que abre en i (respeta cadenas). */
const cierreDeLlave = (s, i) => {
  let nivel = 0;
  for (let j = i; j < s.length; j += 1) {
    const c = s[j];
    if (c === '"' || c === "'") { j = finCadena(s, j); continue; }
    if (c === '{') nivel += 1;
    else if (c === '}') { nivel -= 1; if (nivel === 0) return j; }
  }
  return s.length - 1;
};

/** Declaraciones del cuerpo de una clase (campos), sin métodos, bloques ni clases internas. */
const declaraciones = (cuerpo) => {
  const lista = [];
  let actual = '';
  let parentesis = 0;
  for (let i = 0; i < cuerpo.length; i += 1) {
    const c = cuerpo[i];
    if (c === '"' || c === "'") { const fin = finCadena(cuerpo, i); actual += cuerpo.slice(i, fin + 1); i = fin; continue; }
    if (c === '(') parentesis += 1;
    else if (c === ')') parentesis -= 1;
    if (c === '{' && parentesis === 0) { i = cierreDeLlave(cuerpo, i); actual = ''; continue; }
    if (c === ';' && parentesis === 0) { if (actual.trim()) lista.push(actual.trim()); actual = ''; continue; }
    actual += c;
  }
  return lista;
};

const ANOTACION = /@([\w.]+)\s*(\((?:[^()"]|"[^"]*"|\((?:[^()"]|"[^"]*")*\))*\))?/g;

/** Anotaciones de un texto: { Nombre: 'argumentos sin paréntesis' } y el texto sin ellas. */
const separarAnotaciones = (texto) => {
  const anotaciones = {};
  const resto = texto.replace(ANOTACION, (m, nombre, args) => {
    anotaciones[nombre.split('.').pop()] = args ? args.slice(1, -1) : '';
    return ' ';
  });
  return { anotaciones, resto };
};

/** Valor de un argumento de anotación: name = "x", nullable = false, mappedBy = "y". */
export const argumento = (args, clave) => {
  const m = String(args || '').match(new RegExp(`\\b${clave}\\s*=\\s*("([^"]*)"|[\\w.]+)`));
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[1];
};

const TIPO_DIAGRAMA = {
  string: 'String', char: 'String', character: 'String', int: 'Integer', integer: 'Integer', short: 'Integer', byte: 'Integer',
  long: 'Long', biginteger: 'Long', double: 'Double', float: 'Float', bigdecimal: 'BigDecimal', boolean: 'Boolean',
  localdate: 'Date', date: 'Date', localdatetime: 'DateTime', timestamp: 'DateTime', instant: 'DateTime',
  offsetdatetime: 'DateTime', zoneddatetime: 'DateTime', localtime: 'Time', time: 'Time', uuid: 'UUID',
};
/** Tipo Java -> tipo del diagrama (los que el generador vuelve a convertir en el mismo tipo Java). */
export const tipoDelDiagrama = (tipoJava) => {
  const simple = String(tipoJava || '').replace(/\s+/g, '').split('.').pop();
  if (/\[\]$/.test(simple)) return 'String';
  return TIPO_DIAGRAMA[simple.toLowerCase()] || simple;
};

/** Tipo del diagrama -> tipo Java, para saber si dos tipos escritos distinto son el mismo. */
const TIPO_JAVA = {
  string: 'String', varchar: 'String', char: 'String', character: 'String', text: 'String',
  int: 'Integer', integer: 'Integer', smallint: 'Integer', short: 'Integer',
  long: 'Long', bigint: 'Long', serial: 'Long', bigserial: 'Long',
  double: 'Double', 'double precision': 'Double', float: 'Float', real: 'Float',
  decimal: 'BigDecimal', numeric: 'BigDecimal', bigdecimal: 'BigDecimal', money: 'BigDecimal',
  boolean: 'Boolean', bool: 'Boolean', date: 'LocalDate', localdate: 'LocalDate',
  datetime: 'LocalDateTime', timestamp: 'LocalDateTime', localdatetime: 'LocalDateTime',
  time: 'LocalTime', localtime: 'LocalTime', uuid: 'UUID',
};
export const tipoJavaDe = (tipo, { esId = false } = {}) => {
  const t = String(tipo || '').trim().toLowerCase().replace(/\s*\(.*\)$/, '');
  if (!t) return esId ? 'Long' : 'String';
  return TIPO_JAVA[t] || String(tipo).trim();
};

const COLECCION = /^(List|Set|Collection|SortedSet|LinkedHashSet|HashSet|ArrayList)<\s*([\w.]+)\s*>$/;
const elementoDe = (tipo) => (String(tipo).replace(/\s+/g, '').match(COLECCION) || [])[2]?.split('.').pop() || null;
const snake = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Una clase del archivo Java, o null si no es una entidad. */
/** Anotaciones de la clase: lo que está entre el último import/package (si hay) y "class". */
const anotacionesAntesDe = (antes) => {
  const ultimo = Math.max(antes.lastIndexOf('import '), antes.lastIndexOf('package '));
  return separarAnotaciones(ultimo >= 0 ? antes.slice(antes.indexOf(';', ultimo) + 1) : antes).anotaciones;
};

/**
 * Rutas de la API: de cada @RestController, su @RequestMapping y la entidad que atiende (la más
 * nombrada en el archivo, como entidad, DTO, servicio o repositorio; el nombre del controlador suma).
 * @returns {Object<string, string>} entidad -> ruta ("/api/clientes")
 */
export const rutasDeControladores = (archivos, nombresDeEntidades) => {
  // Controladores REST con su ruta de clase
  const controladores = [];
  for (const a of archivos) {
    const src = sinComentarios(a.contenido);
    const decl = src.match(/class\s+(\w+)/);
    if (!decl) continue;
    const anotaciones = anotacionesAntesDe(src.slice(0, decl.index));
    if (!('RestController' in anotaciones) && !('Controller' in anotaciones)) continue;
    const args = anotaciones.RequestMapping;
    if (args === undefined) continue;
    const ruta = argumento(args, 'value') || argumento(args, 'path') || (String(args).match(/"([^"]+)"/) || [])[1];
    if (ruta) controladores.push({ nombre: decl[1], src, ruta: ruta.startsWith('/') ? ruta : `/${ruta}` });
  }
  const rutas = {};
  const usados = new Set();
  // 1) El de nombre exacto: ClienteController atiende a Cliente (los de infraestructura se llaman distinto)
  for (const entidad of nombresDeEntidades) {
    const c = controladores.find((x) => x.nombre === `${entidad}Controller`);
    if (c) { rutas[entidad] = c.ruta; usados.add(c); }
  }
  // 2) Para las demás, el controlador que más la nombra (como entidad, DTO, servicio o repositorio)
  for (const entidad of nombresDeEntidades.filter((e) => !rutas[e])) {
    let mejor = null;
    let puntos = 0;
    for (const c of controladores.filter((x) => !usados.has(x))) {
      const menciones = (c.src.match(new RegExp(`\\b${entidad}(?:DTO|Dto|Service|Repository)\\b`, 'g')) || []).length;
      if (menciones > puntos) { mejor = c; puntos = menciones; }
    }
    if (mejor) { rutas[entidad] = mejor.ruta; usados.add(mejor); }
  }
  return rutas;
};

/** Ruta del controlador -> rutaApi de la app (relativa a ".../api"). */
export const rutaApiDe = (ruta) => String(ruta || '').replace(/^\/+/, '').replace(/^api\//, '').replace(/\/+$/, '');

const leerClase = (contenido, ruta) => {
  // El generador agrega la cuenta de acceso: no es una clase del diagrama
  if (/Cuenta para entrar al sistema/.test(contenido)) return null;
  const src = sinComentarios(contenido);
  const decl = src.match(/(?:^|[\s;}])((?:public|protected|private|abstract|final|\s)*)class\s+(\w+)(?:\s*<[^>{]*>)?(?:\s+extends\s+([\w.]+)(?:\s*<[^>{]*>)?)?(?:\s+implements\s+[^{]+)?\s*\{/);
  if (!decl) return null;
  const antes = src.slice(0, decl.index + decl[0].indexOf('class'));
  const deClase = anotacionesAntesDe(antes);
  const esEntidad = 'Entity' in deClase;
  const esMapeada = 'MappedSuperclass' in deClase;
  if (!esEntidad && !esMapeada) return null;
  const inicio = decl.index + decl[0].length - 1;
  const cuerpo = src.slice(inicio + 1, cierreDeLlave(src, inicio));
  const clase = {
    nombre: decl[2],
    archivo: ruta,
    abstracta: /\babstract\b/.test(decl[1] || '') || esMapeada,
    padre: decl[3] ? decl[3].split('.').pop() : null,
    tabla: argumento(deClase.Table, 'name'),
    // Pares únicos de @Table(uniqueConstraints = @UniqueConstraint(columnNames = {"a_id", "b_id"}))
    unicos: [...String(deClase.Table || '').matchAll(/columnNames\s*=\s*\{([^}]*)\}/g)]
      .map((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])).filter((cols) => cols.length === 2),
    atributos: [],
    referencias: [],
  };
  for (const d of declaraciones(cuerpo)) {
    const { anotaciones, resto } = separarAnotaciones(d);
    const limpio = resto.split('=')[0].replace(/\s+/g, ' ').trim();
    if (/\bstatic\b/.test(limpio) || 'Transient' in anotaciones) continue;
    const m = limpio.replace(/\b(private|protected|public|final|transient|volatile)\b/g, '').trim().match(/^([\w.]+(?:\s*<.*>)?(?:\s*\[\])?)\s+(\w+)$/);
    if (!m) continue;
    const tipo = m[1].replace(/\s+/g, '');
    const nombre = m[2];
    const relacion = ['ManyToOne', 'OneToOne', 'OneToMany', 'ManyToMany'].find((r) => r in anotaciones);
    if (relacion) {
      const destino = relacion === 'OneToMany' || relacion === 'ManyToMany' ? elementoDe(tipo) : tipo.split('.').pop();
      if (!destino) continue;
      const args = anotaciones[relacion];
      clase.referencias.push({
        campo: nombre,
        tipo: relacion,
        destino,
        mappedBy: argumento(args, 'mappedBy'),
        obligatoria: argumento(args, 'optional') === 'false' || argumento(anotaciones.JoinColumn, 'nullable') === 'false',
        unica: argumento(anotaciones.JoinColumn, 'unique') === 'true',
        columna: argumento(anotaciones.JoinColumn, 'name') || `${snake(nombre)}_id`,
      });
      continue;
    }
    if (elementoDe(tipo) || /^Map</.test(tipo) || 'ElementCollection' in anotaciones || 'Embedded' in anotaciones) continue;
    clase.atributos.push({
      nombre,
      tipo: tipoDelDiagrama(tipo),
      esId: 'Id' in anotaciones,
      autoId: 'Id' in anotaciones && 'GeneratedValue' in anotaciones,
      unico: argumento(anotaciones.Column, 'unique') === 'true',
      opcional: !('Id' in anotaciones) && argumento(anotaciones.Column, 'nullable') !== 'false'
        && !('NotNull' in anotaciones) && !('NotBlank' in anotaciones),
    });
  }
  return clase;
};

/**
 * El modelo del código: clases (por nombre) y relaciones entre ellas.
 * @returns {{ clases: object[], relaciones: object[], avisos: string[], archivos: number }}
 */
export const modeloDesdeJava = (archivos = []) => {
  const clases = archivos.map((a) => leerClase(a.contenido, a.ruta)).filter(Boolean);
  const porNombre = new Map(clases.map((c) => [c.nombre, c]));
  const avisos = [];
  const relaciones = [];

  // Clase de asociación del generador: un par único sobre sus dos claves obligatorias
  const deAsociacion = new Map();
  for (const c of clases) {
    const muchosAUno = c.referencias.filter((r) => r.tipo === 'ManyToOne' && porNombre.has(r.destino));
    const par = c.unicos.find((cols) => muchosAUno.filter((r) => cols.includes(r.columna)).length === 2);
    if (par && muchosAUno.length === 2) deAsociacion.set(c.nombre, muchosAUno);
  }

  for (const c of clases) {
    if (c.padre && porNombre.has(c.padre)) relaciones.push({ tipo: 'Generalization', origen: c.nombre, destino: c.padre });
    if (deAsociacion.has(c.nombre)) {
      const [a, b] = deAsociacion.get(c.nombre);
      relaciones.push({ tipo: 'Association', origen: a.destino, destino: b.destino, inicio: '*', fin: '*', claseAsociacion: c.nombre });
      continue;
    }
    for (const r of c.referencias) {
      if (!porNombre.has(r.destino)) { avisos.push(`${c.nombre}.${r.campo} apunta a ${r.destino}, que no es una entidad del proyecto: no se dibuja.`); continue; }
      if (r.mappedBy) continue; // el otro lado de una relación ya contada
      // Un @ManyToOne sin unique también es como el generador escribe un 1 a 1: ese extremo es "flexible"
      if (r.tipo === 'ManyToOne') relaciones.push({ tipo: 'Association', origen: r.destino, destino: c.nombre, inicio: r.obligatoria ? '1' : '0..1', fin: r.unica ? '1' : '*', finFlexible: !r.unica, obligatoria: r.obligatoria, rol: r.campo });
      else if (r.tipo === 'OneToOne') relaciones.push({ tipo: 'Association', origen: r.destino, destino: c.nombre, inicio: '1', fin: '1', rol: r.campo });
      else if (r.tipo === 'OneToMany') relaciones.push({ tipo: 'Association', origen: c.nombre, destino: r.destino, inicio: '1', fin: '*', rol: r.campo });
      else if (r.tipo === 'ManyToMany') relaciones.push({ tipo: 'Association', origen: c.nombre, destino: r.destino, inicio: '*', fin: '*', rol: r.campo });
    }
  }
  if (!clases.length) avisos.push('No se encontraron clases @Entity en los archivos.');
  // Rutas reales de la API (para generar el front de este backend con sus endpoints)
  const rutas = rutasDeControladores(archivos, clases.map((c) => c.nombre));
  const fueraDeApi = Object.entries(rutas).filter(([, r]) => !/^\/api(\/|$)/.test(r)).map(([e, r]) => `${e} (${r})`);
  if (fueraDeApi.length) avisos.push(`Rutas que no empiezan con /api: ${fueraDeApi.join(', ')}. En la app Flutter, quita "/api" de la URL en lib/config/api_config.dart.`);
  return { clases, relaciones, rutas, avisos, archivos: archivos.length };
};

// ------------------------------------------------------------------ comparación con el diagrama

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
const clave = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const leerAtributo = (a) => {
  if (a && typeof a === 'object') return { nombre: String(a.name || '').trim(), tipo: String(a.type || '').trim() };
  const sinValor = String(a || '').replace(/\{[^}]*\}/g, '').replace(/^[+\-#~]\s*/, '').split('=')[0];
  const [nombre = '', tipo = ''] = sinValor.split(':').map((x) => x.trim());
  return { nombre, tipo };
};
const textoAtributo = (a) => {
  const reglas = [a.unico ? 'unico' : null, a.opcional ? 'opcional' : null].filter(Boolean);
  return `${a.nombre}: ${a.tipo}${reglas.length ? ` {${reglas.join(', ')}}` : ''}`;
};
const esMuchos = (m) => /\*|^\s*n\s*$|\.\.\s*(n|[2-9]|\d{2,})/i.test(String(m || ''));
const esHerencia = (tipo) => ['generalization', 'inheritance', 'implementation', 'realization'].includes(String(tipo || '').toLowerCase());
// "Permisos" es la política de acceso del tablero (generators/Permisos.js), no una entidad
const esClaseNodo = (n) => n?.type === 'classNode' && !n.data?.isNote && !n.data?.isConnectionPoint && clave(n.data?.className) !== 'permisos';
const ES_MULTIPLICIDAD = /^\s*(\d+|\*|n)(\s*\.\.\s*(\d+|\*|n))?\s*$/i;

/** Atributos de una clase que ya está en el diagrama, con lo que dice el código. */
const atributosFusionados = (actuales, delCodigo) => {
  const leidos = (actuales || []).map((texto) => ({ texto, ...leerAtributo(texto) }));
  const porNombre = new Map(delCodigo.map((a) => [clave(a.nombre), a]));
  const salida = [];
  for (const a of leidos) {
    const k = clave(a.nombre);
    const codigo = porNombre.get(k);
    if (codigo) {
      // Mismo tipo Java aunque esté escrito distinto ("int" e "Integer"): se deja como está dibujado
      const igual = tipoJavaDe(a.tipo, { esId: k === 'id' }) === tipoJavaDe(codigo.tipo, { esId: k === 'id' });
      salida.push(igual ? a.texto : textoAtributo(codigo));
      porNombre.delete(k);
    } else if (k === 'id') {
      salida.push(a.texto); // la clave se conserva (en una herencia, el hijo no la declara)
    }
    // Lo que el código ya no tiene, se quita
  }
  for (const [k, a] of porNombre) {
    // El generador agrega "id" Long cuando el diagrama no lo trae: no es una diferencia
    if (k === 'id' && a.autoId && a.tipo === 'Long') continue;
    salida.push(textoAtributo(a));
  }
  return salida;
};

const mismaLista = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Diferencias entre el código y el diagrama, listas para proponer (o aplicar sin conexión).
 * @param {{nodes, edges}} actual  el diagrama de ahora
 * @param {{quitarAusentes?: boolean}} opciones  quitar las clases y relaciones que ya no están en el código
 * @returns {{ nodos, aristas, quitarNodos, quitarAristas, estado, resumen: string[], cantidad: number }}
 */
export const compararConDiagrama = (actual, modelo, { quitarAusentes = false } = {}) => {
  const nodes = actual?.nodes || [];
  const edges = actual?.edges || [];
  const clases = nodes.filter(esClaseNodo);
  const nodoPorClave = new Map(clases.map((n) => [clave(n.data?.className), n]));
  const nodos = [];
  const resumen = [];
  const idDe = new Map(); // nombre del código -> id del nodo
  const usados = new Set(nodes.map((n) => n.id));
  const idNuevo = (base) => { let id = base; for (let i = 2; usados.has(id); i += 1) id = `${base}-${i}`; usados.add(id); return id; };

  const xLibre = clases.length ? Math.max(...clases.map((n) => n.position?.x || 0)) + 450 : 0;
  let fila = 0;
  for (const c of modelo.clases) {
    const existente = nodoPorClave.get(clave(c.nombre));
    if (existente) {
      idDe.set(c.nombre, existente.id);
      const atributos = atributosFusionados(existente.data?.attributes, c.atributos);
      const estereotipo = c.abstracta && !existente.data?.stereotype ? 'abstract' : existente.data?.stereotype;
      if (!mismaLista(atributos, existente.data?.attributes || []) || estereotipo !== existente.data?.stereotype) {
        nodos.push({ ...existente, data: { ...existente.data, attributes: atributos, ...(estereotipo ? { stereotype: estereotipo } : {}) } });
        resumen.push(`actualizar ${existente.data.className}`);
      }
    } else {
      const id = idNuevo(`codigo-${clave(c.nombre).replace(/[^a-z0-9]+/g, '-')}`);
      idDe.set(c.nombre, id);
      nodos.push({
        id, type: 'classNode', position: { x: xLibre, y: fila * 280 },
        data: {
          className: c.nombre, attributes: c.atributos.map(textoAtributo), methods: [],
          ...(c.abstracta ? { stereotype: 'abstract' } : {}),
          ...(modelo.rutas?.[c.nombre] ? { rutaApi: rutaApiDe(modelo.rutas[c.nombre]) } : {}),
        },
      });
      fila += 1;
      resumen.push(`agregar la clase ${c.nombre}`);
    }
  }

  // Relaciones
  const relacionesActuales = edges.filter((e) => !e.data?.isAssociationConnection && !e.data?.isNoteConnection);
  const aristas = [];
  const emparejadas = new Set();
  const nodoFinal = new Map([...clases.map((n) => [n.id, n]), ...nodos.map((n) => [n.id, n])]);
  const nombre = (id) => nodoFinal.get(id)?.data?.className || id;
  for (const r of modelo.relaciones) {
    const origen = idDe.get(r.origen);
    const destino = idDe.get(r.destino);
    if (!origen || !destino) continue;
    const herencia = esHerencia(r.tipo);
    const existente = relacionesActuales.find((e) => !emparejadas.has(e.id)
      && ((e.source === origen && e.target === destino) || (!herencia && e.source === destino && e.target === origen))
      && esHerencia(e.data?.type) === herencia);
    if (existente) {
      emparejadas.add(existente.id);
      if (herencia) continue;
      const mismoSentido = existente.source === origen;
      const [inicio, fin] = mismoSentido ? [r.inicio, r.fin] : [r.fin, r.inicio];
      const [flexInicio, flexFin] = mismoSentido ? [false, r.finFlexible] : [r.finFlexible, false];
      const ini = existente.data?.startLabel || '';
      const fn = existente.data?.endLabel || '';
      // Un extremo coincide si dice lo mismo (uno o muchos); un "muchos" flexible acepta un "uno" dibujado
      const coincide = (dibujado, delCodigo, flexible) => Boolean(dibujado)
        && (esMuchos(dibujado) === esMuchos(delCodigo) || (flexible && !esMuchos(dibujado)));
      // Se comparan solo cardinalidades: una dependencia o un texto ("aprueba") se dejan como están, y
      // una clase de asociación no dice en el código si era 1 a muchos o muchos a muchos
      const comparable = !['dependency'].includes(String(existente.data?.type || '').toLowerCase())
        && (!ini || ES_MULTIPLICIDAD.test(ini)) && (!fn || ES_MULTIPLICIDAD.test(fn))
        && !(r.claseAsociacion && existente.data?.hasAssociationClass);
      const igual = !comparable || (coincide(ini, inicio, flexInicio) && coincide(fn, fin, flexFin));
      if (!igual) {
        aristas.push({ ...existente, data: { ...existente.data, startLabel: inicio, endLabel: fin } });
        resumen.push(`cambiar la multiplicidad de ${nombre(existente.source)} — ${nombre(existente.target)}`);
      }
      continue;
    }
    const id = idNuevo(`codigo-rel-${origen}-${destino}`);
    const arista = {
      id, source: origen, target: destino, type: 'umlEdge',
      data: herencia ? { type: 'Generalization', startLabel: '', endLabel: '' } : { type: 'Association', startLabel: r.inicio, endLabel: r.fin },
    };
    if (r.claseAsociacion && idDe.get(r.claseAsociacion)) {
      const claseId = idDe.get(r.claseAsociacion);
      arista.data = { ...arista.data, hasAssociationClass: true, associationClassNodeId: claseId };
      const i = nodos.findIndex((n) => n.id === claseId);
      if (i >= 0) nodos[i] = { ...nodos[i], data: { ...nodos[i].data, isAssociationClass: true, associatedEdgeId: id } };
      aristas.push(arista, {
        id: `assoc-edge-${id}`, source: claseId, target: destino, type: 'umlEdge',
        data: { type: 'AssociationClassConnection', isAssociationConnection: true, parentRelationId: id, label: '' },
      });
      resumen.push(`agregar la relación ${nombre(origen)} — ${nombre(destino)} con la clase de asociación ${nombre(claseId)}`);
      continue;
    }
    aristas.push(arista);
    resumen.push(herencia ? `agregar la herencia ${nombre(origen)} → ${nombre(destino)}` : `agregar la relación ${nombre(origen)} — ${nombre(destino)}`);
  }

  // Lo que ya no está en el código (solo si se pide): clases ausentes y relaciones entre clases del código
  const quitarNodos = [];
  const quitarAristas = [];
  if (quitarAusentes) {
    const delCodigo = new Set(idDe.values());
    for (const n of clases) {
      if (!delCodigo.has(n.id)) { quitarNodos.push(n.id); resumen.push(`quitar la clase ${n.data.className}`); }
    }
    for (const e of relacionesActuales) {
      if (emparejadas.has(e.id) || quitarNodos.includes(e.source) || quitarNodos.includes(e.target)) continue;
      if (delCodigo.has(e.source) && delCodigo.has(e.target) && !e.data?.isAssociationConnection) {
        quitarAristas.push(e.id);
        resumen.push(`quitar la relación ${nombre(e.source)} — ${nombre(e.target)}`);
      }
    }
  }

  // El diagrama resultante (para aplicarlo sin conexión)
  const fuera = new Set(quitarNodos);
  const reemplazoNodo = new Map(nodos.map((n) => [n.id, n]));
  const reemplazoArista = new Map(aristas.map((e) => [e.id, e]));
  const estadoNodes = [
    ...nodes.filter((n) => !fuera.has(n.id)).map((n) => reemplazoNodo.get(n.id) || n),
    ...nodos.filter((n) => !nodes.some((x) => x.id === n.id)),
  ];
  const fueraAristas = new Set(quitarAristas);
  const estadoEdges = [
    ...edges.filter((e) => !fueraAristas.has(e.id) && !fuera.has(e.source) && !fuera.has(e.target)).map((e) => reemplazoArista.get(e.id) || e),
    ...aristas.filter((e) => !edges.some((x) => x.id === e.id)),
  ];
  return {
    nodos, aristas, quitarNodos, quitarAristas,
    estado: { nodes: estadoNodes, edges: estadoEdges },
    resumen,
    cantidad: resumen.length,
  };
};

/** Un diagrama nuevo solo con el código (para crear un tablero desde un backend). */
export const diagramaDesdeModelo = (modelo) => {
  const { estado } = compararConDiagrama({ nodes: [], edges: [] }, modelo);
  // En cuadrícula, para que no quede todo en una columna
  const columnas = Math.max(1, Math.ceil(Math.sqrt(estado.nodes.length)));
  estado.nodes.forEach((n, i) => { n.position = { x: (i % columnas) * 450, y: Math.floor(i / columnas) * 320 }; });
  return estado;
};

export default modeloDesdeJava;
