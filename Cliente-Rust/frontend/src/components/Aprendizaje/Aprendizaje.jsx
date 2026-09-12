import { useState } from 'react';
import AprendizajeHome from './AprendizajeHome.jsx';
import ModuloEv3Reconocimiento from './modulos/ReconocimientoEv3/ModuloEv3Reconocimiento.jsx';
import ModuloSensoresEnAccion from './modulos/SensoresEnAccion/ModuloSensoresEnAccion.jsx';
import ModuloMovimientoPreciso from './modulos/MovimientoPreciso/ModuloMovimientoPreciso.jsx';
import ModuloComportamientosReactivos from './modulos/ComportamientosReactivos/ModuloComportamientosReactivos.jsx';
import ModuloPythonParaRobots from './modulos/PythonParaRobots/ModuloPythonParaRobots.jsx';
import ModuloDepuracionDiagnostico from './modulos/DepuracionDiagnostico/ModuloDepuracionDiagnostico.jsx';
import ModuloLaboratorioRemotoCriterio from './modulos/LaboratorioRemotoCriterio/ModuloLaboratorioRemotoCriterio.jsx';
import ModuloProyectoIntegrador from './modulos/ProyectoIntegrador/ModuloProyectoIntegrador.jsx';

// Mapa id de módulo -> componente que lo renderiza. Agregar un módulo nuevo
// implica sumar su entrada acá (y en lib/aprendizaje/modulos.js).
const VISORES_POR_MODULO = {
  'reconocimiento-ev3': ModuloEv3Reconocimiento,
  'sensores-en-accion': ModuloSensoresEnAccion,
  'movimiento-preciso': ModuloMovimientoPreciso,
  'comportamientos-reactivos': ModuloComportamientosReactivos,
  'python-para-robots': ModuloPythonParaRobots,
  'depuracion-diagnostico': ModuloDepuracionDiagnostico,
  'laboratorio-remoto-criterio': ModuloLaboratorioRemotoCriterio,
  'proyecto-integrador': ModuloProyectoIntegrador,
};

/**
 * Punto de entrada de la sección "Aprendizaje": arranca en la grilla de
 * módulos y abre el visor correspondiente al elegir uno. Es deliberadamente
 * un componente chico — la lógica de cada módulo vive en su propia carpeta.
 */
export default function Aprendizaje({ onIrATerminal, onIrATrayectoria, status }) {
  const [moduloAbierto, setModuloAbierto] = useState(null);

  if (moduloAbierto) {
    const Visor = VISORES_POR_MODULO[moduloAbierto];
    return (
      <Visor
        onVolver={() => setModuloAbierto(null)}
        onIrATerminal={onIrATerminal}
        onIrATrayectoria={onIrATrayectoria}
        status={status}
      />
    );
  }

  return <AprendizajeHome onAbrirModulo={setModuloAbierto} />;
}
