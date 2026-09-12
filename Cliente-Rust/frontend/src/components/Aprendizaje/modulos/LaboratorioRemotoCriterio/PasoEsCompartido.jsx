export default function PasoEsCompartido() {
  return (
    <div className="paso">
      <h2>Un robot físico, compartido</h2>
      <p>
        Todo lo anterior se probó contra un robot de verdad, en otro lugar físico, al que te conectás por red.
        Eso cambia algunas reglas respecto a programar en tu propia computadora:
      </p>

      <ul>
        <li>
          <strong>No hay "deshacer".</strong> Si el robot choca contra algo o se cae de una mesa, eso pasó de
          verdad — no es una ventana que podés cerrar.
        </li>
        <li>
          <strong>Puede que no seas el único usándolo.</strong> Si otra persona dejó un motor girando o un
          script corriendo, eso va a afectar lo que vos veas al conectarte.
        </li>
        <li>
          <strong>No lo ves en persona.</strong> No podés estirar la mano y sostenerlo si algo sale mal — la
          única herramienta que tenés es la que te da esta app.
        </li>
      </ul>

      <p>
        Nada de esto es motivo para tener miedo de probar cosas — es la razón por la que los próximos dos
        pasos (paro de emergencia y buenas prácticas) importan más acá que en un simulador.
      </p>
    </div>
  );
}
