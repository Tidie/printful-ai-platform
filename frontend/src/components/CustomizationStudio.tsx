import { useState, useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { PrintZoneManager } from './PrintZoneManager';
import { AIPromptPanel } from './AIPromptPanel';
import { useMockupGenerator } from '../hooks/index';

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
  const [placementImages, setPlacementImages] = useState<Record<string, string>>({});
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [activePlacement, setActivePlacement] = useState<string>('');
  const [placements, setPlacements] = useState<Record<string, any>>({});
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [generatingMockup, setGeneratingMockup] = useState(false);

  const { generateMockup } = useMockupGenerator();
  const placementsRef = useRef<Record<string, any>>({});

  // ─── Sync placementsRef ──────────────────────────────────────────────────────
  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  // ─── Fetch détails produit (vraies zones) ─────────────────────────────────

  useEffect(() => {
    const id = product?.id || product?.product?.id;
    if (!id) return;

    setLoadingDetails(true);
    fetch(`/api/printful/products/${id}`)
      .then(r => r.json())
      .then(data => {
        setProductDetails(data);
        if (data.placementImages) setPlacementImages(data.placementImages);
        // Active la première zone disponible
        if (data.printAreas?.length > 0) {
          setActivePlacement(data.printAreas[0].placement);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingDetails(false));
  }, [product]);

  // ─── Init Fabric.js ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: 500,
      height: 500,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
    });

    fabricRef.current = canvas;

    return () => { canvas.dispose(); };
  }, []);

  // ─── Mise à jour canvas quand le placement change ─────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !activePlacement) return;

    canvas.clear();

    // Priorité : image spécifique au placement > image variante > image catalogue
    const productImg = placementImages[activePlacement]
      || placementImages['front']
      || product?.image
      || product?.product?.image_url;

    const finishSetup = () => {
      drawPrintAreaGuide(canvas, activePlacement);
      // Utilise placementsRef pour éviter la closure stale
      const saved = placementsRef.current[activePlacement];
      if (saved?.fabricJSON) {
        // Restaure uniquement les objets selectables (pas le fond)
        const json = saved.fabricJSON;
        const selectableOnly = { ...json, objects: (json.objects || []).filter((o: any) => o.selectable !== false) };
        canvas.loadFromJSON(selectableOnly, () => canvas.renderAll());
      } else {
        canvas.renderAll();
      }
    };

    if (productImg) {
      fabric.Image.fromURL(productImg, (img: fabric.Image) => {
        if (!img) { finishSetup(); return; }
        const scale = Math.min(500 / (img.width || 500), 500 / (img.height || 500));
        img.set({
          left: (500 - (img.width || 0) * scale) / 2,
          top: (500 - (img.height || 0) * scale) / 2,
          scaleX: scale, scaleY: scale,
          opacity: 0.25,
          selectable: false,
          evented: false,
          data: { isBackground: true },
        });
        canvas.add(img);
        finishSetup();
      }, { crossOrigin: 'anonymous' });
    } else {
      finishSetup();
    }
  }, [activePlacement]);

  // ─── Sauvegarde placement courant avant switch ────────────────────────────

  const switchPlacement = (newPlacement: string) => {
    if (fabricRef.current && activePlacement) {
      setPlacements(prev => ({
        ...prev,
        [activePlacement]: {
          ...prev[activePlacement],
          fabricJSON: fabricRef.current!.toJSON(),
        },
      }));
    }
    setActivePlacement(newPlacement);
    setMockupUrl(null);
  };



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

      await loadImageOnCanvas(url, fabricRef.current!, activePlacement);

      setPlacements(prev => ({
        ...prev,
        [activePlacement]: {
          ...prev[activePlacement],
          aiImageUrl: url,
          hdUrl,
          fabricJSON: fabricRef.current!.toJSON(),
        },
      }));

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
      const mockups = await generateMockup(variant.id, [{ placement: activePlacement, url: imageUrl }]);
      if (mockups?.[0]?.mockup_url) setMockupUrl(mockups[0].mockup_url);
    } catch (e) {
      console.error('Mockup error:', e);
    } finally {
      setGeneratingMockup(false);
    }
  };

  // ─── Outils canvas ─────────────────────────────────────────────────────────

  const handleAddText = () => {
    const text = new fabric.IText('Votre texte', {
      left: 150, top: 200, fontSize: 32,
      fill: '#000000', fontFamily: 'Arial', fontWeight: 'bold',
    });
    fabricRef.current?.add(text).setActiveObject(text);
  };

  const handleScaleAll = (factor: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj: fabric.Object) => {
      if (!(obj as any).data?.isGuide && obj.type !== 'image' || (obj as any).selectable) {
        obj.scale(((obj.scaleX || 1) * factor));
      }
    });
    canvas.renderAll();
  };

  const handleClearCanvas = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Garde seulement l'image produit (opacity 0.3) et le guide
    const toRemove = canvas.getObjects().filter((o: fabric.Object) =>
      (o as any).selectable !== false
    );
    toRemove.forEach((o: fabric.Object) => canvas.remove(o));
    canvas.renderAll();
    setPlacements(prev => ({
      ...prev,
      [activePlacement]: { ...prev[activePlacement], aiImageUrl: null, hdUrl: null },
    }));
    setMockupUrl(null);
  };

  // ─── Export Final ──────────────────────────────────────────────────────────

  const handleComplete = () => {
    const currentJSON = fabricRef.current?.toJSON();
    const allPlacements = {
      ...placements,
      [activePlacement]: { ...placements[activePlacement], fabricJSON: currentJSON },
    };

    const files = Object.entries(allPlacements)
      .filter(([, data]: any) => data?.hdUrl)
      .map(([placement, data]: any) => ({ placement, url: data.aiImageUrl, hdUrl: data.hdUrl }));

    if (!files.length) {
      alert('Ajoutez au moins un design avant de continuer.');
      return;
    }

    const previewDataUrl = fabricRef.current?.toDataURL({ multiplier: 2 });
    onComplete({ files, previewUrl: previewDataUrl, mockupUrl, placements: Object.keys(allPlacements).filter(p => allPlacements[p]?.hdUrl) });
  };

  // ─── Zones actives ─────────────────────────────────────────────────────────

  const activePrintAreas = productDetails?.printAreas?.length
    ? productDetails.printAreas
    : [
        { placement: 'front', label: 'Devant', techniques: [{ id: 'dtg', name: 'Impression DTG' }], constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',    techniques: [{ id: 'dtg', name: 'Impression DTG' }], constraints: { width: 12, height: 16 } },
      ];

  const currentArea = activePrintAreas.find((a: any) => a.placement === activePlacement);

  return (
    <div className="studio-layout">
      {/* ── Left: AI Prompt Panel ── */}
      <aside className="studio-sidebar-left">
        <AIPromptPanel
          onGenerate={handleGenerateAI}
          loading={generatingAI}
          error={aiError}
          activePlacement={activePlacement}
          placement={currentArea}
        />
      </aside>

      {/* ── Center: Canvas ── */}
      <div className="studio-center">
        <div className="placement-tabs">
          {activePrintAreas.map((area: any) => (
            <button
              key={area.placement}
              className={`placement-tab ${activePlacement === area.placement ? 'active' : ''} ${placements[area.placement]?.hdUrl ? 'has-design' : ''}`}
              onClick={() => switchPlacement(area.placement)}
            >
              {area.label}
            </button>
          ))}
        </div>

        <div className="canvas-wrapper">
          {mockupUrl && (
            <div className="mockup-overlay">
              <img src={mockupUrl} alt="Mockup" className="mockup-bg" />
              {generatingMockup && <div className="mockup-loading">Mise à jour…</div>}
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

        <div className="canvas-toolbar">
          <button className="tool-btn" onClick={handleAddText}>T Texte</button>
          <button className="tool-btn" onClick={() => handleScaleAll(1.1)}>⊕ +</button>
          <button className="tool-btn" onClick={() => handleScaleAll(0.9)}>⊖ –</button>
          <button className="tool-btn tool-btn-danger" onClick={handleClearCanvas}>✕ Effacer</button>
        </div>
      </div>

      {/* ── Right: Print Zone Manager ── */}
      <aside className="studio-sidebar-right">
        <PrintZoneManager
          printAreas={activePrintAreas}
          placements={placements}
          activePlacement={activePlacement}
          onPlacementChange={switchPlacement}
        />
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
    fabric.Image.fromURL(url, (img: fabric.Image) => {
      if (!img) { reject(new Error('Image load failed')); return; }
      const maxSize = placement.includes('wrist') || placement.includes('chest') ? 120 : 250;
      const scale = Math.min(maxSize / (img.width || 1), maxSize / (img.height || 1));
      img.set({
        left: (500 - (img.width || 0) * scale) / 2,
        top: (500 - (img.height || 0) * scale) / 2,
        scaleX: scale, scaleY: scale,
        cornerColor: '#333',
        cornerStyle: 'circle',
        transparentCorners: false,
      });
      const existing = canvas.getObjects('image').filter((o: fabric.Object) => (o as any).selectable !== false);
      existing.forEach((o: fabric.Object) => canvas.remove(o));
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      resolve();
    }, { crossOrigin: 'anonymous' });
  });
}

function drawPrintAreaGuide(canvas: fabric.Canvas, placement: string) {
  // Zones adaptées aux vrais placements Printful
  const zones: Record<string, { left: number; top: number; width: number; height: number; label: string }> = {
    'front':                    { left: 150, top: 100, width: 200, height: 250, label: 'Zone devant' },
    'back':                     { left: 150, top: 100, width: 200, height: 250, label: 'Zone dos' },
    'embroidery_chest_left':    { left: 140, top: 160, width: 90,  height: 90,  label: 'Poitrine gauche' },
    'embroidery_chest_right':   { left: 270, top: 160, width: 90,  height: 90,  label: 'Poitrine droite' },
    'embroidery_chest_center':  { left: 175, top: 160, width: 150, height: 120, label: 'Poitrine centre' },
    'embroidery_wrist_left':    { left: 60,  top: 300, width: 70,  height: 60,  label: 'Poignet gauche' },
    'embroidery_wrist_right':   { left: 370, top: 300, width: 70,  height: 60,  label: 'Poignet droit' },
    'embroidery_front':         { left: 150, top: 120, width: 180, height: 200, label: 'Broderie devant' },
    'embroidery_back':          { left: 150, top: 120, width: 180, height: 200, label: 'Broderie dos' },
    'embroidery_sleeve_left':   { left: 60,  top: 120, width: 80,  height: 160, label: 'Manche gauche' },
    'embroidery_sleeve_right':  { left: 360, top: 120, width: 80,  height: 160, label: 'Manche droite' },
    'left-sleeve':              { left: 60,  top: 120, width: 80,  height: 160, label: 'Manche gauche' },
    'right-sleeve':             { left: 360, top: 120, width: 80,  height: 160, label: 'Manche droite' },
    'pocket-area':              { left: 170, top: 155, width: 80,  height: 80,  label: 'Zone poche' },
    'all-over':                 { left: 20,  top: 20,  width: 460, height: 460, label: 'All-over' },
  };

  const config = zones[placement] || zones['front'];

  const guide = new fabric.Rect({
    ...config,
    fill: 'rgba(100, 116, 139, 0.06)',
    stroke: '#64748b',
    strokeWidth: 1.5,
    strokeDashArray: [5, 4],
    selectable: false,
    evented: false,
    data: { isGuide: true },
  });

  const label = new fabric.Text(config.label, {
    left: config.left,
    top: config.top - 20,
    fontSize: 11,
    fill: '#64748b',
    selectable: false,
    evented: false,
    fontFamily: 'monospace',
  });

  canvas.add(guide, label);
  canvas.renderAll();
}
