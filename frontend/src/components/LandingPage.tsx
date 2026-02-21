import { useEffect, useState } from 'react';

interface Props {
  onStart: () => void;
}

export function LandingPage({ onStart }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.reveal-text').forEach(el => observer.observe(el));
    // Magnetic buttons
    const onMove = (e: MouseEvent) => {
      document.querySelectorAll<HTMLElement>('.lp-btn--magnetic').forEach(btn => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        if (Math.abs(x) < 120 && Math.abs(y) < 120) {
          btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
        } else {
          btn.style.transform = 'translate(0,0)';
        }
      });
    };
    document.addEventListener('mousemove', onMove);
    return () => {
      observer.disconnect();
      document.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <div className="lp noise">
      {/* ── NAVIGATION ── */}
      <nav className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
        <div className="lp-nav__inner">
          <div className="lp-logo">
            <div className="lp-logo__icon">M</div>
            <span className="lp-logo__name">PRINTAI STUDIO</span>
          </div>
          <div className="lp-nav__links">
            <a href="#how">Comment ça marche</a>
            <a href="#showcase">Showcase</a>
            <a href="#pricing">Tarifs</a>
          </div>
          <button className="pop-card lp-btn--nav" onClick={onStart}>
            COMMENCER
          </button>
        </div>
      </nav>

      <main>
        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero__blob lp-hero__blob--pink" />
          <div className="lp-hero__blob lp-hero__blob--blue" />
          <div className="lp-hero__inner">
            <div className="lp-hero__left">
              <div className="lp-badge">🎨 Usine IA · Propulsé par Printful</div>
              <h1 className="lp-h1">
                De l'<span className="lp-h1--orange">Idée</span> au Produit en{' '}
                <span className="lp-h1--blue">60 Secondes.</span>
              </h1>
              <p className="lp-hero__sub">
                Uploadez une photo ou décrivez votre rêve. Notre IA le transforme en merch
                professionnel, et <strong>Printful</strong> le livre à votre porte. Automatiquement.
              </p>
              <div className="lp-hero__ctas">
                <div className="lp-hyper-border">
                  <button className="lp-btn--hero lp-btn--magnetic" onClick={onStart}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    </svg>
                    GÉNÉRER MON DESIGN
                  </button>
                </div>
                <p className="lp-online">
                  <span className="lp-pulse" />
                  IA en ligne · Gratuit pour commencer
                </p>
              </div>
            </div>

            <div className="lp-hero__right">
              <div className="pop-card lp-hero-card lp-float">
                <div className="lp-hero-card__img" style={{ background: 'linear-gradient(135deg,#FF5C00,#FF00A8 50%,#00E0FF)' }}>
                  <span style={{ fontSize: 80 }}>✦</span>
                </div>
                <div className="lp-hero-card__body">
                  <span className="lp-hero-card__tag">IA · Générée en 3s</span>
                  <p className="lp-hero-card__title">Votre design unique</p>
                  <span className="lp-hero-card__badge">PRÊT À IMPRIMER</span>
                </div>
              </div>
              <div className="pop-card lp-sticker lp-sticker--a">
                <div className="lp-sticker__n">48+</div>
                <div className="lp-sticker__l">Produits</div>
              </div>
              <div className="pop-card lp-sticker lp-sticker--b">
                <div className="lp-sticker__n">3s</div>
                <div className="lp-sticker__l">Génération</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how" className="lp-section lp-how">
          <div className="lp-section__inner">
            <p className="lp-overtitle">SIMPLE COMME BONJOUR</p>
            <h2 className="lp-h2 reveal-text">3 étapes. <em>C'est tout.</em></h2>
            <div className="lp-how__grid">
              {[
                { num: '01', col: '#FFEA00', title: 'Décrivez', desc: 'Tapez votre idée ou uploadez une photo. Notre IA comprend tout.' },
                { num: '02', col: '#00E0FF', title: 'Personnalisez', desc: 'Choisissez parmi 48+ produits, couleurs et tailles.' },
                { num: '03', col: '#FF5C00', title: 'Commandez', desc: 'Printful imprime et livre directement à votre porte.' },
              ].map(s => (
                <div key={s.num} className="pop-card lp-how__card">
                  <div className="lp-how__num" style={{ background: s.col }}>{s.num}</div>
                  <h3 className="lp-how__title">{s.title}</h3>
                  <p className="lp-how__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRODUCT SHOWCASE ── */}
        <section id="showcase" className="lp-section lp-showcase">
          <div className="lp-section__inner">
            <div className="lp-showcase__head">
              <div>
                <p className="lp-overtitle">UN DESIGN, MILLE PRODUITS</p>
                <h2 className="lp-h2">
                  Choisissez votre{' '}
                  <span className="lp-h2__chip" style={{ background: '#00E0FF' }}>support.</span>
                </h2>
              </div>
            </div>
            <div className="lp-showcase__grid">
              {[
                { label: 'Le T-Shirt Classique', price: 'À partir de 18€', bg: 'rgba(255,92,0,0.1)', emoji: '👕' },
                { label: 'Mug Céramique',        price: 'À partir de 12€', bg: 'rgba(0,224,255,0.1)', emoji: '☕', offset: true },
                { label: 'Poster Museum',         price: 'À partir de 24€', bg: 'rgba(255,0,168,0.1)', emoji: '🖼️' },
                { label: 'Tote Bag Eco',          price: 'À partir de 15€', bg: 'rgba(255,234,0,0.2)', emoji: '👜', offset: true },
              ].map(p => (
                <div key={p.label} className={`lp-product ${p.offset ? 'lp-product--off' : ''}`} onClick={onStart}>
                  <div className="pop-card lp-product__img" style={{ background: p.bg }}>
                    <span style={{ fontSize: 72 }}>{p.emoji}</span>
                  </div>
                  <h4 className="lp-product__name">{p.label}</h4>
                  <p className="lp-product__price">{p.price} · IA Optimisé</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="lp-cta-wrap">
          <div className="lp-cta">
            <div className="lp-cta__deco lp-cta__deco--tl" />
            <div className="lp-cta__deco lp-cta__deco--br" />
            <h2 className="lp-cta__title">PRÊT À JOUER ?</h2>
            <p className="lp-cta__sub">
              Votre premier design vous attend. Sans carte bancaire, sans formulaire ennuyeux. Juste de la créativité pure.
            </p>
            <div className="lp-cta__actions">
              <button className="pop-card lp-btn--cta" onClick={onStart}>
                GÉNÉRER MAINTENANT
              </button>
              <p className="lp-online">
                <span className="lp-pulse" />
                Moteur IA actif
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer__grid">
          <div className="lp-footer__brand">
            <div className="lp-footer__logo">
              <div className="lp-logo__icon">M</div>
              <span>PRINTAI STUDIO</span>
            </div>
            <p className="lp-footer__tag">
              Le pont entre votre imagination et votre boîte aux lettres. Propulsé par Printful.
            </p>
          </div>
          {[
            { title: 'Plateforme', links: ['Outils IA', 'Tarifs', 'Sync Printful', 'Commandes en gros'] },
            { title: 'Réseaux',    links: ['TikTok', 'Instagram', 'Discord', 'Support'] },
          ].map(col => (
            <div key={col.title} className="lp-footer__col">
              <h5>{col.title}</h5>
              <ul>
                {col.links.map(l => <li key={l}><a href="#" onClick={l === 'Outils IA' ? onStart : undefined}>{l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="lp-footer__bottom">
          <p>© 2025 PrintAI Studio Inc. Fait pour les humains.</p>
          <div className="lp-footer__legal">
            <a href="#">Confidentialité</a>
            <a href="#">CGU</a>
            <a href="#">Cookies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
