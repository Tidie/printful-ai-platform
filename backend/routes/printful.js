import { Router } from 'express';
import NodeCache from 'node-cache';
import { printfulService } from '../services/printfulService.js';

export const printfulRouter = Router();

const catalogCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// ─── Auth Check ───────────────────────────────────────────────────────────────

printfulRouter.get('/verify', async (req, res, next) => {
    try {
        const store = await printfulService.verifyConnection();
        res.json({ connected: true, store });
    } catch (err) {
        res.json({ connected: false, error: err.message });
    }
});

// ─── Catalogue ────────────────────────────────────────────────────────────────

printfulRouter.get('/categories', async (req, res, next) => {
    try {
        const cacheKey = 'categories';
        const cached = catalogCache.get(cacheKey);
        if (cached) return res.json(cached);

        const categories = await printfulService.getCategories();
        catalogCache.set(cacheKey, categories);
        res.json(categories);
    } catch (err) {
        next(err);
    }
});

printfulRouter.get('/products', async (req, res, next) => {
    try {
        const { limit = 20, offset = 0, category } = req.query;
        const cacheKey = `products:${limit}:${offset}:${category || 'all'}`;
        const cached = catalogCache.get(cacheKey);
        if (cached) return res.json(cached);

        const result = await printfulService.getCatalogProducts({
            limit: parseInt(limit),
            offset: parseInt(offset),
            category,
        });

        catalogCache.set(cacheKey, result);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

printfulRouter.get('/products/:id', async (req, res, next) => {
    try {
        const cacheKey = `product:${req.params.id}`;
        const cached = catalogCache.get(cacheKey);
        if (cached) return res.json(cached);

        const result = await printfulService.getProductDetails(req.params.id);
        catalogCache.set(cacheKey, result);
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ─── Mockup Generator ─────────────────────────────────────────────────────────

printfulRouter.post('/mockup', async (req, res, next) => {
    try {
        const { variantId, files, format, width } = req.body;

        if (!variantId || !files?.length) {
            return res.status(400).json({ error: 'variantId et files sont requis' });
        }

        const validPlacements = [
            'front', 'back', 'left-sleeve', 'right-sleeve',
            'pocket-area', 'embroidery-front', 'embroidery-back',
            'label-outside', 'label-inside', 'all-over',
        ];

        for (const file of files) {
            if (!validPlacements.includes(file.placement)) {
                return res.status(400).json({
                    error: `Placement invalide: ${file.placement}`,
                    validPlacements,
                });
            }
        }

        const mockups = await printfulService.generateMockup(variantId, files, { format, width });
        res.json({ mockups });
    } catch (err) {
        next(err);
    }
});

// ─── File Library ─────────────────────────────────────────────────────────────

printfulRouter.post('/files', async (req, res, next) => {
    try {
        const { url, filename } = req.body;
        if (!url || !filename) {
            return res.status(400).json({ error: 'url et filename requis' });
        }
        const file = await printfulService.uploadFile(url, filename);
        res.json({ file });
    } catch (err) {
        next(err);
    }
});

printfulRouter.get('/files', async (req, res, next) => {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const files = await printfulService.getFiles({
            limit: parseInt(limit),
            offset: parseInt(offset),
        });
        res.json({ files });
    } catch (err) {
        next(err);
    }
});

// ─── Shipping ─────────────────────────────────────────────────────────────────

printfulRouter.post('/shipping/rates', async (req, res, next) => {
    try {
        const { recipient, items } = req.body;
        const rates = await printfulService.getShippingRates(recipient, items);
        res.json({ rates });
    } catch (err) {
        next(err);
    }
});