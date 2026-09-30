#!/bin/bash
# Ajusta sshd de la Pi para ~35 alumnos entrando a la vez. Correr EN la Pi (con sudo).
#  - MaxStartups 40:30:120: por defecto (10:30:100) sshd empieza a rechazar al azar cuando hay mas de
#    10 conexiones en pleno login; con 35 alumnos entrando juntos (login contra el directorio de la
#    universidad, que tarda) varios recibirian "conexion rechazada".
#  - nofile 8192 para svc-practicas: el limite por defecto (1024) fue el que tumbo el tunel cuando la
#    app filtraba canales; con el arreglo de la app no deberia hacer falta, queda como margen.
# `reload` no corta las sesiones abiertas. Si sshd -t falla, se restaura el respaldo y no se recarga.
set -e
T=$(date +%s)
sudo cp -p /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$T

if grep -q '^MaxStartups' /etc/ssh/sshd_config; then
  sudo sed -i 's/^MaxStartups.*/MaxStartups 40:30:120/' /etc/ssh/sshd_config
else
  sudo sed -i 's/^#MaxStartups.*/MaxStartups 40:30:120/' /etc/ssh/sshd_config
fi
grep -q '^MaxStartups 40:30:120' /etc/ssh/sshd_config || echo 'MaxStartups 40:30:120' | sudo tee -a /etc/ssh/sshd_config >/dev/null

printf 'svc-practicas soft nofile 8192\nsvc-practicas hard nofile 8192\n' | sudo tee /etc/security/limits.d/svc-practicas.conf >/dev/null

if sudo sshd -t; then
  sudo systemctl reload ssh
  echo "OK: sshd recargado. Respaldo: /etc/ssh/sshd_config.bak.$T"
  grep -n '^MaxStartups' /etc/ssh/sshd_config
else
  sudo cp -p /etc/ssh/sshd_config.bak.$T /etc/ssh/sshd_config
  echo "ERROR: sshd -t fallo; se restauro el respaldo y NO se recargo."
  exit 1
fi
