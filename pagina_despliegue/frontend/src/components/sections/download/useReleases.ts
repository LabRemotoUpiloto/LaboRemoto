import { useEffect, useState } from "react";
import type { PlatformRelease } from "./types";

const DEFAULTS: PlatformRelease[] = [
  {
    platform: "windows",
    version: "0.1.6",
    date: "2026-05-17",
    available: true,
    variants: [
      {
        label: "Instalador x64",
        filename: "Cliente SSH Unipiloto_x64-setup.exe",
        size: "Auto",
        downloadUrl:
          "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente%20SSH%20Unipiloto_0.1.6_x64-setup.exe",
      },
    ],
  },
  {
    platform: "linux",
    version: "0.1.6",
    date: "2026-05-17",
    available: true,
    variants: [
      {
        label: "Binario x64 (glibc ≥ 2.35)",
        filename: "ClienteSSH-Unipiloto-Linux",
        size: "Auto",
        downloadUrl:
          "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/ClienteSSH-Unipiloto-Linux",
        notes: "Compatible con Ubuntu 22.04+, Debian 12+, Fedora 36+",
      },
    ],
  },
  {
    platform: "macos",
    version: "—",
    date: "—",
    available: false,
    comingSoonMessage: "Próximamente. Build para macOS en preparación.",
    variants: [],
  },
];

export function useReleases() {
  const [releases, setReleases] = useState<PlatformRelease[]>(DEFAULTS);

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

        setReleases((prev) =>
          prev.map((p) => {
            if (p.platform === "windows" && winAsset) {
              return {
                ...p,
                version,
                date,
                variants: [
                  {
                    ...p.variants[0],
                    filename: winAsset.name,
                    size: (winAsset.size / (1024 * 1024)).toFixed(1) + " MB",
                    downloadUrl: winAsset.browser_download_url,
                  },
                ],
              };
            }
            if (p.platform === "linux" && linuxAsset) {
              return {
                ...p,
                version,
                date,
                variants: [
                  {
                    ...p.variants[0],
                    filename: linuxAsset.name,
                    size: (linuxAsset.size / (1024 * 1024)).toFixed(1) + " MB",
                    downloadUrl: linuxAsset.browser_download_url,
                  },
                ],
              };
            }
            return p;
          })
        );
      } catch (e) {
        console.error("Error al cargar dinámicamente desde GitHub:", e);
      }
    }
    cargarEnlacesDescarga();
  }, []);

  return releases;
}
