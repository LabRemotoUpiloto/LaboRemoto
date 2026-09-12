import ModuloViewer from '../../ModuloViewer.jsx';
import PasoBucles from './PasoBucles.jsx';
import PasoFunciones from './PasoFunciones.jsx';
import PasoMaquinaDeEstados from './PasoMaquinaDeEstados.jsx';
import PasoManejoDeErrores from './PasoManejoDeErrores.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  bucles: PasoBucles,
  funciones: PasoFunciones,
  'maquina-de-estados': PasoMaquinaDeEstados,
  'manejo-de-errores': PasoManejoDeErrores,
  quiz: PasoQuiz,
};

export default function ModuloPythonParaRobots(props) {
  return <ModuloViewer moduloId="python-para-robots" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
