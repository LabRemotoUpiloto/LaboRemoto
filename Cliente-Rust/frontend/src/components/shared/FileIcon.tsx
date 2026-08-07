import React from 'react'

export type FileIconProps = {
  name: string
  kind: 'file' | 'dir' | 'sym'
  size?: number
}

// ── Helpers de extracción de nombre y extensión ─────────────────────────────────

function getFileKey(name: string): { filename: string; ext: string; fullExt: string } {
  const filename = name.toLowerCase()
  const lastDot = filename.lastIndexOf('.')
  if (lastDot <= 0) {
    return { filename, ext: filename, fullExt: filename }
  }
  const ext = filename.slice(lastDot + 1)
  const firstDot = filename.indexOf('.')
  const fullExt = firstDot > 0 && firstDot < lastDot ? filename.slice(firstDot + 1) : ext
  return { filename, ext, fullExt }
}

// ── Iconos SVG de Carpetas (Material Icon Theme style) ──────────────────────────

const DefaultFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#FFA726"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#FB8C00"/>
    <path d="M4 7.5h5.5l-1.5 1.5H4a.5.5 0 0 1-.5-.5v-.5a.5.5 0 0 1 .5-.5z" fill="#FFE082" opacity="0.4"/>
  </svg>
)

const GitFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#F4511E"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#E64A19"/>
    {/* Git branch icon overlay */}
    <circle cx="11" cy="12" r="1.2" fill="#FFFFFF"/>
    <circle cx="15" cy="12" r="1.2" fill="#FFFFFF"/>
    <circle cx="15" cy="15.5" r="1.2" fill="#FFFFFF"/>
    <path d="M11 12.8v2.7M15 13.2v1.1M11 14h4" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round"/>
  </svg>
)

const VSCodeFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#0288D1"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#0277BD"/>
    <path d="M15.5 11l-3.5 2.5L10 12l5.5 4V11z" fill="#FFFFFF" opacity="0.9"/>
  </svg>
)

const NodeFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#43A047"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#2E7D32"/>
    <path d="M12 11.5l2.5 1.4v2.8L12 17.1l-2.5-1.4v-2.8l2.5-1.4z" fill="#81C784"/>
  </svg>
)

const DockerFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#0097A7"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#00838F"/>
    <rect x="9.5" y="13" width="2" height="1.5" rx="0.3" fill="#B2EBF2"/>
    <rect x="12" y="13" width="2" height="1.5" rx="0.3" fill="#B2EBF2"/>
    <rect x="14.5" y="13" width="2" height="1.5" rx="0.3" fill="#B2EBF2"/>
    <rect x="12" y="11.2" width="2" height="1.5" rx="0.3" fill="#B2EBF2"/>
  </svg>
)

const ConfigFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#546E7A"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#37474F"/>
    <circle cx="12" cy="13.2" r="2" fill="none" stroke="#CFD8DC" strokeWidth="1.2"/>
    <path d="M12 10.5v1M12 14.9v1M9.3 13.2h1M13.7 13.2h1" stroke="#CFD8DC" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

const AiFolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.5 7A1.5 1.5 0 0 1 4 5.5h4.172a1.5 1.5 0 0 1 1.06.44l1.329 1.328a.5.5 0 0 0 .353.146H20A1.5 1.5 0 0 1 21.5 8.91V17A2 2 0 0 1 19.5 19h-15A2 2 0 0 1 2.5 17V7z" fill="#7E57C2"/>
    <path d="M2.5 9A1.5 1.5 0 0 1 4 7.5h16A1.5 1.5 0 0 1 21.5 9v8a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9z" fill="#5E35B1"/>
    <path d="M12 11l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z" fill="#EDE7F6"/>
  </svg>
)

// ── Iconos SVG de Archivos Específicos (Material Icon Theme style) ──────────────

const GitFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#F05032"/>
    <circle cx="9" cy="9" r="1.6" fill="#FFFFFF"/>
    <circle cx="15" cy="9" r="1.6" fill="#FFFFFF"/>
    <circle cx="15" cy="15" r="1.6" fill="#FFFFFF"/>
    <path d="M9 10.6v3.8M15 10.6v2.8M9 12h6" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const JsFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#F7DF1E"/>
    <path d="M12.2 16.5c.4.8 1.1 1.3 2.1 1.3 1.1 0 1.8-.5 1.8-1.3 0-.9-.7-1.2-1.9-1.7l-.7-.3c-1.8-.8-3-1.7-3-3.7 0-2 1.6-3.4 4-3.4 1.8 0 3.1.7 3.9 2.2l-1.9 1.2c-.4-.8-1-1.2-1.9-1.2-.9 0-1.5.5-1.5 1.1 0 .8.6 1.1 1.8 1.6l.7.3c2.1.9 3.2 1.8 3.2 3.8 0 2.2-1.7 3.6-4.4 3.6-2.4 0-3.9-1-4.7-2.6l2.5-1.5z" fill="#000000"/>
    <path d="M7.8 14.8v2.7c-.5.3-1.3.5-2.1.5-1.7 0-2.6-.9-2.6-2.8V9.7h2.5v5c0 .6.2.9.7.9.4 0 .8-.2 1.5-.8z" fill="#000000"/>
  </svg>
)

const TsFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#3178C6"/>
    <path d="M5 9.5h6v1.8H9v6.7H7v-6.7H5V9.5z" fill="#FFFFFF"/>
    <path d="M12.2 16.5c.4.8 1.1 1.3 2.1 1.3 1.1 0 1.8-.5 1.8-1.3 0-.9-.7-1.2-1.9-1.7l-.7-.3c-1.8-.8-3-1.7-3-3.7 0-2 1.6-3.4 4-3.4 1.8 0 3.1.7 3.9 2.2l-1.9 1.2c-.4-.8-1-1.2-1.9-1.2-.9 0-1.5.5-1.5 1.1 0 .8.6 1.1 1.8 1.6l.7.3c2.1.9 3.2 1.8 3.2 3.8 0 2.2-1.7 3.6-4.4 3.6-2.4 0-3.9-1-4.7-2.6l2.5-1.5z" fill="#FFFFFF"/>
  </svg>
)

const PythonFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.9 3c-4.2 0-3.9 1.8-3.9 1.8v1.9h3.9v.6H6.4S4 7 4 11.2c0 4.2 2.1 4 2.1 4h1.2v-1.7c0-2.4 2.1-2.4 2.1-2.4h3.6s2.1 0 2.1-2.1V6.9s.3-3.9-3.2-3.9zm-1.2 1.3c.4 0 .7.3.7.7 0 .4-.3.7-.7.7-.4 0-.7-.3-.7-.7 0-.4.3-.7.7-.7z" fill="#3776AB"/>
    <path d="M12.1 21c4.2 0 3.9-1.8 3.9-1.8v-1.9h-3.9v-.6h5.5s2.4.3 2.4-3.9c0-4.2-2.1-4-2.1-4h-1.2v1.7c0 2.4-2.1 2.4-2.1 2.4h-3.6s-2.1 0-2.1 2.1v3.2s-.3 3.9 3.2 3.9zm1.2-1.3c-.4 0-.7-.3-.7-.7 0-.4.3-.7.7-.7.4 0 .7.3.7.7 0 .4-.3.7-.7.7z" fill="#FFD43B"/>
  </svg>
)

const RustFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="7" stroke="#DEA584" strokeWidth="2.2" fill="none" strokeDasharray="3 1.8"/>
    <path d="M9.5 9h3a2 2 0 0 1 0 4h-3V9zm0 4h1.8l1.7 4" stroke="#DEA584" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
)

const ShellFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#263238"/>
    <path d="M7 9l3 3-3 3M12 15h5" stroke="#4CAF50" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const PowerShellFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#012456"/>
    <path d="M7.5 8.5l4.5 3.5-4.5 3.5M13.5 15.5h4" stroke="#539AC5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const JsonFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#FFF8E1"/>
    <path d="M14 3v4.5H19" fill="#FFE082"/>
    <path d="M8 11.5c-.8 0-1.2-.4-1.2-1.2V9.8c0-.6-.4-1-1-1h-.3v-.8h.3c.6 0 1-.4 1-1V6.5c0-.8.4-1.2 1.2-1.2M16 11.5c.8 0 1.2-.4 1.2-1.2V9.8c0-.6.4-1 1-1h.3v-.8h-.3c-.6 0-1-.4-1-1V6.5c0-.8-.4-1.2-1.2-1.2" transform="scale(0.8) translate(3, 7)" stroke="#FBC02D" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
  </svg>
)

const DockerFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#E0F7FA"/>
    <path d="M14 3v4.5H19" fill="#80DEEA"/>
    <rect x="7" y="13" width="2.2" height="1.8" rx="0.3" fill="#0288D1"/>
    <rect x="9.8" y="13" width="2.2" height="1.8" rx="0.3" fill="#0288D1"/>
    <rect x="12.6" y="13" width="2.2" height="1.8" rx="0.3" fill="#0288D1"/>
    <rect x="9.8" y="10.8" width="2.2" height="1.8" rx="0.3" fill="#0288D1"/>
    <path d="M6 16.2c1.2.8 3.5 1.3 6.5 1.3 4.5 0 6.5-1.8 6.5-1.8" stroke="#0288D1" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const MarkdownFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#42A5F5"/>
    <path d="M6.5 15V9l2.5 3 2.5-3v6M14.5 12h3M16 9.5l1.5 2.5-1.5 2.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const CssFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.5 3.5h15l-1.4 15.5L12 21l-6.1-2L4.5 3.5z" fill="#1572B6"/>
    <path d="M12 5v14.2l4.8-1.5 1.1-12.7H12z" fill="#33A9DC"/>
    <path d="M8 8h8M8.3 11h7.4l-.4 4.5-3.3 1-3.3-1-.2-2.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
)

const HtmlFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.5 3.5h15l-1.4 15.5L12 21l-6.1-2L4.5 3.5z" fill="#E34F26"/>
    <path d="M12 5v14.2l4.8-1.5 1.1-12.7H12z" fill="#EF652A"/>
    <path d="M16 8H8.3l.3 3.5h7.1l-.6 6.5-3.1.9-3.1-.9-.2-2.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
)

const YamlFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#FFFDE7"/>
    <path d="M14 3v4.5H19" fill="#FFF59D"/>
    <path d="M8 10l2.5 3.5V17M16 10l-2.5 3.5" stroke="#F57F17" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const EnvFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#1B5E20"/>
    <circle cx="9.5" cy="12" r="2.5" stroke="#A5D6A7" strokeWidth="1.6" fill="none"/>
    <path d="M12 12h5.5M15 12v2M17 12v1.5" stroke="#A5D6A7" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
)

const SqlFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" fill="#0288D1"/>
    <path d="M5.5 6.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" fill="none" stroke="#0288D1" strokeWidth="1.4"/>
    <path d="M5.5 11.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" fill="none" stroke="#0288D1" strokeWidth="1.4"/>
  </svg>
)

const ImageFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#7E57C2"/>
    <circle cx="8.5" cy="9" r="1.8" fill="#EDE7F6"/>
    <path d="M5 16.5l4.5-5 3.5 4 2.5-2.5 3.5 3.5H5z" fill="#EDE7F6"/>
  </svg>
)

const AudioFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#00ACC1"/>
    <circle cx="9" cy="15" r="2" fill="#E0F7FA"/>
    <path d="M11 15V8.5l6-1.5V13" stroke="#E0F7FA" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="15" cy="13" r="2" fill="#E0F7FA"/>
  </svg>
)

const VideoFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#D81B60"/>
    <path d="M8 9.5v5l5-2.5-5-2.5zM16 9.5v5" fill="#FCE4EC" stroke="#FCE4EC" strokeWidth="1.2" strokeLinejoin="round"/>
  </svg>
)

const ArchiveFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#FB8C00"/>
    <path d="M12 4.5v15M10 7.5h4M10 10.5h4M10 13.5h4" stroke="#FFF3E0" strokeWidth="1.4" strokeLinecap="round"/>
    <rect x="10.5" y="15" width="3" height="3" rx="0.5" fill="#FFF3E0"/>
  </svg>
)

const PdfFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#E53935"/>
    <path d="M14 3v4.5H19" fill="#EF9A9A"/>
    <text x="11.5" y="16" textAnchor="middle" fontFamily="sans-serif" fontSize="6.5" fontWeight="bold" fill="#FFFFFF">PDF</text>
  </svg>
)

const WordFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#1E88E5"/>
    <path d="M14 3v4.5H19" fill="#90CAF9"/>
    <path d="M7 11l1.8 5L10.5 13l1.7 3 1.8-5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const ExcelFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#43A047"/>
    <path d="M14 3v4.5H19" fill="#A5D6A7"/>
    <path d="M8.5 11l5 5M13.5 11l-5 5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
)

const GenericFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" stroke="var(--text-secondary, #78909C)" strokeWidth="1.2" opacity="0.7"/>
  </svg>
)

const SymlinkIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8.5" stroke="var(--accent-primary, #0288D1)" strokeWidth="1.6" fill="none" />
    <path d="M8.5 12h7M12 8.5l3.5 3.5-3.5 3.5" stroke="var(--accent-primary, #0288D1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const CFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#5C6BC0"/>
    <path d="M15 9.5c-1-1-2.5-1.5-4-1.5-2.8 0-4.5 2.2-4.5 4.5s1.7 4.5 4.5 4.5c1.5 0 3-.5 4-1.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none"/>
  </svg>
)

const CppFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#00599C"/>
    <path d="M12.5 9.5c-.8-.8-2-1.2-3.2-1.2-2.2 0-3.8 1.8-3.8 3.7s1.6 3.7 3.8 3.7c1.2 0 2.4-.4 3.2-1.2M15 12h3M16.5 10.5v3M18.5 12h3M20 10.5v3" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
  </svg>
)

const JavaFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#E65100"/>
    <path d="M9 16.5s1-.5 2-.5 2 .5 3 .5 1.5-.3 1.5-.3M9.5 14.5s1.2-.8 2.5-.8 2.5.8 2.5.8M12 7v3.5M10 9c.5.8 1 1.5 2 1.5s1.5-.7 2-1.5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
  </svg>
)

const GoFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="#00ADD8"/>
    <path d="M7 11.5c.5-1 1.5-1.5 2.5-1.5 1.8 0 2.8 1.2 2.8 2.5S11.3 15 9.5 15C8 15 7 14.2 6.5 13H11v-1.5H6.8M14 12c0-1.2 1-2 2.2-2s2.2.8 2.2 2-1 2-2.2 2-2.2-.8-2.2-2z" stroke="#FFFFFF" strokeWidth="1.3" fill="none"/>
  </svg>
)

const LockFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#E91E63"/>
    <rect x="8" y="11" width="8" height="6" rx="1" stroke="#FFFFFF" strokeWidth="1.5" fill="none"/>
    <path d="M9.5 11V9a2.5 2.5 0 0 1 5 0v2" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const KeyFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#FF9800"/>
    <circle cx="9" cy="12" r="2.5" stroke="#FFFFFF" strokeWidth="1.5" fill="none"/>
    <path d="M11.5 12H16M14 12v2M16 12v1.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const LogFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#78909C"/>
    <path d="M14 3v4.5H19" fill="#CFD8DC"/>
    <path d="M7.5 11h9M7.5 14h9M7.5 17h5" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const BinaryFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="#455A64"/>
    <circle cx="12" cy="12" r="3" stroke="#B0BEC5" strokeWidth="1.5" fill="none"/>
    <path d="M12 7.5v1.5M12 15v1.5M7.5 12h1.5M15 12h1.5" stroke="#B0BEC5" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const PptFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#FF5722"/>
    <path d="M14 3v4.5H19" fill="#FFAB91"/>
    <path d="M9 11h3.5a2 2 0 0 1 0 4H9v2V11zm0 2h3.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const TextFileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9L19 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-15z" fill="#ECEFF1"/>
    <path d="M14 3v4.5H19" fill="#B0BEC5"/>
    <path d="M7.5 10.5h9M7.5 13.5h9M7.5 16.5h6" stroke="#78909C" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

// ── Selector de Componente según nombre / extensión ────────────────────────────

const FileIcon: React.FC<FileIconProps> = ({ name, kind, size = 18 }) => {
  if (kind === 'sym') return <SymlinkIcon size={size} />

  const { filename, ext, fullExt } = getFileKey(name)

  // 1. Selector de carpetas
  if (kind === 'dir') {
    if (filename.includes('git')) return <GitFolderIcon size={size} />
    if (filename.includes('vscode')) return <VSCodeFolderIcon size={size} />
    if (filename.includes('node_modules')) return <NodeFolderIcon size={size} />
    if (filename.includes('docker')) return <DockerFolderIcon size={size} />
    if (filename.includes('config') || filename.includes('setting')) return <ConfigFolderIcon size={size} />
    if (filename.includes('claude') || filename.includes('gemini') || filename.includes('copilot') || filename.includes('grok') || filename.includes('ai')) return <AiFolderIcon size={size} />
    return <DefaultFolderIcon size={size} />
  }

  // 2. Selector de archivos por coincidencia exacta de nombre o prefijo
  if (filename.startsWith('.git') || filename === 'gitconfig') return <GitFileIcon size={size} />
  if (filename.includes('dockerfile') || filename.startsWith('.docker')) return <DockerFileIcon size={size} />
  if (filename.startsWith('.env')) return <EnvFileIcon size={size} />
  if (filename === 'readme.md' || filename === 'readme') return <MarkdownFileIcon size={size} />
  if (filename.endsWith('.lock') || filename.includes('lock')) return <LockFileIcon size={size} />

  // 3. Selector por extensión (fullExt o ext)
  switch (ext) {
    // Git / Config especial
    case 'git':
    case 'gitignore': return <GitFileIcon size={size} />

    // JavaScript / TypeScript
    case 'js':
    case 'jsx':
    case 'cjs':
    case 'mjs': return <JsFileIcon size={size} />
    case 'ts':
    case 'tsx': return <TsFileIcon size={size} />

    // C / C++ / Systems
    case 'c':
    case 'h': return <CFileIcon size={size} />
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx': return <CppFileIcon size={size} />

    // Java / Kotlin / Go / Rust
    case 'java':
    case 'jar':
    case 'class': return <JavaFileIcon size={size} />
    case 'kt':
    case 'kts': return <JavaFileIcon size={size} />
    case 'go': return <GoFileIcon size={size} />
    case 'rs': return <RustFileIcon size={size} />

    // Scripting & Shell
    case 'py':
    case 'pyc': return <PythonFileIcon size={size} />
    case 'sh':
    case 'bash':
    case 'zsh': return <ShellFileIcon size={size} />
    case 'ps1':
    case 'psm1': return <PowerShellFileIcon size={size} />
    case 'bat':
    case 'cmd': return <ShellFileIcon size={size} />

    // Configuración & Datos
    case 'json':
    case 'json5': return <JsonFileIcon size={size} />
    case 'yaml':
    case 'yml': return <YamlFileIcon size={size} />
    case 'toml': return <YamlFileIcon size={size} />
    case 'ini':
    case 'conf':
    case 'config':
    case 'properties': return <ConfigFolderIcon size={size} />

    // Seguridad, Claves & Certificados
    case 'pem':
    case 'crt':
    case 'key':
    case 'pub':
    case 'asc':
    case 'auth_token': return <KeyFileIcon size={size} />

    // Logs & Texto
    case 'log': return <LogFileIcon size={size} />
    case 'txt':
    case 'text': return <TextFileIcon size={size} />

    // Web / Estilos / Documentos
    case 'css':
    case 'scss':
    case 'less': return <CssFileIcon size={size} />
    case 'html':
    case 'htm': return <HtmlFileIcon size={size} />
    case 'md':
    case 'markdown': return <MarkdownFileIcon size={size} />

    // Base de datos
    case 'sql':
    case 'db':
    case 'sqlite': return <SqlFileIcon size={size} />

    // Multimedia
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico': return <ImageFileIcon size={size} />

    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg': return <AudioFileIcon size={size} />

    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'webm':
    case 'mov': return <VideoFileIcon size={size} />

    // Compresión & Documentos Office
    case 'zip':
    case 'gz':
    case 'tar':
    case 'rar':
    case '7z': return <ArchiveFileIcon size={size} />

    case 'pdf': return <PdfFileIcon size={size} />
    case 'doc':
    case 'docx': return <WordFileIcon size={size} />
    case 'xls':
    case 'xlsx':
    case 'csv': return <ExcelFileIcon size={size} />
    case 'ppt':
    case 'pptx': return <PptFileIcon size={size} />

    // Binarios & Ejecutables
    case 'exe':
    case 'dll':
    case 'so':
    case 'dylib':
    case 'bin':
    case 'out':
    case 'o':
    case 'a': return <BinaryFileIcon size={size} />

    default:
      if (fullExt === 'claude.json' || fullExt === 'json') return <JsonFileIcon size={size} />
      if (fullExt.endsWith('lock')) return <LockFileIcon size={size} />
      return <GenericFileIcon size={size} />
  }
}

export default FileIcon

