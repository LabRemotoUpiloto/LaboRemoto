import React from 'react'

export type FileIconProps = {
  name: string
  kind: 'file' | 'dir' | 'sym'
  size?: number
}

function getExt(name: string) {
  const i = name.lastIndexOf('.')
  if (i <= 0) return ''
  return name.slice(i + 1).toLowerCase()
}

function extColor(ext: string): { fill: string; text?: string } {
  switch (ext) {
    // code
    case 'js': return { fill: '#f7df1e', text: '#111827' }
    case 'ts':
    case 'tsx': return { fill: '#3178c6', text: '#e5e7eb' }
    case 'jsx': return { fill: '#61dafb', text: '#0b1220' }
    case 'py': return { fill: '#3776ab', text: '#e5e7eb' }
    case 'sh': return { fill: '#3fb950', text: '#0b1220' }
    case 'rb': return { fill: '#cc342d', text: '#fff' }
    case 'go': return { fill: '#00ADD8', text: '#0b1220' }
    case 'rs': return { fill: '#dea584', text: '#0b1220' }
    case 'php': return { fill: '#8892BF', text: '#0b1220' }
    case 'java': return { fill: '#e76f00', text: '#fff' }
    case 'kt': return { fill: '#7f52ff', text: '#fff' }
    case 'c': return { fill: '#555555', text: '#e5e7eb' }
    case 'cpp':
    case 'cc':
    case 'cxx': return { fill: '#004482', text: '#e5e7eb' }
    case 'h':
    case 'hpp': return { fill: '#2f4858', text: '#e5e7eb' }
    case 'ps1': return { fill: '#012456', text: '#e5e7eb' }
    case 'bat': return { fill: '#2c2c2c', text: '#e5e7eb' }

    // config / data
    case 'json': return { fill: '#6b7280', text: '#e5e7eb' }
    case 'yaml':
    case 'yml': return { fill: '#cbad00', text: '#111827' }
    case 'toml': return { fill: '#5b4638', text: '#e5e7eb' }
    case 'ini': return { fill: '#475569', text: '#e5e7eb' }
    case 'env': return { fill: '#10b981', text: '#0b1220' }
    case 'log': return { fill: '#334155', text: '#e5e7eb' }
    case 'sql': return { fill: '#00618a', text: '#e5e7eb' }
    case 'db':
    case 'sqlite': return { fill: '#0ea5e9', text: '#0b1220' }

    // markup / styling
    case 'md': return { fill: '#9ca3af', text: '#0b1220' }
    case 'html': return { fill: '#e34f26', text: '#fff' }
    case 'css': return { fill: '#264de4', text: '#fff' }

    // archives
    case 'zip':
    case 'gz':
    case 'tar': return { fill: '#f59e0b', text: '#0b1220' }

    // documents
    case 'pdf': return { fill: '#ef4444', text: '#fff' }
    case 'doc':
    case 'docx': return { fill: '#185abd', text: '#fff' }
    case 'xls':
    case 'xlsx': return { fill: '#217346', text: '#fff' }
    case 'ppt':
    case 'pptx': return { fill: '#d24726', text: '#fff' }
    case 'txt': return { fill: '#94a3b8', text: '#0b1220' }
    case 'csv': return { fill: '#16a34a', text: '#0b1220' }

    // images
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico': return { fill: '#a78bfa', text: '#0b1220' }

    // audio/video
    case 'mp3':
    case 'wav':
    case 'flac': return { fill: '#22d3ee', text: '#0b1220' }
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv': return { fill: '#f472b6', text: '#0b1220' }

    // binaries
    case 'exe':
    case 'dll': return { fill: '#6b7280', text: '#e5e7eb' }

    default: return { fill: 'var(--text-secondary)' }
  }
}

const FolderIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4.19c.46 0 .9.18 1.23.5l1.07 1.06c.33.33.77.52 1.23.52h5.83A1.75 1.75 0 0 1 20.25 8.83v8.42A1.75 1.75 0 0 1 18.5 19H5.5A1.75 1.75 0 0 1 3.75 17.25V6.75z" fill="var(--accent-primary)" stroke="var(--accent-primary)" strokeWidth="0"/>
  </svg>
)

const FileDocIcon: React.FC<{ size: number; ext?: string }> = ({ size, ext }) => {
  const { fill, text } = extColor(ext || '')
  const radius = 2
  const fontSize = Math.max(6, Math.floor(size * 0.34))
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3h6.5L19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill={fill} opacity={ext ? 0.95 : 0.25} stroke={ext ? 'transparent':'var(--text-secondary)'} strokeWidth={ext?0:1}/>
      <path d="M13.5 3v3.5A2 2 0 0 0 15.5 9H19" fill="none" stroke={ext? 'transparent' : 'var(--text-secondary)'} strokeWidth={1}/>
      {ext && (
        <g>
          <rect x="5" y="14" rx={radius} ry={radius} width="14" height="6" fill={fill} opacity={0.9}/>
          <text x="12" y="18.4" textAnchor="middle" fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif" fontSize={fontSize} fontWeight="700" fill={text || 'var(--background-primary)'} style={{ letterSpacing: '-0.5px' }}>{ext.toUpperCase()}</text>
        </g>
      )}
    </svg>
  )
}

const SymlinkIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="var(--text-secondary)" strokeWidth="1.5" fill="none" />
    <path d="M8 12h8M12 8l4 4-4 4" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const FileIcon: React.FC<FileIconProps> = ({ name, kind, size = 18 }) => {
  if (kind === 'dir') return <FolderIcon size={size} />
  if (kind === 'sym') return <SymlinkIcon size={size} />
  const ext = name.toLowerCase() === 'dockerfile' ? 'docker' : getExt(name)
  return <FileDocIcon size={size} ext={ext} />
}

export default FileIcon
