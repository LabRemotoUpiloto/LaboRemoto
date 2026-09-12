import ModuloViewer from '../../ModuloViewer.jsx';
import PasoBucleControl from './PasoBucleControl.jsx';
import PasoSeguirLinea from './PasoSeguirLinea.jsx';
import PasoEvitarObstaculos from './PasoEvitarObstaculos.jsx';
import PasoMaquinaEstados from './PasoMaquinaEstados.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  'bucle-control': PasoBucleControl,
  'seguir-linea': PasoSeguirLinea,
  'evitar-obstaculos': PasoEvitarObstaculos,
  'maquina-estados': PasoMaquinaEstados,
  quiz: PasoQuiz,
};

export default function ModuloComportamientosReactivos(props) {
  return <ModuloViewer moduloId="comportamientos-reactivos" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
