/**
 * BeforeAfterSlider.tsx
 * Slider interactif pour comparer l'image originale et le résultat IA
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  before: string;   // URL image originale (photo uploadée)
  after: string;    // URL image générée (résultat IA)
  beforeLabel?: string;
  afterLabel?: string;
}

export function BeforeAfterSlider({ before, after, beforeLabel = 'ORIGINAL', afterLabel = 'RÉSULTAT IA' }: Props) {
  const [position, setPosition] = useState(50); // 0-100
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x    = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); setDragging(true); };
  const onTouchStart = () => setDragging(true);

  useEffect(() => {
    const onMove = (e: MouseEvent)  => { if (dragging) updatePosition(e.clientX); };
    const onTouchMove = (e: TouchEvent) => { if (dragging) updatePosition(e.touches[0].clientX); };
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, updatePosition]);

  return (
    <div className="ba-slider" ref={containerRef}>
      {/* Image APRÈS (fond, pleine largeur) */}
      <div className="ba-after">
        <img src={after} alt="Résultat IA" draggable={false} />
        <span className="ba-label ba-label--after">{afterLabel}</span>
      </div>

      {/* Image AVANT (clip à gauche du curseur) */}
      <div className="ba-before" style={{ width: `${position}%` }}>
        <img src={before} alt="Original" draggable={false} />
        <span className="ba-label ba-label--before">{beforeLabel}</span>
      </div>

      {/* Ligne + poignée */}
      <div
        className={`ba-handle ${dragging ? 'ba-handle--dragging' : ''}`}
        style={{ left: `${position}%` }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className="ba-handle__line" />
        <div className="ba-handle__grip">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
