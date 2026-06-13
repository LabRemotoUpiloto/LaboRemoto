import { useCallback, useEffect, useState } from "react";
import type { Platform, PlatformRelease, VersionInfo } from "./types";

const REPO = "Haider2231/Releases-Cliente-SSH-Unipiloto";
const API_BASE = `https://api.github.com/repos/${REPO}/releases`;

const DEFAULTS: PlatformRelease[] = [
  {
    platform: "windows",
    version: "0.1.6",
    date: "2026-06-13",
    available: true,
    variants: [
      {
        label: "Instalador x64",
        filename: "Cliente.SSH.Unipiloto_0.1.6_x64-setup.exe",
        size: "Auto",
        downloadUrl:
          "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente.SSH.Unipiloto_0.1.6_x64-setup.exe",
      },
    ],
    allVersions: [
      { version: "0.1.6", date: "2026-05-17" },
    ],
  },
  {
    platform: "linux",
    version: "0.1.6",
    date: "2026-06-13",
    available: true,
    variants: [
      {
        label: "Debian 13 / glibc ≥ 2.39",
        filename: "Cliente.SSH-Unipiloto.Debian.13",
        size: "Auto",
        downloadUrl:
          "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente.SSH-Unipiloto.Debian.13",
        notes: "Debian 13, Ubuntu 24.04+, Fedora 40+",
      },
      {
        label: "Debian 12 / glibc ≥ 2.36",
        filename: "Cliente.SSh-Unipiloto.Debian.12",
        size: "Auto",
        downloadUrl:
          "https://github.com/Haider2231/Releases-Cliente-SSH-Unipiloto/releases/download/v0.1.6/Cliente.SSh-Unipiloto.Debian.12",
        notes: "Debian 12, Ubuntu 22.04+, Fedora 36+",
      },
    ],
    allVersions: [
      { version: "0.1.6", date: "2026-06-13" },
    ],
  },
  {
    platform: "macos",
    version: "—",
    date: "—",
    available: false,
    comingSoonMessage: "Próximamente. Build para macOS en preparación.",
    variants: [],
    allVersions: [],
  },
];

function buildVariantUrls(
  platform: Platform,
  version: string,
  baseVariants: PlatformRelease["variants"]
): PlatformRelease["variants"] {
  const tag = version.startsWith("v") ? version : `v${version}`;
  const ver = version.replace(/^v/, "");
  return baseVariants.map((v) => {
    const filename = v.filename
      .replace(/_[\d.]+_/, `_${ver}_`)
      .replace(/v[\d.]+/g, tag);
    return {
      ...v,
      filename,
      downloadUrl: `https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(filename)}`,
    };
  });
}

function parseVersion(tagName: string) {
  const raw = (tagName || "").replace(/^v/, "");
  return raw.toLowerCase() === "releases" ? "0.1.6" : raw;
}

export function useReleases() {
  const [releases, setReleases] = useState<PlatformRelease[]>(DEFAULTS);
  const [allGithubReleases, setAllGithubReleases] = useState<any[]>([]);

  useEffect(() => {
    async function fetchAllReleases() {
      try {
        const res = await fetch(`${API_BASE}?per_page=15`);
        const data = await res.json();
        if (!Array.isArray(data)) return;
        setAllGithubReleases(data);

        setReleases((prev) =>
          prev.map((p) => {
            if (!p.available) return p;

            const versions: VersionInfo[] = data.map((r: any) => ({
              version: parseVersion(r.tag_name),
              date: r.published_at ? r.published_at.split("T")[0] : "",
            }));

            const latest = data[0];
            const version = parseVersion(latest?.tag_name);
            const date = latest?.published_at
              ? latest.published_at.split("T")[0]
              : p.date;

            const assets: any[] = latest?.assets || [];

            let updatedVariants = p.variants;
            if (p.platform === "windows") {
              const asset = assets.find((a: any) => a.name.includes("setup.exe"));
              if (asset) {
                updatedVariants = buildVariantUrls("windows", version, p.variants).map(
                  (v) => ({
                    ...v,
                    filename: asset.name,
                    size: (asset.size / (1024 * 1024)).toFixed(1) + " MB",
                    downloadUrl: asset.browser_download_url,
                  })
                );
              }
            }
            if (p.platform === "linux") {
              const assetDeb13 = assets.find((a: any) => a.name.toLowerCase().includes("debian.13"));
              const assetDeb12 = assets.find(
                (a: any) => {
                  const name = a.name.toLowerCase();
                  return name.includes("debian.12") || (name.includes("debian") && !name.includes("debian.13"));
                }
              );
              updatedVariants = p.variants.map((v, i) => {
                const asset = i === 0 ? assetDeb13 : assetDeb12;
                if (asset) {
                  return {
                    ...v,
                    filename: asset.name,
                    size: (asset.size / (1024 * 1024)).toFixed(1) + " MB",
                    downloadUrl: asset.browser_download_url,
                  };
                }
                return buildVariantUrls("linux", version, [v])[0];
              });
            }

            return {
              ...p,
              version,
              date,
              variants: updatedVariants,
              allVersions:
                versions.length > 0 ? versions : p.allVersions,
            };
          })
        );
      } catch (e) {
        console.error("Error al cargar releases desde GitHub:", e);
      }
    }
    fetchAllReleases();
  }, []);

  const switchVersion = useCallback(
    (platform: Platform, versionTag: string) => {
      const ver = versionTag.replace(/^v/, "");
      const tag = versionTag.startsWith("v") ? versionTag : `v${versionTag}`;
      const ghRelease = allGithubReleases.find(
        (r: any) => parseVersion(r.tag_name) === ver || r.tag_name === tag || r.tag_name === versionTag
      );

      setReleases((prev) =>
        prev.map((p) => {
          if (p.platform !== platform || !p.available) return p;

          const date = ghRelease?.published_at
            ? ghRelease.published_at.split("T")[0]
            : "";

          const assets: any[] = ghRelease?.assets || [];
          let updatedVariants = p.variants;

          if (p.platform === "windows") {
            const asset = assets.find((a: any) => a.name.includes("setup.exe"));
            updatedVariants = buildVariantUrls("windows", ver, p.variants);
            if (asset) {
              updatedVariants = updatedVariants.map((v) => ({
                ...v,
                filename: asset.name,
                size: (asset.size / (1024 * 1024)).toFixed(1) + " MB",
                downloadUrl: asset.browser_download_url,
              }));
            }
          }
          if (p.platform === "linux") {
            const assetDeb13 = assets.find((a: any) => a.name.toLowerCase().includes("debian.13"));
            const assetDeb12 = assets.find(
              (a: any) => {
                const name = a.name.toLowerCase();
                return name.includes("debian.12") || (name.includes("debian") && !name.includes("debian.13"));
              }
            );
            updatedVariants = p.variants.map((v, i) => {
              const asset = i === 0 ? assetDeb13 : assetDeb12;
              if (asset) {
                return {
                  ...v,
                  filename: asset.name,
                  size: (asset.size / (1024 * 1024)).toFixed(1) + " MB",
                  downloadUrl: asset.browser_download_url,
                };
              }
              return buildVariantUrls("linux", ver, [v])[0];
            });
          }

          return { ...p, version: ver, date, variants: updatedVariants };
        })
      );
    },
    [allGithubReleases]
  );

  return { releases, switchVersion };
}
