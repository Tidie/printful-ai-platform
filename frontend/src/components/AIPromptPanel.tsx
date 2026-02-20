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
  { label: '🌿 Nature', prompt: 'Foret enchantee avec des champignons lumineux et des fees' },
  { label: '🐉 Fantasy', prompt: 'Dragon majestueux volant au-dessus de montagnes rocheuses' },
  { label: '🌊 Ocean', prompt: 'Baleine bleue majestueuse dans les profondeurs de ocean' },
  { label: '🌙 Cosmos', prompt: 'Galaxie spirale avec nebuleuse coloree et etoiles' },
  { label: '🌸 Japonais', prompt: 'Cerisiers en fleurs avec Mont Fuji au coucher de soleil' },
  { label: '🦁 Animal', prompt: 'Portrait geometrique de lion en style low-poly' },
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
  const zoneLabel = placement?.label || activePlacement;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h3>{"Générer avec l'IA"}</h3>
        <span className="placement-badge">
          {`Zone : ${zoneLabel}`}
        </span>
      </div>

      {isEmbroidery && (
        <div className="embroidery-warning">
          {"🧵 Zone broderie — style adapté automatiquement : aplats, max 15 couleurs"}
        </div>
      )}

      <div className="prompt-area">
        <label className="input-label">{"Décrivez votre design"}</label>
        <textarea
          className="prompt-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Un renard stylise dans une foret automne avec des feuilles dorees"
          rows={4}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) handleSubmit();
          }}
        />
        <span className="prompt-hint">{"⌘+Entrée pour générer"}</span>
      </div>

      <div className="style-selector">
        <label className="input-label">{"Style artistique"}</label>
        <div className="style-buttons">
          {STYLES.map(s => (
            <button
              key={s.id}
              className={`style-btn ${style === s.id ? 'active' : ''}`}
              onClick={() => setStyle(s.id)}
              disabled={loading}
            >
              <span>{s.emoji}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="presets-section">
        <label className="input-label">{"Inspirations rapides"}</label>
        <div className="presets-grid">
          {PROMPT_PRESETS.map(preset => (
            <button
              key={preset.label}
              className="preset-btn"
              onClick={() => setPrompt(preset.prompt)}
              disabled={loading}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? '▲' : '▼'} Options avancées
      </button>

      {showAdvanced && (
        <div className="advanced-options">
          <div className="option-row">
            <label className="input-label">{"Négatif (à exclure)"}</label>
            <input
              type="text"
              className="text-input"
              placeholder="Ex: texte, signature, watermark"
              disabled={loading}
            />
          </div>
          <div className="option-row">
            <label className="input-label">Ratio</label>
            <select className="select-input" disabled={loading}>
              <option value="1:1">{"1:1 — Carré"}</option>
              <option value="3:4">{"3:4 — Portrait"}</option>
              <option value="4:3">{"4:3 — Paysage"}</option>
              <option value="9:16">{"9:16 — Vertical"}</option>
            </select>
          </div>
        </div>
      )}

      {error && (
        <div className="ai-error">
          <span>❌</span> {error}
        </div>
      )}

      <button
        className={`btn-generate ${loading ? 'loading' : ''}`}
        onClick={handleSubmit}
        disabled={!prompt.trim() || loading}
      >
        {loading ? (
          <span>{"Génération en cours…"}</span>
        ) : (
          <span>{"✦ Générer le design IA"}</span>
        )}
      </button>

      <p className="ai-disclaimer">
        {"Généré avec Gemini Imagen 3 · Droits d'usage commercial inclus"}
      </p>
    </div>
  );
}