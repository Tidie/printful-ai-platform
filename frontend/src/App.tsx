import { useState } from 'react';
import { ProductCatalog } from './components/ProductCatalog';
import { CustomizationStudio } from './components/CustomizationStudio';
import { CheckoutFlow } from './components/CheckoutFlow';

type Step = 'catalog' | 'studio' | 'checkout';

export default function App() {
  const [step, setStep] = useState<Step>('catalog');
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

  const stepIndex = ['catalog', 'studio', 'checkout'].indexOf(step);

  return (
    <div className="app">
      <nav className="progress-nav">
        <div className="progress-inner">
          <div className="brand">
            <span className="brand-icon">✦</span>
            <span>PrintAI Studio</span>
          </div>
          <div className="steps">
            {(['catalog', 'studio', 'checkout'] as Step[]).map((s, i) => (
              <div key={s} className={`step ${step === s ? 'active' : ''} ${stepIndex > i ? 'done' : ''}`}>
                <span className="step-num">{i + 1}</span>
                <span className="step-label">
                  {{ catalog: 'Produit', studio: 'Design', checkout: 'Commande' }[s]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </nav>

      <main className="main-content">
        {step === 'catalog' && (
          <ProductCatalog onSelect={handleProductSelect} />
        )}
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