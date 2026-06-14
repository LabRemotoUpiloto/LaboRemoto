export type LineType = "cmd" | "info" | "ok" | "err" | "ascii";

export interface Line {
  text: string;
  type: LineType;
}

export interface DownloadUrls {
  win: string;
  linux: string;
}
