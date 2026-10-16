"""Pruebas del agente de conexiones. Ejecutar: python -m unittest infra/agente-conexiones/test_agente_conexiones.py"""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import agente_conexiones as ag  # noqa: E402

ENTRADA = 'Oct  4 11:46:11 raspberrypi sshd[22029]: Accepted password for UPILOTO\\\\ana-perez from 203.0.113.7 port 50123 ssh2'
SALIDA = 'Oct  4 11:51:24 raspberrypi sshd[22029]: pam_unix(sshd:session): session closed for user UPILOTO\\\\ana-perez'


class Parseo(unittest.TestCase):
    def test_entrada_con_contrasena_y_usuario_del_ldap(self):
        self.assertEqual(ag.parsear_linea(ENTRADA), {'tipo': 'entrada', 'sesion': '22029', 'usuario': 'UPILOTO\\\\ana-perez', 'ip': '203.0.113.7'})

    def test_variantes_de_autenticacion_con_contrasena(self):
        for metodo in ['password', 'keyboard-interactive', 'keyboard-interactive/pam']:
            ev = ag.parsear_linea('Oct  4 11:46:11 h sshd[1]: Accepted %s for ana from 10.0.0.5 port 22 ssh2' % metodo)
            self.assertEqual(ev['tipo'], 'entrada', metodo)

    def test_entradas_con_llave_y_otros_eventos_se_ignoran(self):
        for l in ['Oct  4 11:46:11 h sshd[1]: Accepted publickey for pi from 10.0.0.5 port 22 ssh2: ED25519 SHA256:xx',
                  'Oct  4 11:46:11 h sshd[1]: Failed password for root from 1.2.3.4 port 22 ssh2',
                  'Oct  4 11:46:11 h sudo: pam_unix(sudo:session): session closed for user root',
                  'Oct  4 11:46:11 h CRON[9]: pam_unix(cron:session): session closed for user pi', '']:
            self.assertIsNone(ag.parsear_linea(l), l)

    def test_salida_solo_de_sesiones_ssh(self):
        self.assertEqual(ag.parsear_linea(SALIDA), {'tipo': 'salida', 'sesion': '22029', 'usuario': 'UPILOTO\\\\ana-perez'})


class Seguimiento(unittest.TestCase):
    def preparar(self, contenido=''):
        """Carpeta temporal + archivo de log + seguidor. Los cierres se registran en orden para que el seguidor se cierre ANTES
        de borrar la carpeta (en Windows no se puede borrar un archivo abierto)."""
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        ruta = os.path.join(d, 'auth.log')
        with open(ruta, 'w') as f:
            f.write(contenido)
        s = ag.SeguirArchivo(ruta)
        self.addCleanup(s.cerrar)
        return ruta, s

    def test_no_lee_lo_anterior_solo_lo_nuevo(self):
        ruta, s = self.preparar('linea vieja 1\nlinea vieja 2\n')
        self.assertEqual(s.lineas(), [])
        with open(ruta, 'a') as f:
            f.write('nueva 1\nnueva 2\n')
        self.assertEqual(s.lineas(), ['nueva 1', 'nueva 2'])
        self.assertEqual(s.lineas(), [])

    def test_una_linea_a_medio_escribir_se_espera_completa(self):
        ruta, s = self.preparar()
        with open(ruta, 'a') as f:
            f.write('completa\nincomple')
        self.assertEqual(s.lineas(), ['completa'])
        with open(ruta, 'a') as f:
            f.write('ta\n')
        self.assertEqual(s.lineas(), ['incompleta'])

    @unittest.skipIf(os.name == 'nt', 'En Windows no se puede mover un archivo abierto; la rotación es de Linux (logrotate)')
    def test_sigue_funcionando_si_rotan_el_archivo(self):
        ruta, s = self.preparar()
        with open(ruta, 'a') as f:
            f.write('antes\n')
        self.assertEqual(s.lineas(), ['antes'])
        os.replace(ruta, ruta + '.1')            # logrotate: el archivo se mueve y se crea uno nuevo
        with open(ruta, 'w') as f:
            f.write('despues de rotar\n')
        self.assertEqual(s.lineas(), ['despues de rotar'])

    def test_si_el_archivo_no_existe_todavia_no_falla(self):
        s = ag.SeguirArchivo('/no/existe/auth.log')
        self.assertEqual(s.lineas(), [])


class Agente(unittest.TestCase):
    def montar(self, vivo=lambda pid: True):
        t = {'ahora': 1_000_000.0}
        lineas = []
        enviados = []
        estado = {'ok': True}

        def enviar(ev):
            if not estado['ok']:
                return False
            enviados.append(ev)
            return True
        a = ag.Agente('pi4', lambda: [lineas.pop(0) for _ in range(len(lineas))], enviar, vivo=vivo, ahora=lambda: t['ahora'])
        return a, lineas, enviados, estado, t

    def test_entrada_y_salida_generan_eventos_con_dispositivo_y_hora(self):
        a, lineas, env, _, _ = self.montar()
        lineas += [ENTRADA, SALIDA]
        a.paso()
        self.assertEqual([e['tipo'] for e in env if e['tipo'] != 'latido'], ['entrada', 'salida'])
        self.assertTrue(all(e['dispositivo'] == 'pi4' and e['hora'].endswith('+00:00') for e in env))
        self.assertEqual(env[0]['ip'], '203.0.113.7')

    def test_una_salida_de_una_sesion_que_no_vimos_abrir_no_se_manda(self):
        a, lineas, env, _, _ = self.montar()
        lineas.append(SALIDA)
        a.paso()
        self.assertEqual([e['tipo'] for e in env if e['tipo'] != 'latido'], [])

    def test_el_latido_lista_solo_las_sesiones_con_proceso_vivo_y_se_repite_cada_30_s(self):
        a, lineas, env, _, t = self.montar(vivo=lambda pid: pid == '22029')
        lineas += [ENTRADA, ENTRADA.replace('22029', '30000')]
        a.paso()
        latidos = [e for e in env if e['tipo'] == 'latido']
        self.assertEqual(latidos[0]['abiertas'], ['22029'])         # la 30000 ya no tiene proceso: el servidor la cerrará
        t['ahora'] += 10
        a.paso()
        self.assertEqual(len([e for e in env if e['tipo'] == 'latido']), 1)   # aún no toca
        t['ahora'] += 25
        a.paso()
        self.assertEqual(len([e for e in env if e['tipo'] == 'latido']), 2)

    def test_si_el_servidor_no_responde_los_eventos_se_guardan_y_se_reenvian_en_orden(self):
        a, lineas, env, estado, t = self.montar()
        estado['ok'] = False
        lineas.append(ENTRADA)
        a.paso()
        self.assertEqual(env, [])
        self.assertGreaterEqual(len(a.pendientes), 2)
        estado['ok'] = True
        a.paso()
        self.assertEqual(a.pendientes, [])
        self.assertEqual([e['tipo'] for e in env][0], 'entrada')

    def test_la_cola_tiene_tope(self):
        a, lineas, env, estado, t = self.montar()
        estado['ok'] = False
        for i in range(ag.COLA_MAXIMA + 50):
            lineas.append(ENTRADA.replace('22029', str(i)))
        a.paso()
        self.assertLessEqual(len(a.pendientes), ag.COLA_MAXIMA)


class Proceso(unittest.TestCase):
    def test_sshd_vivo_por_cmdline(self):
        with tempfile.TemporaryDirectory() as base:
            os.makedirs(os.path.join(base, '5'))
            with open(os.path.join(base, '5', 'cmdline'), 'wb') as f:
                f.write(b'sshd: x [priv]\x00')
            os.makedirs(os.path.join(base, '6'))
            with open(os.path.join(base, '6', 'cmdline'), 'wb') as f:
                f.write(b'/usr/bin/python3\x00')
            self.assertTrue(ag.sshd_vivo('5', raiz=base))
            self.assertFalse(ag.sshd_vivo('6', raiz=base))
            self.assertFalse(ag.sshd_vivo('7', raiz=base))


if __name__ == '__main__':
    unittest.main()
