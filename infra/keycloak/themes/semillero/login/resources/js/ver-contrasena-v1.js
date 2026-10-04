// Botón de ojo para mostrar/ocultar la contraseña en todas las pantallas de Keycloak 16
// (login, cambiar contraseña, registro). Keycloak 16 no lo trae. Sin dependencias.
(function () {
  'use strict';

  var ICON_SHOW = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_HIDE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

  function enhance(input) {
    if (input.getAttribute('data-ver-contrasena')) return;
    input.setAttribute('data-ver-contrasena', '1');

    var hadFocus = document.activeElement === input;
    var wrap = document.createElement('div');
    wrap.className = 'ver-contrasena';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ver-contrasena__btn';
    btn.setAttribute('aria-label', 'Mostrar contraseña');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = ICON_SHOW;
    wrap.appendChild(btn);

    function setVisible(visible) {
      input.type = visible ? 'text' : 'password';
      btn.innerHTML = visible ? ICON_HIDE : ICON_SHOW;
      btn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }

    btn.addEventListener('click', function () {
      setVisible(input.type === 'password');
      input.focus();
    });

    // Al enviar siempre vuelve a «password»: el gestor de contraseñas del navegador
    // no debe guardar el campo como texto.
    if (input.form) {
      input.form.addEventListener('submit', function () { setVisible(false); });
    }

    // Mover el nodo le quita el foco (p. ej. con autofocus): se lo devolvemos.
    if (hadFocus) input.focus();
  }

  function init() {
    var inputs = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i++) enhance(inputs[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
