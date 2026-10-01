#!/bin/bash
# Activa el streaming por trozos (Range) en el servicio de practicas. Correr EN la Pi; copiar antes
# parche_range.py a /tmp. Respalda handlers.py, parcha, compila y reinicia el servicio.
set -e
cd /opt/practicas-linux-api
T=$(date +%s)
cp -p handlers.py handlers.py.bak.$T
python3 /tmp/parche_range.py
python3 -m py_compile handlers.py && echo COMPILA_OK
sudo -n systemctl restart practicas-linux-api
sleep 3
systemctl is-active practicas-linux-api
echo "respaldo: handlers.py.bak.$T"
