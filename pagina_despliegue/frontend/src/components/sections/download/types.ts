export interface Release {
  version: string;
  date: string;
  size: string;
  platform: "windows" | "linux";
  filename: string;
  downloadUrl: string;
  isLatest: boolean;
  notes: string[];
}

export const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  linux: "Linux",
};
