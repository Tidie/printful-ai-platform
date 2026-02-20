/**
 * CustomizationStudio.tsx
 * 
 * Interface de personnalisation avec :
 * - Canvas Fabric.js pour superposer l'image IA sur le mockup produit
 * - Gestion multi-zone (devant, dos, manches)
 * - Génération IA avec prompt
 * - Contraintes techniques par zone (embroidery vs DTG)
 * - Export HD pour Printful
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { PrintZoneManager } from './PrintZoneManager';
import { AIPromptPanel } from './AIPromptPanel';
import { useMockupGenerator } from '../hooks/useMockupGenerator';

interface Props {
  product: any;
  variant: any;
  onComplete: (data: any) => void;
  onBack: () => void;
}

export function CustomizationStudio({ product, variant, onComplete, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  const [productDetails, setProductDetails] = useState<any>(null);
  const [activePlacement, setActivePlacement] = useState<string>('front');
  const [placements, setPlacements] = useState<Record<string, any>>({}); // placement → {fabricJSON, aiImageUrl, hdUrl}
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [generatingMockup, setGeneratingMockup] = useState(false);

  const { generateMockup } = useMockupGenerator();

  // ─── Init Fabric.js ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 500,
      height: 500,
      backgroundColor: '#f8f8f8',
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;

    // Guides visuels de la zone d'impression
    drawPrintAreaGuide(canvas, activePlacement);

    return () => {
      canvas.dispose();
    };
  }, []);

  // ─── Changement de placement ───────────────────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Sauvegarde l'état du canvas actuel
    if (activePlacement) {
      setPlacements(prev => ({
        ...prev,
        [activePlacement]: {
          ...prev[activePlacement],
          fabricJSON: canvas.toJSON(),
        },
      }));
    }

    // Restaure le canvas du nouveau placement
    canvas.clear();
    const saved = placements[activePlacement];
    if (saved?.fabricJSON) {
      canvas.loadFromJSON(saved.fabricJSON, () => canvas.renderAll());
    } else {
      drawPrintAreaGuide(canvas, activePlacement);
    }
  }, [activePlacement]);

  // ─── Génération IA ─────────────────────────────────────────────────────────

  const handleGenerateAI = useCallback(async (prompt: string, style: string) => {
    setGeneratingAI(true);
    setAiError(null);
    setMockupUrl(null);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, printPlacement: activePlacement }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur de génération');
      }

      const data = await res.json();
      const { url, hdUrl } = data;

      // Charge l'image sur le canvas Fabric.js
      await loadImageOnCanvas(url, fabricRef.current!, activePlacement);

      // Stocke les URLs pour l'export final
      setPlacements(prev => ({
        ...prev,
        [activePlacement]: {
          ...prev[activePlacement],
          aiImageUrl: url,
          hdUrl,
          fabricJSON: fabricRef.current!.toJSON(),
        },
      }));

      // Génère un mockup prévisuel
      await handleGenerateMockup(url);

    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setGeneratingAI(false);
    }
  }, [activePlacement, variant]);

  const handleGenerateMockup = async (imageUrl: string) => {
    if (!variant?.id) return;
    setGeneratingMockup(true);
    try {
      const mockups = await generateMockup(variant.id, [{
        placement: activePlacement,
        url: imageUrl,
      }]);
      if (mockups?.[0]?.mockup_url) {
        setMockupUrl(mockups[0].mockup_url);
      }
    } catch (e) {
      console.error('Mockup error:', e);
    } finally {
      setGeneratingMockup(false);
    }
  };

  // ─── Outils canvas ─────────────────────────────────────────────────────────

  const handleAddText = () => {
    const text = new fabric.IText('Votre texte', {
      left: 150, top: 150,
      fontSize: 32,
      fill: '#000000',
      fontFamily: 'Arial',
      fontWeight: 'bold',
    });
    fabricRef.current?.add(text).setActiveObject(text);
  };

  const handleScaleAll = (factor: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach(obj => {
      if (obj.type !== 'rect') { // ne pas scaler le guide
        obj.scale((obj.scaleX || 1) * factor);
      }
    });
    canvas.renderAll();
  };

  const handleClearCanvas = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const guide = canvas.getObjects('rect')[0]; // garde le guide
    canvas.clear();
    if (guide) canvas.add(guide);
    canvas.renderAll();
    setPlacements(prev => ({
      ...prev,
      [activePlacement]: { ...prev[activePlacement], aiImageUrl: null, hdUrl: null },
    }));
    setMockupUrl(null);
  };

  // ─── Export Final ──────────────────────────────────────────────────────────

  const handleComplete = () => {
    // Sauvegarde le placement actif
    const currentJSON = fabricRef.current?.toJSON();
    const currentPlacement = placements[activePlacement] || {};

    const allPlacements = {
      ...placements,
      [activePlacement]: { ...currentPlacement, fabricJSON: currentJSON },
    };

    // Construit la liste des fichiers pour Printful
    const files = Object.entries(allPlacements)
      .filter(([, data]: any) => data?.hdUrl)
      .map(([placement, data]: any) => ({
        placement,
        url: data.aiImageUrl,
        hdUrl: data.hdUrl,
      }));

    if (!files.length) {
      alert('Ajoutez au moins un design avant de continuer.');
      return;
    }

    // Exporte le canvas haute résolution pour la prévisualisation
    const previewDataUrl = fabricRef.current?.toDataURL({ multiplier: 2 });

    onComplete({
      files,
      previewUrl: previewDataUrl,
      mockupUrl,
      placements: Object.keys(allPlacements).filter(p => allPlacements[p]?.hdUrl),
    });
  };

  const activePrintAreas = productDetails?.printAreas || getDefaultPrintAreas(product);

  return (
    <div className="studio-layout">
      {/* ── Left: AI Prompt Panel ── */}
      <aside className="studio-sidebar-left">
        <AIPromptPanel
          onGenerate={handleGenerateAI}
          loading={generatingAI}
          error={aiError}
          activePlacement={activePlacement}
          placement={activePrintAreas.find((a: any) => a.placement === activePlacement)}
        />
      </aside>

      {/* ── Center: Canvas ── */}
      <div className="studio-center">
        {/* Zone selector */}
        <div className="placement-tabs">
          {activePrintAreas.map((area: any) => (
            <button
              key={area.placement}
              className={`placement-tab ${activePlacement === area.placement ? 'active' : ''} ${placements[area.placement]?.hdUrl ? 'has-design' : ''}`}
              onClick={() => setActivePlacement(area.placement)}
            >
              {area.label}
              {placements[area.placement]?.hdUrl && <span className="design-dot" />}
            </button>
          ))}
        </div>

        {/* Canvas principal */}
        <div className="canvas-wrapper">
          {/* Mockup background */}
          {mockupUrl && (
            <div className="mockup-overlay">
              <img src={mockupUrl} alt="Mockup" className="mockup-bg" />
              {generatingMockup && <div className="mockup-loading">Mise à jour…</div>}
            </div>
          )}

          {!mockupUrl && (
            <div className="canvas-placeholder">
              <div className="placeholder-product-img">
                <img src={product.image} alt={product.name} />
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="fabric-canvas" />

          {generatingAI && (
            <div className="ai-generating-overlay">
              <div className="ai-spinner" />
              <p>Génération IA en cours…</p>
            </div>
          )}
        </div>

        {/* Toolbar canvas */}
        <div className="canvas-toolbar">
          <button className="tool-btn" onClick={handleAddText} title="Ajouter du texte">
            <span>T</span> Texte
          </button>
          <button className="tool-btn" onClick={() => handleScaleAll(1.1)} title="Agrandir">
            ⊕ +
          </button>
          <button className="tool-btn" onClick={() => handleScaleAll(0.9)} title="Réduire">
            ⊖ –
          </button>
          <button className="tool-btn tool-btn-danger" onClick={handleClearCanvas}>
            ✕ Effacer
          </button>
        </div>
      </div>

      {/* ── Right: Print Zone Manager ── */}
      <aside className="studio-sidebar-right">
        <PrintZoneManager
          printAreas={activePrintAreas}
          placements={placements}
          activePlacement={activePlacement}
          onPlacementChange={setActivePlacement}
        />

        {/* CTA */}
        <div className="studio-actions">
          <button className="btn-secondary" onClick={onBack}>← Changer de produit</button>
          <button
            className="btn-primary"
            onClick={handleComplete}
            disabled={!Object.values(placements).some((p: any) => p?.hdUrl)}
          >
            Passer à la commande →
          </button>
        </div>

        {/* Résumé variante */}
        {variant && (
          <div className="variant-summary">
            <div className="variant-color" style={{ backgroundColor: variant.color_code }} />
            <div>
              <p className="variant-name">{variant.name}</p>
              <p className="variant-price">{variant.price}€</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadImageOnCanvas(url: string, canvas: fabric.Canvas, placement: string) {
  return new Promise<void>((resolve, reject) => {
    fabric.Image.fromURL(url, (img) => {
      if (!img) { reject(new Error('Image load failed')); return; }

      // Adapte la taille à la zone d'impression
      const maxSize = placement === 'all-over' ? 500 : 250;
      const scale = Math.min(maxSize / img.width!, maxSize / img.height!);

      img.set({
        left: (canvas.width! - img.width! * scale) / 2,
        top: (canvas.height! - img.height! * scale) / 2,
        scaleX: scale,
        scaleY: scale,
        cornerColor: '#6366f1',
        cornerStyle: 'circle',
        transparentCorners: false,
      });

      // Supprime les anciennes images IA (garde les textes)
      const existing = canvas.getObjects('image');
      existing.forEach(obj => canvas.remove(obj));

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      resolve();
    }, { crossOrigin: 'anonymous' });
  });
}

function drawPrintAreaGuide(canvas: fabric.Canvas, placement: string) {
  // Zone d'impression recommandée visualisée en pointillés
  const zoneConfigs: Record<string, { left: number; top: number; width: number; height: number }> = {
    'front': { left: 150, top: 100, width: 200, height: 250 },
    'back': { left: 150, top: 100, width: 200, height: 250 },
    'left-sleeve': { left: 80, top: 120, width: 80, height: 180 },
    'right-sleeve': { left: 340, top: 120, width: 80, height: 180 },
    'pocket-area': { left: 170, top: 140, width: 80, height: 80 },
    'all-over': { left: 20, top: 20, width: 460, height: 460 },
  };

  const config = zoneConfigs[placement] || zoneConfigs['front'];

  const guide = new fabric.Rect({
    ...config,
    fill: 'transparent',
    stroke: '#6366f1',
    strokeWidth: 1.5,
    strokeDashArray: [6, 4],
    selectable: false,
    evented: false,
    hoverCursor: 'default',
    data: { isGuide: true },
  });

  canvas.add(guide);

  // Label de la zone
  const label = new fabric.Text(getZoneLabel(placement), {
    left: config.left,
    top: config.top - 22,
    fontSize: 11,
    fill: '#6366f1',
    selectable: false,
    evented: false,
    fontFamily: 'monospace',
  });
  canvas.add(label);
  canvas.renderAll();
}

function getZoneLabel(placement: string): string {
  const labels: Record<string, string> = {
    'front': 'Zone avant · recommandée',
    'back': 'Zone dos · recommandée',
    'left-sleeve': 'Manche gauche',
    'right-sleeve': 'Manche droite',
    'pocket-area': 'Zone poche',
    'all-over': 'All-over · zone totale',
    'embroidery-front': 'Zone broderie',
  };
  return labels[placement] || placement;
}

function getDefaultPrintAreas(product: any) {
  // Zones par défaut si l'API ne retourne pas les détails
  return [
    { placement: 'front', label: 'Devant', techniques: [{ id: 'dtg', name: 'Impression DTG' }], constraints: { width: 12, height: 16 } },
    { placement: 'back', label: 'Dos', techniques: [{ id: 'dtg', name: 'Impression DTG' }], constraints: { width: 12, height: 16 } },
  ];
}
