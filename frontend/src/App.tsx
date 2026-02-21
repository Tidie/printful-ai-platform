import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { ProductCatalog } from './components/ProductCatalog';
import { CustomizationStudio } from './components/CustomizationStudio';
import { CheckoutFlow } from './components/CheckoutFlow';
import './index.css';

type Step = 'landing' | 'catalog' | 'studio' | 'checkout';

export default function App() {
  const [step, setStep] = useState<Step>('landing');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [designData, setDesignData] = useState<any>(null);

  const handleProductSelect = (product: any, variant: any) => {
    setSelectedProduct(product);
    setSelectedVariant(variant);
    setStep('studio');
  };

  const handleDesignComplete = (data: any) => {
    setDesignData(data);
    setStep('checkout');
  };

  if (step === 'landing') {
    return <LandingPage onStart={() => setStep('catalog')} />;
  }

  const stepIndex = ['catalog', 'studio', 'checkout'].indexOf(step);

  return (
    <div className="app noise">
      <nav className="app-nav">
        <div className="app-nav__inner">
          <button className="lp-logo" onClick={() => setStep('landing')}>
            <div className="lp-logo__icon">M</div>
            <span className="lp-logo__name">PRINTAI STUDIO</span>
          </button>

          <div className="app-steps">
            {(['catalog', 'studio', 'checkout'] as Step[]).map((s, i) => {
              const labels: Record<string, string> = { catalog: 'Produit', studio: 'Design', checkout: 'Commande' };
              const isActive = step === s;
              const isDone = stepIndex > i;
              return (
                <div key={s} className={`app-step ${isActive ? 'app-step--active' : ''} ${isDone ? 'app-step--done' : ''}`}>
                  <div className="app-step__num">{isDone ? '✓' : i + 1}</div>
                  <span className="app-step__label">{labels[s]}</span>
                </div>
              );
            })}
          </div>

          <div className="app-nav__progress">
            <span className="app-nav__progress-label">Étape {stepIndex + 1} / 3</span>
            <div className="app-nav__bar">
              <div className="app-nav__bar-fill" style={{ width: `${((stepIndex + 1) / 3) * 100}%` }} />
            </div>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {step === 'catalog' && <ProductCatalog onSelect={handleProductSelect} />}
        {step === 'studio' && selectedProduct && (
          <CustomizationStudio
            product={selectedProduct}
            variant={selectedVariant}
            onComplete={handleDesignComplete}
            onBack={() => setStep('catalog')}
          />
        )}
        {step === 'checkout' && designData && (
          <CheckoutFlow
            product={selectedProduct}
            variant={selectedVariant}
            designData={designData}
            onBack={() => setStep('studio')}
          />
        )}
      </main>
    </div>
  );
}
