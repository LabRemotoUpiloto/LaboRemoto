import React, { useState } from 'react';
import { analyzeFile, FileAnalysis } from '../../api/fileAnalysis';
import { TextInput, Button, Badge, Card, Text, Group, List, Stack } from '@mantine/core';
import { Search, RotateCcw, AlertTriangle, FileCode2 } from 'lucide-react';

interface Props {
  sessionId?: string | null;
}

const AnalyzeFileWidget: React.FC<Props> = ({ sessionId }) => {
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);

  async function run(p?: string) {
    const target = p ?? pathInput.trim();
    if (!target) return;
    setLoading(true); setError(null); setSelectedCandidate(null);
    try {
      const resp = await analyzeFile(target, sessionId || undefined);
      setAnalysis(resp.analysis);
    } catch (e: any) {
      setError(e?.toString?.() || 'Error desconocido');
    } finally { setLoading(false); }
  }

  function reset() {
    setAnalysis(null); setError(null); setSelectedCandidate(null); setPathInput('');
  }

  const ambiguous = analysis?.disambiguation_required && (analysis?.candidates?.length || 0) > 1;

  return (
    <Card className="bg-black/20 border border-white/10" radius="md" p="md">
      <Group mb="xs">
        <FileCode2 size={18} className="text-blue-400" />
        <Text size="sm" fw={600} className="text-white/90">Analizar archivo</Text>
      </Group>

      {!analysis && (
        <Group align="flex-end" className="mb-2 gap-2">
          <TextInput
            placeholder="Ruta o nombre (remoto/local)"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            className="flex-1"
            classNames={{ input: 'bg-white/5 border-white/10 text-white placeholder-white/30' }}
            leftSection={<Search size={14} className="text-white/40" />}
            onKeyDown={e => e.key === 'Enter' && run()}
          />
          <Button 
            onClick={() => run()} 
            loading={loading} 
            disabled={!pathInput.trim()}
            variant="light"
          >
            Analizar
          </Button>
        </Group>
      )}

      {error && (
        <Text c="red" size="xs" mt="sm" className="bg-red-500/10 p-2 rounded border border-red-500/20">
          <AlertTriangle size={14} className="inline mr-1" /> {error}
        </Text>
      )}

      {analysis && !ambiguous && (
        <Stack gap="sm" mt="sm">
          <div className="grid grid-cols-2 gap-2 text-[12px] bg-white/5 p-3 rounded-md border border-white/5">
            <div className="col-span-2 break-all"><strong className="text-white/70">Ruta:</strong> <span className="text-blue-300 font-mono">{analysis.path}</span></div>
            {analysis.language && <div><strong className="text-white/70">Lenguaje:</strong> <Badge size="xs" variant="dot" color="blue">{analysis.language}</Badge></div>}
            {analysis.line_count > 0 && <div><strong className="text-white/70">Líneas:</strong> {analysis.line_count}</div>}
            {analysis.size_bytes > 0 && <div><strong className="text-white/70">Tamaño:</strong> {analysis.size_bytes} bytes</div>}
            {analysis.sha256 && analysis.sha256.length > 0 && <div className="col-span-2"><strong className="text-white/70">SHA256:</strong> <span className="font-mono text-white/50">{analysis.sha256.slice(0, 16)}…</span></div>}
          </div>

          {analysis.narrative && <Text size="sm" className="text-white/80 leading-relaxed">{analysis.narrative}</Text>}
          
          {analysis.purpose && (
            <Text size="sm" className="bg-blue-500/10 p-2 rounded text-blue-100/90 border border-blue-500/20">
              <strong className="text-blue-300 block mb-1">Propósito:</strong> {analysis.purpose}
            </Text>
          )}

          {analysis.key_points && analysis.key_points.length > 0 && (
            <List size="sm" spacing="xs" className="text-white/80">
              {analysis.key_points.map((kp, i) => (
                <List.Item key={i}>{kp}</List.Item>
              ))}
            </List>
          )}

          {(!analysis.key_points || analysis.key_points.length === 0) && analysis.ai_only && (
            <Text size="xs" c="dimmed" fs="italic">(Esperando análisis IA o modo AI-only sin puntos)</Text>
          )}

          <Group mt="md">
            <Button size="xs" variant="subtle" color="gray" onClick={reset} leftSection={<RotateCcw size={14} />} className="text-white/60 hover:text-white">
              Nuevo análisis
            </Button>
          </Group>
        </Stack>
      )}

      {analysis && ambiguous && (
        <Stack gap="sm" mt="sm">
          <Text size="sm" className="text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
            <AlertTriangle size={14} className="inline mr-1" />
            <strong>{analysis.candidates?.length} coincidencias</strong> encontradas para "{analysis.path}". Selecciona una ruta específica:
          </Text>
          
          <Stack gap="xs">
            {analysis.candidates!.map((c, idx) => (
              <Button 
                key={c}
                variant="light" 
                color="gray"
                className="justify-start text-left bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 h-auto py-2 font-mono text-[11px]"
                onClick={() => { setSelectedCandidate(c); run(c); }}
                disabled={loading}
              >
                <div className="flex gap-2 items-center w-full">
                  <Badge size="xs" color="gray" variant="filled" className="bg-black/30 shrink-0">{idx + 1}</Badge>
                  <span className="truncate">{c}</span>
                </div>
              </Button>
            ))}
          </Stack>

          <Group mt="sm">
            <Button size="xs" variant="subtle" color="gray" onClick={reset} className="text-white/60 hover:text-white">
              Cancelar
            </Button>
          </Group>
        </Stack>
      )}
    </Card>
  );
};

export default AnalyzeFileWidget;
