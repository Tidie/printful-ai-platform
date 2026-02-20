import { Router } from 'express';
import NodeCache from 'node-cache';
import { printfulService } from '../services/printfulService.js';

export const printfulRouter = Router();

const catalogCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

printfulRouter.get('/verify', async (req, res, next) => {
    try {
        const store = await printfulService.verifyConnection();
        res.json({ connected: true, store });
    } catch (err) {
        res.json({ connected: false, error: err.message });
    }
});

printfulRouter.get('/categories', async (req, res, next) => {
    try {
        const cacheKey = 'categories';
        const cached = catalogCache.get(cacheKey);
        if (cached) return res.json(cached);
        const categories = await printfulService.getCategories();
        const list = Array.isArray(categories) ? categories : Object.values(categories || {});
        catalogCache.set(cacheKey, list);
        res.json(list);
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
        const products = Array.isArray(result.products)
            ? result.products
            : Object.values(result.products || {});
        const response = { products, paging: result.paging };
        catalogCache.set(cacheKey, response);
        res.json(response);
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
        const variants = Array.isArray(result.variants)
            ? result.variants
            : Object.values(result.variants || {});
        const response = { ...result, variants };
        catalogCache.set(cacheKey, response);
        res.json(response);
    } catch (err) {
        next(err);
    }
});

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
                return res.status(400).json({ error: `Placement invalide: ${file.placement}`, validPlacements });
            }
        }
        const mockups = await printfulService.generateMockup(variantId, files, { format, width });
        res.json({ mockups });
    } catch (err) {
        next(err);
    }
});

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
        const files = await printfulService.getFiles({ limit: parseInt(limit), offset: parseInt(offset) });
        res.json({ files });
    } catch (err) {
        next(err);
    }
});

printfulRouter.post('/shipping/rates', async (req, res, next) => {
    try {
        const { recipient, items } = req.body;
        const rates = await printfulService.getShippingRates(recipient, items);
        res.json({ rates });
    } catch (err) {
        next(err);
    }
});
