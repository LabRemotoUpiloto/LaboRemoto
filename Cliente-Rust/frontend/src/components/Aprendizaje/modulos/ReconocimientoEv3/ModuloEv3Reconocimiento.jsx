import ModuloViewer from '../../ModuloViewer.jsx';
import PasoIntro from './PasoIntro.jsx';
import PasoSensoresActuadores from './PasoSensoresActuadores.jsx';
import PasoPuertos from './PasoPuertos.jsx';
import PasoMovimientos from './PasoMovimientos.jsx';
import PasoCargarArchivos from './PasoCargarArchivos.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  intro: PasoIntro,
  'sensores-actuadores': PasoSensoresActuadores,
  puertos: PasoPuertos,
  movimientos: PasoMovimientos,
  'cargar-archivos': PasoCargarArchivos,
  quiz: PasoQuiz,
};

export default function ModuloEv3Reconocimiento(props) {
  return <ModuloViewer moduloId="reconocimiento-ev3" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
