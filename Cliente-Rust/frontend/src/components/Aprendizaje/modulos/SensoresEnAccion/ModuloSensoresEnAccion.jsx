import ModuloViewer from '../../ModuloViewer.jsx';
import PasoComoLeer from './PasoComoLeer.jsx';
import PasoTacto from './PasoTacto.jsx';
import PasoUltrasonido from './PasoUltrasonido.jsx';
import PasoColor from './PasoColor.jsx';
import PasoProgramaReactivo from './PasoProgramaReactivo.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  'como-leer': PasoComoLeer,
  tacto: PasoTacto,
  ultrasonido: PasoUltrasonido,
  color: PasoColor,
  'programa-reactivo': PasoProgramaReactivo,
  quiz: PasoQuiz,
};

export default function ModuloSensoresEnAccion(props) {
  return <ModuloViewer moduloId="sensores-en-accion" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
