import ModuloViewer from '../../ModuloViewer.jsx';
import PasoElDesafio from './PasoElDesafio.jsx';
import PasoPlanDeTrabajo from './PasoPlanDeTrabajo.jsx';
import PasoChecklistFinal from './PasoChecklistFinal.jsx';

const COMPONENTE_POR_PASO = {
  'el-desafio': PasoElDesafio,
  'plan-de-trabajo': PasoPlanDeTrabajo,
  'checklist-final': PasoChecklistFinal,
};

export default function ModuloProyectoIntegrador(props) {
  return <ModuloViewer moduloId="proyecto-integrador" componentePorPaso={COMPONENTE_POR_PASO} {...props} />;
}
