import { useEffect, useState } from "react";
import type { Release } from "./types";

const DEFAULT_WINDOWS: Release = {
  version: "0.1.6",
  date: "2026-05-17",
  size: "Auto",
  platform: "windows",
  filename: "Cliente SSH Unipiloto_x64-setup.exe",
  downloadUrl:
    "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente%20SSH%20Unipiloto_0.1.6_x64-setup.exe",
  isLatest: true,
  notes: ["Lanzamiento oficial", "Instalación desatendida"],
};

const DEFAULT_LINUX: Release = {
  version: "0.1.6",
  date: "2026-05-17",
  size: "Auto",
  platform: "linux",
  filename: "ClienteSSH-Unipiloto-Linux",
  downloadUrl:
    "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/ClienteSSH-Unipiloto-Linux",
  isLatest: true,
  notes: ["Lanzamiento oficial", "Binario ejecutable"],
};

export function useReleases() {
  const [windowsRelease, setWindowsRelease] = useState<Release>(DEFAULT_WINDOWS);
  const [linuxRelease, setLinuxRelease] = useState<Release>(DEFAULT_LINUX);

  useEffect(() => {
    async function cargarEnlacesDescarga() {
      const repo = "Haider2231/Releases-Cliente-SSH-Unipiloto";
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
        const release = await res.json();
        const version = release.tag_name || "latest";
        const date = release.published_at ? release.published_at.split("T")[0] : "Reciente";

        const winAsset = release.assets?.find((a: any) => a.name.includes("setup.exe"));
        const linuxAsset = release.assets?.find((a: any) => a.name.includes("Linux"));

        if (winAsset) {
          setWindowsRelease((prev) => ({
            ...prev,
            version,
            date,
            size: (winAsset.size / (1024 * 1024)).toFixed(1) + " MB",
            filename: winAsset.name,
            downloadUrl: winAsset.browser_download_url,
          }));
        }
        if (linuxAsset) {
          setLinuxRelease((prev) => ({
            ...prev,
            version,
            date,
            size: (linuxAsset.size / (1024 * 1024)).toFixed(1) + " MB",
            filename: linuxAsset.name,
            downloadUrl: linuxAsset.browser_download_url,
          }));
        }
      } catch (e) {
        console.error("Error al cargar dinámicamente desde GitHub:", e);
      }
    }
    cargarEnlacesDescarga();
  }, []);

  return [windowsRelease, linuxRelease];
}
