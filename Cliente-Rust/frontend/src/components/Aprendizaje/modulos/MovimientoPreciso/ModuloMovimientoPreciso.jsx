import ModuloViewer from '../../ModuloViewer.jsx';
import PasoPotenciaADistancia from './PasoPotenciaADistancia.jsx';
import PasoFormulaGrados from './PasoFormulaGrados.jsx';
import PasoEncoders from './PasoEncoders.jsx';
import PasoGirarAngulo from './PasoGirarAngulo.jsx';
import PasoEditorTrayectorias from './PasoEditorTrayectorias.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  'potencia-a-distancia': PasoPotenciaADistancia,
  'formula-grados-cm': PasoFormulaGrados,
  encoders: PasoEncoders,
  'girar-angulo': PasoGirarAngulo,
  'editor-trayectorias': PasoEditorTrayectorias,
  quiz: PasoQuiz,
};

export default function ModuloMovimientoPreciso(props) {
  return <ModuloViewer moduloId="movimiento-preciso" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
