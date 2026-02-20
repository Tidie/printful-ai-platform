import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface Props {
  product: any;
  variant: any;
  designData: any;
  onBack: () => void;
}

interface ShippingForm {
  name: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  phone: string;
}

export function CheckoutFlow({ product, variant, designData, onBack }: Props) {
  const [shippingRates, setShippingRates] = useState<any[]>([]);
  const [selectedRate, setSelectedRate] = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [step, setStep] = useState<'shipping' | 'payment' | 'confirmation'>('shipping');

  const [shipping, setShipping] = useState<ShippingForm>({
    name: '', email: '', address1: '', address2: '',
    city: '', state: '', country: 'FR', zip: '', phone: '',
  });

  const price = parseFloat(variant?.price || '0');
  const total = price + parseFloat(selectedRate?.rate || '0');

  const handleShippingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingRates(true);
    try {
      const res = await fetch('/api/printful/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { ...shipping },
          items: [{ variantId: variant.id, quantity: 1 }],
        }),
      });
      const data = await res.json();
      setShippingRates(data.rates || []);
      if (data.rates?.length) setSelectedRate(data.rates[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRates(false);
    }
  };

  const handleCreatePaymentIntent = async () => {
    if (!selectedRate) return;
    setLoadingPayment(true);
    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            variantId: variant.id,
            quantity: 1,
            name: `${product.name} - ${variant.name}`,
            retailPrice: price.toFixed(2),
            files: designData.files,
          }],
          recipient: shipping,
          shippingRate: selectedRate,
          currency: 'eur',
        }),
      });
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setStep('payment');
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <div className="checkout-layout">

      {/* ── Résumé commande ── */}
      <div className="checkout-summary">
        <h3>Résumé de commande</h3>

        <div className="order-preview">
          {designData.mockupUrl
            ? <img src={designData.mockupUrl} alt="Votre design" className="order-preview-img" />
            : <img src={designData.previewUrl} alt="Design" className="order-preview-img" />
          }
        </div>

        <div className="order-details">
          <div className="order-detail-row">
            <span>{product.name}</span>
            <span>{price.toFixed(2)} €</span>
          </div>
          <div className="order-detail-row text-muted">
            <span>{variant.name}</span>
          </div>
          <div className="order-detail-row text-muted">
            <span>Zones : {designData.placements.join(', ')}</span>
          </div>
          {selectedRate && (
            <div className="order-detail-row">
              <span>Livraison ({selectedRate.name})</span>
              <span>{parseFloat(selectedRate.rate).toFixed(2)} €</span>
            </div>
          )}
          <div className="order-total-row">
            <span>Total</span>
            <span>{total.toFixed(2)} €</span>
          </div>
        </div>

        <div className="trust-badges">
          <span>🔒 Paiement sécurisé</span>
          <span>🚚 Impression & livraison Printful</span>
          <span>↩️ Remboursement si erreur d'impression</span>
        </div>
      </div>

      {/* ── Formulaire ── */}
      <div className="checkout-form">
        <button className="back-link" onClick={onBack}>← Modifier le design</button>

        {step === 'shipping' && (
          <div className="checkout-step">
            <h3>Informations de livraison</h3>
            <form onSubmit={handleShippingSubmit} className="shipping-form">

              <div className="form-row">
                <div className="form-field">
                  <label>Nom complet *</label>
                  <input required value={shipping.name}
                    onChange={e => setShipping(p => ({ ...p, name: e.target.value }))}
                    placeholder="Jean Dupont" />
                </div>
                <div className="form-field">
                  <label>Email *</label>
                  <input type="email" required value={shipping.email}
                    onChange={e => setShipping(p => ({ ...p, email: e.target.value }))}
                    placeholder="jean@exemple.fr" />
                </div>
              </div>

              <div className="form-field">
                <label>Adresse *</label>
                <input required value={shipping.address1}
                  onChange={e => setShipping(p => ({ ...p, address1: e.target.value }))}
                  placeholder="12 Rue de la Paix" />
              </div>

              <div className="form-field">
                <label>Complément d'adresse</label>
                <input value={shipping.address2}
                  onChange={e => setShipping(p => ({ ...p, address2: e.target.value }))}
                  placeholder="Bât. B, Apt. 42" />
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Code postal *</label>
                  <input required value={shipping.zip}
                    onChange={e => setShipping(p => ({ ...p, zip: e.target.value }))}
                    placeholder="75001" />
                </div>
                <div className="form-field">
                  <label>Ville *</label>
                  <input required value={shipping.city}
                    onChange={e => setShipping(p => ({ ...p, city: e.target.value }))}
                    placeholder="Paris" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Pays *</label>
                  <select value={shipping.country}
                    onChange={e => setShipping(p => ({ ...p, country: e.target.value }))}>
                    <option value="FR">France</option>
                    <option value="BE">Belgique</option>
                    <option value="CH">Suisse</option>
                    <option value="DE">Allemagne</option>
                    <option value="ES">Espagne</option>
                    <option value="IT">Italie</option>
                    <option value="GB">Royaume-Uni</option>
                    <option value="US">États-Unis</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Téléphone</label>
                  <input value={shipping.phone}
                    onChange={e => setShipping(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+33 6 12 34 56 78" />
                </div>
              </div>

              <button type="submit" className="btn-primary btn-full" disabled={loadingRates}>
                {loadingRates ? 'Calcul des frais…' : 'Voir les options de livraison →'}
              </button>
            </form>

            {shippingRates.length > 0 && (
              <div className="shipping-rates">
                <h4>Mode de livraison</h4>
                {shippingRates.map(rate => (
                  <label key={rate.id} className={`rate-option ${selectedRate?.id === rate.id ? 'selected' : ''}`}>
                    <input type="radio" name="shipping"
                      checked={selectedRate?.id === rate.id}
                      onChange={() => setSelectedRate(rate)} />
                    <div className="rate-info">
                      <span className="rate-name">{rate.name}</span>
                      <span className="rate-delay">{rate.minDeliveryDays}–{rate.maxDeliveryDays} jours ouvrés</span>
                    </div>
                    <span className="rate-price">{parseFloat(rate.rate).toFixed(2)} €</span>
                  </label>
                ))}

                <button className="btn-primary btn-full"
                  onClick={handleCreatePaymentIntent}
                  disabled={!selectedRate || loadingPayment}>
                  {loadingPayment ? 'Préparation…' : 'Procéder au paiement →'}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'payment' && clientSecret && (
          <div className="checkout-step">
            <h3>Paiement sécurisé</h3>
            <Elements stripe={stripePromise} options={{ clientSecret, locale: 'fr' }}>
              <PaymentForm total={total} onSuccess={() => setStep('confirmation')} />
            </Elements>
          </div>
        )}

        {step === 'confirmation' && (
          <div className="checkout-confirmation">
            <div className="confirmation-icon">✅</div>
            <h2>Commande confirmée !</h2>
            <p>Votre design a été envoyé à Printful pour impression. Vous recevrez un email de suivi à <strong>{shipping.email}</strong>.</p>
            <p className="confirmation-timeline">
              ⏱ Production 2–7 jours + livraison {selectedRate?.minDeliveryDays}–{selectedRate?.maxDeliveryDays} jours
            </p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Créer un nouveau design
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stripe Payment Form ───────────────────────────────────────────────────────

function PaymentForm({ total, onSuccess }: { total: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/confirmation` },
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message || 'Erreur de paiement');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <PaymentElement />
      {error && <div className="payment-error">❌ {error}</div>}
      <button type="submit" className="btn-primary btn-full btn-pay"
        disabled={!stripe || processing}>
        {processing
          ? <><span className="spinner-small" /> Traitement…</>
          : `🔒 Payer ${total.toFixed(2)} €`
        }
      </button>
    </form>
  );
}