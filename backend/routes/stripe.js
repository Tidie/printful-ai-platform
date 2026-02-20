/**
 * Stripe Routes — Paiement + Webhook de commande automatisé
 * 
 * Flux :
 *   1. Client clique "Commander" → POST /create-payment-intent
 *   2. Stripe confirme paiement → Webhook /webhook
 *   3. Webhook : upload fichier HD → crée commande Printful → confirme
 */

import { Router } from 'express';
import Stripe from 'stripe';
import { printfulService } from '../services/printfulService.js';

export const stripeRouter = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ─── Create Payment Intent ────────────────────────────────────────────────────

/**
 * POST /api/stripe/create-payment-intent
 * Body: {
 *   items: [{variantId, quantity, retailPrice, name, files}],
 *   recipient: {...},
 *   shippingRate: {...},
 *   currency: 'eur'
 * }
 */
stripeRouter.post('/create-payment-intent', async (req, res, next) => {
  try {
    const { items, recipient, shippingRate, currency = 'eur' } = req.body;

    // Calcul du montant côté serveur (ne jamais faire confiance au client)
    const itemsTotal = items.reduce((sum, item) => {
      return sum + Math.round(parseFloat(item.retailPrice) * 100 * item.quantity);
    }, 0);

    const shippingAmount = Math.round(parseFloat(shippingRate?.rate || 0) * 100);
    const totalAmount = itemsTotal + shippingAmount;

    // Stocke les données de commande dans les metadata Stripe
    // (max 500 chars par valeur → on sérialise et tronque si nécessaire)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        items: JSON.stringify(items).substring(0, 500),
        recipient_email: recipient.email,
        recipient_name: recipient.name,
      },
      // Les données complètes sont dans shipping (pas de limite stricte)
      shipping: {
        name: recipient.name,
        address: {
          line1: recipient.address1,
          line2: recipient.address2 || '',
          city: recipient.city,
          state: recipient.state,
          country: recipient.country,
          postal_code: recipient.zip,
        },
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: totalAmount,
      currency,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Webhook ──────────────────────────────────────────────────────────────────

/**
 * POST /api/stripe/webhook
 * Reçoit les événements Stripe et déclenche la commande Printful
 * NB: express.raw() est appliqué sur cette route dans server.js
 */
stripeRouter.post('/webhook', async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Stripe webhook signature invalid:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Répondre immédiatement à Stripe (< 30s)
  res.json({ received: true });

  // Traitement asynchrone
  handleWebhookEvent(event).catch(err => {
    console.error('❌ Webhook processing error:', err);
  });
});

async function handleWebhookEvent(event) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      console.warn('⚠️ Payment failed:', event.data.object.id);
      break;

    default:
      console.log(`ℹ️ Unhandled event: ${event.type}`);
  }
}

/**
 * Flux complet post-paiement :
 * 1. Récupère les données de commande depuis les metadata Stripe
 * 2. Upload chaque fichier HD dans la File Library Printful
 * 3. Crée la commande Printful en draft
 * 4. Confirme la commande (passe en production)
 */
async function handlePaymentSuccess(paymentIntent) {
  console.log(`✅ Payment succeeded: ${paymentIntent.id}`);

  try {
    // Récupère les données complètes via l'API Stripe (metadata limitée)
    // En production : utiliser une DB (Redis/Postgres) pour stocker les données de commande
    const fullIntent = await stripe.paymentIntents.retrieve(paymentIntent.id);
    const items = JSON.parse(fullIntent.metadata.items || '[]');
    const shipping = fullIntent.shipping;

    if (!items.length) {
      console.error('❌ No items found in payment intent metadata:', paymentIntent.id);
      return;
    }

    // ── Étape 1 : Upload des fichiers HD ─────────────────────────────────────
    console.log(`📁 Uploading ${items.length} HD files to Printful File Library...`);

    const processedItems = await Promise.all(items.map(async (item) => {
      const processedFiles = await Promise.all((item.files || []).map(async (file) => {
        const uploaded = await printfulService.uploadFile(
          file.hdUrl, // URL CDN du fichier haute définition (stockée au moment de la commande)
          `${paymentIntent.id}-${file.placement}-${Date.now()}.png`
        );
        console.log(`  ✅ File uploaded: ${uploaded.filename} (ID: ${uploaded.id})`);
        return {
          placement: file.placement,
          printfulFileId: uploaded.id,
        };
      }));

      return { ...item, files: processedFiles };
    }));

    // ── Étape 2 : Création de la commande Printful ────────────────────────────
    console.log('📦 Creating Printful order...');

    const printfulOrder = await printfulService.createOrder({
      externalId: paymentIntent.id,
      shippingMethod: 'STANDARD',
      recipient: {
        name: shipping.name,
        address1: shipping.address.line1,
        address2: shipping.address.line2,
        city: shipping.address.city,
        state: shipping.address.state,
        country: shipping.address.country,
        zip: shipping.address.postal_code,
        email: fullIntent.metadata.recipient_email,
      },
      items: processedItems.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        name: item.name,
        retailPrice: item.retailPrice,
        files: item.files,
      })),
    });

    console.log(`📦 Printful order created: #${printfulOrder.id} (${printfulOrder.status})`);

    // ── Étape 3 : Confirmation de la commande ─────────────────────────────────
    const confirmedOrder = await printfulService.confirmOrder(printfulOrder.id);
    console.log(`🚀 Order confirmed! Printful #${confirmedOrder.id} → Status: ${confirmedOrder.status}`);

    // En production : mettre à jour votre DB, envoyer email de confirmation, etc.

  } catch (err) {
    console.error(`❌ Failed to process order for PaymentIntent ${paymentIntent.id}:`, err);
    // En production : alerting (Sentry, PagerDuty), retry queue (Bull/BullMQ)
    throw err;
  }
}

// ─── Order Status ─────────────────────────────────────────────────────────────

stripeRouter.get('/order/:paymentIntentId/status', async (req, res, next) => {
  try {
    const { paymentIntentId } = req.params;
    // En prod : chercher en DB avec le paymentIntentId comme external_id
    const order = await printfulService.request(`/orders/@${paymentIntentId}`);
    res.json({ order: order.result });
  } catch (err) {
    next(err);
  }
});
