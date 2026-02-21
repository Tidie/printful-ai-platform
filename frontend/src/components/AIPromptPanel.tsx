/**
 * AIPromptPanel.tsx — Panneau de génération IA
 * Avec upload de photos de référence (visages, animaux, etc.)
 */

import { useState, useRef, useCallback } from 'react';

interface RefImage {
  id: string;
  file: File;
  preview: string;
  base64: string;
  mimeType: string;
}

interface Props {
  onGenerate: (prompt: string, style: string, negativePrompt: string, aspectRatio: string, refImages: RefImage[]) => void;
  loading: boolean;
  error: string | null;
  activePlacement: string;
  placement?: any;
}

const STYLES = [
  { id: 'illustration', label: 'Illustration', emoji: '🎨' },
  { id: 'realistic',    label: 'Réaliste',     emoji: '📸' },
  { id: 'abstract',     label: 'Abstrait',      emoji: '🌀' },
  { id: 'pixel-art',   label: 'Pixel Art',     emoji: '🕹️' },
  { id: 'watercolor',  label: 'Aquarelle',     emoji: '💧' },
];

const PROMPT_PRESETS = [
  { label: '🌿 Nature',   prompt: 'Forêt enchantée avec des champignons lumineux et des fées' },
  { label: '🐉 Fantasy',  prompt: 'Dragon majestueux volant au-dessus de montagnes rocheuses' },
  { label: '🌊 Océan',    prompt: 'Baleine bleue majestueuse dans les profondeurs de l\'océan' },
  { label: '🌙 Cosmos',   prompt: 'Galaxie spirale avec nébuleuse colorée et étoiles filantes' },
  { label: '🌸 Japonais', prompt: 'Cerisiers en fleurs avec Mont Fuji au coucher de soleil' },
  { label: '🦁 Animal',   prompt: 'Portrait géométrique de lion en style low-poly coloré' },
];

const ASPECT_RATIOS = [
  { value: '1:1',  label: '1:1 — Carré' },
  { value: '3:4',  label: '3:4 — Portrait' },
  { value: '4:3',  label: '4:3 — Paysage' },
  { value: '9:16', label: '9:16 — Vertical' },
];

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AIPromptPanel({ onGenerate, loading, error, activePlacement, placement }: Props) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('illustration');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [refImages, setRefImages] = useState<RefImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEmbroidery = placement?.techniques?.some((t: any) => t.id === 'embroidery');

  const addImages = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const remaining = 3 - refImages.length;
    const toAdd = arr.slice(0, remaining);
    if (!toAdd.length) return;

    const newImgs: RefImage[] = await Promise.all(
      toAdd.map(async (file) => {
        const { base64, mimeType } = await fileToBase64(file);
        return {
          id: `${Date.now()}-${Math.random()}`,
          file,
          preview: URL.createObjectURL(file),
          base64,
          mimeType,
        };
      })
    );
    setRefImages(prev => [...prev, ...newImgs].slice(0, 3));
  }, [refImages.length]);

  const removeImage = (id: string) => {
    setRefImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addImages(e.dataTransfer.files);
  };

  const handleSubmit = () => {
    if (!prompt.trim() || loading) return;
    onGenerate(prompt.trim(), style, negativePrompt, aspectRatio, refImages);
  };

  return (
    <div className="ai-prompt-panel">
      <div className="ai-panel-title">Générer avec l'IA</div>
      {placement?.label && (
        <div className="active-zone-badge">Zone : {placement.label}</div>
      )}

      {isEmbroidery && (
        <div style={{ background: '#fff3cd', border: '2px solid #000', padding: '8px 12px', fontSize: 12, fontWeight: 600 }}>
          🧵 Broderie — l'IA adaptera : aplats, max 15 couleurs, sans dégradés
        </div>
      )}

      {/* ── PHOTOS DE RÉFÉRENCE ── */}
      <div>
        <span className="section-label">📸 Photos de référence (optionnel)</span>
        <p style={{ fontSize: 11, opacity: .55, marginBottom: 10, fontWeight: 500, lineHeight: 1.5 }}>
          Glisse jusqu'à 3 photos (visage, animal, objet…) — l'IA les intégrera dans votre design selon votre prompt.
        </p>

        {/* Drop zone */}
        {refImages.length < 3 && (
          <div
            className={`ref-dropzone ${dragging ? 'ref-dropzone--active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => e.target.files && addImages(e.target.files)}
            />
            <div className="ref-dropzone__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
            </div>
            <p className="ref-dropzone__text">
              {dragging ? 'Lâchez ici !' : 'Glisser une photo ou cliquer'}
            </p>
            <p className="ref-dropzone__sub">{3 - refImages.length} emplacement{3 - refImages.length > 1 ? 's' : ''} disponible{3 - refImages.length > 1 ? 's' : ''}</p>
          </div>
        )}

        {/* Preview images */}
        {refImages.length > 0 && (
          <div className="ref-images">
            {refImages.map(img => (
              <div key={img.id} className="ref-image-item">
                <img src={img.preview} alt="référence" className="ref-image-thumb" />
                <button
                  className="ref-image-remove"
                  onClick={() => removeImage(img.id)}
                  title="Supprimer"
                >×</button>
              </div>
            ))}
            {refImages.length > 0 && (
              <p style={{ fontSize: 10, opacity: .45, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 6 }}>
                IA utilisera {refImages.length} photo{refImages.length > 1 ? 's' : ''} comme référence
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── PROMPT ── */}
      <div>
        <label className="section-label">Décrivez votre design</label>
        <textarea
          className="prompt-textarea"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={refImages.length > 0
            ? 'Ex: Mettez ce personnage dans une forêt enchantée style illustration…'
            : 'Ex: Un renard stylisé dans une forêt d\'automne avec des feuilles dorées…'}
          rows={4}
          disabled={loading}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(); }}
        />
        <span className="prompt-shortcut">⌘+Entrée pour générer</span>
      </div>

      {/* ── STYLE ── */}
      <div>
        <label className="section-label">Style artistique</label>
        <div className="style-grid">
          {STYLES.map(s => (
            <button
              key={s.id}
              className={`style-btn ${style === s.id ? 'active' : ''}`}
              onClick={() => setStyle(s.id)}
              disabled={loading}
            >
              <span>{s.emoji}</span> {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── INSPIRATIONS ── */}
      <div>
        <label className="section-label">Inspirations rapides</label>
        <div className="presets-grid">
          {PROMPT_PRESETS.map(p => (
            <button
              key={p.label}
              className="preset-btn"
              onClick={() => setPrompt(p.prompt)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ADVANCED ── */}
      <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? '▲' : '▼'} OPTIONS AVANCÉES
      </button>

      {showAdvanced && (
        <div className="advanced-options">
          <div className="option-row">
            <label className="section-label">Négatif (à exclure)</label>
            <input
              type="text"
              className="text-input"
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="Ex: texte, signature, watermark"
              disabled={loading}
            />
          </div>
          <div className="option-row">
            <label className="section-label">Ratio</label>
            <select
              className="select-input"
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value)}
              disabled={loading}
            >
              {ASPECT_RATIOS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {error && (
        <div className="ai-error">
          <span>❌</span> {error}
        </div>
      )}

      {/* ── GENERATE ── */}
      <div className="btn-generate-wrap">
        <button
          className={`btn-generate ${loading ? 'loading' : ''}`}
          onClick={handleSubmit}
          disabled={!prompt.trim() || loading}
        >
          {loading ? (
            <><span className="spinner-small" /> Génération en cours…</>
          ) : (
            <>✦ GÉNÉRER LE DESIGN IA</>
          )}
        </button>
      </div>

      <p className="ai-disclaimer">
        Généré avec Gemini 2.0 Flash · Droits d'usage commercial inclus
      </p>
    </div>
  );
}
