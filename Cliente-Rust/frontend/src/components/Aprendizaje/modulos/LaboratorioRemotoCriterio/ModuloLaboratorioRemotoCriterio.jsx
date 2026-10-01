import ModuloViewer from '../../ModuloViewer.jsx';
import PasoEsCompartido from './PasoEsCompartido.jsx';
import PasoParoDeEmergencia from './PasoParoDeEmergencia.jsx';
import PasoBuenasPracticas from './PasoBuenasPracticas.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  'es-compartido': PasoEsCompartido,
  'paro-de-emergencia': PasoParoDeEmergencia,
  'buenas-practicas': PasoBuenasPracticas,
  quiz: PasoQuiz,
};

export default function ModuloLaboratorioRemotoCriterio(props) {
  return <ModuloViewer moduloId="laboratorio-remoto-criterio" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
