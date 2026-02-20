import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { printfulRouter } from './routes/printful.js';
import { stripeRouter } from './routes/stripe.js';
import { aiRouter } from './routes/ai.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Sécurité ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const orderLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.use(limiter);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
// Stripe webhook a besoin du body brut pour vérifier la signature
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(logger);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/printful', printfulRouter);
app.use('/api/stripe', orderLimiter, stripeRouter);
app.use('/api/ai', aiRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Erreurs ──────────────────────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    console.log(`   Printful : ${process.env.PRINTFUL_API_KEY ? '✅' : '❌ PRINTFUL_API_KEY manquante'}`);
    console.log(`   Stripe   : ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌ STRIPE_SECRET_KEY manquante'}`);
    console.log(`   Gemini   : ${process.env.GEMINI_API_KEY ? '✅' : '❌ GEMINI_API_KEY manquante'}`);
});

export default app;