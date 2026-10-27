// features/chat/esperaConTope.ts — espera una tarea del chat sin que la práctica dependa de ella.
//
// La práctica muestra el paso siguiente después de que el tutor explica el comando aprobado. Si esa explicación
// falla, se queda pensando o el estudiante la cancela, la práctica no puede quedarse esperando: lo que pase
// primero (que termine, que falle, que se cumpla el tope o que se llame a la función devuelta) libera, una sola vez.

/** Devuelve la función que libera antes de tiempo (por ejemplo, al cancelar la respuesta). */
export function esperarConTope(tarea: Promise<unknown>, topeMs: number, alLiberar: () => void): () => void {
  let liberada = false;
  const liberar = () => {
    if (liberada) return;
    liberada = true;
    clearTimeout(tope);
    alLiberar();
  };
  const tope = setTimeout(liberar, topeMs);
  tarea.then(liberar, liberar);
  return liberar;
}
