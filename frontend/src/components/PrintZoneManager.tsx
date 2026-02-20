/**
 * PrintZoneManager.tsx
 * 
 * Affiche les zones d'impression disponibles, leurs contraintes techniques,
 * et l'état du design (vide / avec image).
 * 
 * Gère les différences entre :
 * - DTG (Direct to Garment) : couleurs illimitées, photo OK
 * - Broderie : max 15 couleurs, pas de dégradés, résolution réduite
 * - All-Over : impression totale, fichier très grand (min 4500×5400px)
 * - Sérigraphie : couleurs limitées, coûts fixes
 */

interface PrintArea {
  placement: string;
  label: string;
  techniques: Array<{ id: string; name: string; colors?: number }>;
  constraints: { width?: number; height?: number };
}

interface Props {
  printAreas: PrintArea[];
  placements: Record<string, any>;
  activePlacement: string;
  onPlacementChange: (placement: string) => void;
}

// Contraintes et avertissements par technique
const TECHNIQUE_CONSTRAINTS: Record<string, {
  icon: string;
  color: string;
  warnings: string[];
  recommendations: string[];
  minDPI: number;
}> = {
  'dtg': {
    icon: '🖨️',
    color: '#4f46e5',
    warnings: [],
    recommendations: ['PNG avec fond transparent', 'Minimum 150 DPI, idéalement 300 DPI', 'Couleurs vives recommandées'],
    minDPI: 150,
  },
  'embroidery': {
    icon: '🧵',
    color: '#d97706',
    warnings: [
      'Maximum 15 couleurs de fil',
      'Pas de dégradés ni d\'ombres',
      'Pas de très petits détails (< 4mm)',
      'Texte minimum 4mm de hauteur',
    ],
    recommendations: ['Design simple avec aplats de couleur', 'Contraste élevé', 'Vecteur SVG préféré'],
    minDPI: 300,
  },
  'all-over-print': {
    icon: '🌊',
    color: '#0891b2',
    warnings: [
      'Fichier très grand requis (min 4500×5400px)',
      'Coutures et plis peuvent déformer le motif',
    ],
    recommendations: ['Motif répétitif ou illustration full-coverage', 'Résolution min. 150 DPI sur surface totale'],
    minDPI: 150,
  },
  'sublimation': {
    icon: '✨',
    color: '#7c3aed',
    warnings: ['Uniquement sur tissu polyester blanc ou clair'],
    recommendations: ['Couleurs vives, dégradés OK', 'PNG haute résolution'],
    minDPI: 200,
  },
  'screenprint': {
    icon: '🎨',
    color: '#be185d',
    warnings: [
      'Maximum 6 couleurs (coût par couleur)',
      'Pas de photos ni dégradés',
      'Vectoriel requis (SVG, AI, PDF)',
    ],
    recommendations: ['Design simple 1-3 couleurs pour réduire les coûts', 'Vectoriel obligatoire'],
    minDPI: 300,
  },
};

export function PrintZoneManager({ printAreas, placements, activePlacement, onPlacementChange }: Props) {
  return (
    <div className="print-zone-manager">
      <h3 className="pzm-title">Zones & Techniques</h3>

      <div className="print-zones-list">
        {printAreas.map((area) => {
          const hasDesign = !!placements[area.placement]?.hdUrl;
          const isActive = area.placement === activePlacement;

          return (
            <div
              key={area.placement}
              className={`pz-card ${isActive ? 'pz-active' : ''} ${hasDesign ? 'pz-has-design' : ''}`}
              onClick={() => onPlacementChange(area.placement)}
            >
              <div className="pz-header">
                <div className="pz-label">
                  {hasDesign ? (
                    <span className="pz-done-badge">✓</span>
                  ) : (
                    <span className="pz-empty-badge" />
                  )}
                  <span className="pz-name">{area.label}</span>
                </div>
                {area.constraints.width && (
                  <span className="pz-size-badge">
                    {area.constraints.width}" × {area.constraints.height}"
                  </span>
                )}
              </div>

              {/* Techniques disponibles */}
              <div className="pz-techniques">
                {area.techniques.map((technique) => {
                  const config = TECHNIQUE_CONSTRAINTS[technique.id];
                  return (
                    <div key={technique.id} className="technique-item">
                      <span
                        className="technique-icon"
                        style={{ color: config?.color }}
                      >
                        {config?.icon || '🔧'}
                      </span>
                      <span className="technique-name">{technique.name}</span>
                      {technique.colors && (
                        <span className="technique-colors">max {technique.colors} couleurs</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Contraintes et recommandations (affichées si zone active) */}
              {isActive && (
                <div className="pz-constraints">
                  {area.techniques.map((technique) => {
                    const config = TECHNIQUE_CONSTRAINTS[technique.id];
                    if (!config) return null;
                    return (
                      <div key={technique.id} className="constraints-block">
                        {config.warnings.length > 0 && (
                          <div className="constraints-warnings">
                            <p className="constraints-label">⚠️ Contraintes</p>
                            <ul>
                              {config.warnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {config.recommendations.length > 0 && (
                          <div className="constraints-recs">
                            <p className="constraints-label">💡 Recommandations</p>
                            <ul>
                              {config.recommendations.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="dpi-requirement">
                          📐 DPI minimum : <strong>{config.minDPI} DPI</strong>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Légende DPI */}
      <div className="dpi-legend">
        <h4>Guide résolution</h4>
        <div className="dpi-item"><span className="dpi-dot dpi-ok" /> ≥ 300 DPI : Parfait</div>
        <div className="dpi-item"><span className="dpi-dot dpi-warn" /> 150–299 DPI : Acceptable</div>
        <div className="dpi-item"><span className="dpi-dot dpi-bad" /> &lt; 150 DPI : Insuffisant</div>
      </div>
    </div>
  );
}
