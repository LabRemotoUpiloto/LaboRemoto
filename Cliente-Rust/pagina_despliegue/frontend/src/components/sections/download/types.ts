export type Platform = "windows" | "linux" | "macos";

export interface ReleaseVariant {
  label: string;
  filename: string;
  size: string;
  downloadUrl: string;
  notes?: string;
}

export interface VersionInfo {
  version: string;
  date: string;
}

export interface PlatformRelease {
  platform: Platform;
  version: string;
  date: string;
  available: boolean;
  comingSoonMessage?: string;
  variants: ReleaseVariant[];
  allVersions: VersionInfo[];
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  windows: "Windows 11",
  linux: "Linux",
  macos: "macOS",
};
