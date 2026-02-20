import { useState } from 'react';

interface Props {
  onGenerate: (prompt: string, style: string) => void;
  loading: boolean;
  error: string | null;
  activePlacement: string;
  placement?: any;
}

const STYLES = [
  { id: 'illustration', label: 'Illustration', emoji: '🎨' },
  { id: 'realistic', label: 'Réaliste', emoji: '📸' },
  { id: 'abstract', label: 'Abstrait', emoji: '🌀' },
  { id: 'pixel-art', label: 'Pixel Art', emoji: '🕹️' },
  { id: 'watercolor', label: 'Aquarelle', emoji: '💧' },
];

const PROMPT_PRESETS = [
  { label: '🌿 Nature', prompt: 'Forêt enchantée avec des champignons lumineux et des fées' },
  { label: '🐉 Fantasy', prompt: 'Dragon majestueux volant au-dessus de montagnes rocheuses' },
  { label: '🌊 Océan', prompt: 'Baleine bleue majestueuse dans les profondeurs de l\'océan' },
  { label: '🌙 Cosmos', prompt: 'Galaxie spirale avec nébuleuse colorée et étoiles' },
  { label: '🌸 Japonais', prompt: 'Cerisiers en fleurs avec Mont Fuji au coucher de soleil' },
  { label: '🦁 Animal', prompt: 'Portrait géométrique de lion en style low-poly' },
];

export function AIPromptPanel({ onGenerate, loading, error, activePlacement, placement }: Props) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('illustration');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = () => {
    if (!prompt.trim() || loading) return;
    onGenerate(prompt.trim(), style);
  };

  const isEmbroidery = placement?.techniques?.some((t: any) => t.id === 'embroidery');

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h3>Générer avec l'IA</h3>
        <span className="placement-badge">
          Zone : {placement?.label || activePlacement}
        </span>
      </div>

      {isEmbroidery && (
        <div className="embroidery-warning">
          🧵 Zone broderie — l'IA adaptera le style : aplats, max 15 couleurs, pas de dégradés
        </div>
      )}

      <di