/// Utilidades compartidas para normalización de contenido AI.
/// Mantener libres de dependencias externas para reducir tiempo de compilación.

/// Forzar uso de python3 y pip mediante `python3 -m pip` en fragmentos de texto.
/// Se basa en reemplazos simples para minimizar falsos positivos.
pub fn force_python3_everywhere(s: &str) -> String {
    let mut out = s.to_string();
    // Shebangs
    out = out.replace("#!/usr/bin/env python\r\n", "#!/usr/bin/env python3\r\n");
    out = out.replace("#!/usr/bin/env python\n", "#!/usr/bin/env python3\n");
    out = out.replace("#!/usr/bin/python\r\n", "#!/usr/bin/python3\r\n");
    out = out.replace("#!/usr/bin/python\n", "#!/usr/bin/python3\n");
    // Comandos comunes (espacios para evitar colisiones con nombres de archivo)
    out = out.replace(" python -m pip ", " python3 -m pip ");
    out = out.replace(" python -m venv ", " python3 -m venv ");
    out = out.replace(" pip install ", " python3 -m pip install ");
    out = out.replace(" pip3 install ", " python3 -m pip install ");
    // Ejecutar scripts
    out = out.replace(" python ", " python3 ");
    // Líneas nuevas
    out = out.replace("\npython ", "\npython3 ");
    out = out.replace("\npip ", "\npython3 -m pip ");
    out = out.replace("\npip3 ", "\npython3 -m pip ");
    // Inicio absoluto
    if out.starts_with("python ") { out = out.replacen("python ", "python3 ", 1); }
    if out.starts_with("pip ") { out = out.replacen("pip ", "python3 -m pip ", 1); }
    if out.starts_with("pip3 ") { out = out.replacen("pip3 ", "python3 -m pip ", 1); }
    out
}

#[cfg(test)]
mod tests {
    use super::force_python3_everywhere;

    #[test]
    fn replaces_basic_invocations() {
        let input = "python script.py\npip install requests\n#!/usr/bin/env python\n";
        let out = force_python3_everywhere(input);
        assert!(out.contains("python3 script.py"));
        assert!(out.contains("python3 -m pip install requests"));
        assert!(out.contains("#!/usr/bin/env python3"));
    }
}
