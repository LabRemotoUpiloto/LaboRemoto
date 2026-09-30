import ModuloViewer from '../../ModuloViewer.jsx';
import PasoLeerErrores from './PasoLeerErrores.jsx';
import PasoPrintComoHerramienta from './PasoPrintComoHerramienta.jsx';
import PasoConexionVsCodigo from './PasoConexionVsCodigo.jsx';
import PasoChecklistDiagnostico from './PasoChecklistDiagnostico.jsx';
import PasoQuiz from './PasoQuiz.jsx';

const COMPONENTE_POR_PASO = {
  'leer-errores': PasoLeerErrores,
  'print-como-herramienta': PasoPrintComoHerramienta,
  'conexion-vs-codigo': PasoConexionVsCodigo,
  'checklist-diagnostico': PasoChecklistDiagnostico,
  quiz: PasoQuiz,
};

export default function ModuloDepuracionDiagnostico(props) {
  return <ModuloViewer moduloId="depuracion-diagnostico" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
