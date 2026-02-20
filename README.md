# ✦ PrintAI Studio — Plateforme de Personnalisation IA + Printful

Application web full-stack permettant de générer des visuels par IA et de les appliquer sur n'importe quel produit du catalogue Printful, avec checkout Stripe et fulfilment automatisé.

## Architecture

```
printful-ai-platform/
├── backend/                     # Express.js API
│   ├── server.js                # Point d'entrée, middleware, routes
│   ├── services/
│   │   └── printfulService.js   # Wrapper Printful API v2 (catalogue, mockup, files, orders)
│   ├── routes/
│   │   ├── printful.js          # Endpoints catalogue, mockup, file library
│   │   ├── stripe.js            # Payment Intent + Webhook automatisé
│   │   └── ai.js                # Génération DALL-E 3 + upscaling Replicate
│   └── middleware/
│       ├── errorHandler.js
│       └── logger.js
└── frontend/                    # React + TypeScript + Fabric.js
    └── src/
        ├── App.tsx              # Routing entre les 3 étapes
        ├── components/
        │   ├── ProductCatalog.tsx       # Browse catalogue Printful + variantes
        │   ├── CustomizationStudio.tsx  # Canvas Fabric.js + génération IA
        │   ├── PrintZoneManager.tsx     # Contraintes techniques par zone
        │   ├── AIPromptPanel.tsx        # Interface prompt + styles
        │   └── CheckoutFlow.tsx         # Livraison + Stripe Elements
        └── hooks/
            └── index.ts         # useProductCatalog, useMockupGenerator
```

## Flux Utilisateur Complet

```
[1] Catalogue Printful
    ↓ Sélection produit + variante (couleur/taille)
    
[2] Studio de Personnalisation
    ↓ Saisie prompt IA → DALL-E 3 génère l'image
    ↓ Canvas Fabric.js : repositionner, redimensionner, ajouter texte
    ↓ Mockup Printful généré en temps réel
    ↓ Gestion multi-zones (devant, dos, manches)
    
[3] Checkout
    ↓ Formulaire livraison → calcul frais Printful
    ↓ Paiement Stripe Elements
    ↓ Webhook → Upload fichier HD File Library → Création commande → Confirmation
    
[4] Fulfillment automatique Printful
    → Production + Expédition
```

## Installation & Démarrage

### Prérequis
- Node.js 20+
- Compte Printful (API Key dans les paramètres store)
- Compte Stripe (clés API + webhook)
- Compte Google AI Studio (pour Gemini Imagen 3 — clé gratuite disponible sur [aistudio.google.com](https://aistudio.google.com/app/apikey))

### 1. Configuration
```bash
cp .env.example backend/.env
# Remplir toutes les clés dans backend/.env
```

### 2. Backend
```bash
cd backend
npm install
npm run dev
# → http://localhost:4000

# Dans un autre terminal, écouter les webhooks Stripe en local :
stripe listen --forward-to localhost:4000/api/stripe/webhook
# Copier le webhook secret affiché dans .env → STRIPE_WEBHOOK_SECRET
```

### 3. Frontend
```bash
cd frontend
npm install
# Créer frontend/.env avec :
# VITE_STRIPE_PUBLIC_KEY=pk_test_...
npm run dev
# → http://localhost:3000
```

## API Endpoints

### Printful
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/printful/verify` | Vérifier la connexion API |
| GET | `/api/printful/categories` | Toutes les catégories (cachées 1h) |
| GET | `/api/printful/products` | Catalogue avec pagination |
| GET | `/api/printful/products/:id` | Détails + variantes + print areas |
| POST | `/api/printful/mockup` | Générer un mockup visuel |
| POST | `/api/printful/files` | Upload vers File Library |
| POST | `/api/printful/shipping/rates` | Calculer les frais de port |

### Stripe
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/stripe/create-payment-intent` | Créer un paiement |
| POST | `/api/stripe/webhook` | Webhook → commande Printful auto |

### AI
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/ai/generate` | Générer une image avec Gemini Imagen 3 |
| POST | `/api/ai/upscale` | Upscaler via Real-ESRGAN (Replicate) |

## Gestion des Zones d'Impression

Le `PrintZoneManager` gère les contraintes par technique :

| Technique | Contraintes | Résolution min |
|-----------|-------------|----------------|
| DTG (Direct to Garment) | Couleurs illimitées, photos OK | 150 DPI |
| Broderie | Max 15 couleurs fil, pas de dégradés, détails min 4mm | 300 DPI |
| All-Over Print | Fichier très grand (4500×5400px min) | 150 DPI sur toute surface |
| Sérigraphie | Max 6 couleurs, vecteur obligatoire | 300 DPI |
| Sublimation | Polyester blanc/clair uniquement | 200 DPI |

## Webhook Stripe → Printful (Flux Automatisé)

```javascript
payment_intent.succeeded
  → printfulService.uploadFile(hdUrl, filename)  // File Library
  → printfulService.createOrder({...})           // Commande draft
  → printfulService.confirmOrder(orderId)        // Envoi en production
```

Le webhook répond `200` immédiatement à Stripe, puis traite de façon asynchrone pour éviter les timeouts.

## CDN pour les Fichiers HD

Les images OpenAI expirent après 1h. En production, configurer un CDN dans `backend/routes/ai.js` :

```bash
# Option 1 : Vercel Blob
npm install @vercel/blob
# BLOB_READ_WRITE_TOKEN=...

# Option 2 : AWS S3
npm install @aws-sdk/client-s3
# AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_BUCKET=...

# Option 3 : Cloudflare R2 (compatible S3)
# CF_ACCOUNT_ID=... CF_R2_ACCESS_KEY=...
```

## Production

### Checklist déploiement
- [ ] Variables d'environnement sécurisées (jamais de clés en dur)
- [ ] Webhook Stripe : créer un endpoint dans le Dashboard Stripe avec l'URL de prod
- [ ] CORS : mettre à jour `FRONTEND_URL` avec le domaine de prod
- [ ] Base de données pour persister les commandes (Postgres/Supabase recommandé)
- [ ] Queue pour les webhooks (Bull/BullMQ + Redis) pour les retries
- [ ] Alerting erreurs (Sentry)
- [ ] Rate limiting Stripe : max 100 Payment Intents/h par IP en prod

### Recommandations stack
- **DB** : Supabase (Postgres + Auth gratuit)
- **Queue** : Upstash Redis + BullMQ
- **CDN** : Vercel Blob ou Cloudflare R2
- **Deploy** : Vercel (frontend) + Railway/Render (backend)
- **Monitoring** : Sentry + Stripe Dashboard

## Limitations API Printful

- Mockup Generator : ~30s de génération, limité à quelques appels/min
- File Library : fichiers HD requis (PNG recommandé, min 150 DPI)
- Orders : créées en **draft** par défaut — `confirmOrder()` les envoie en production
- Cache catalogue conseillé (les produits changent rarement)

## Licence

MIT
