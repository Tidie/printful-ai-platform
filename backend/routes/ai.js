import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export const aiRouter = Router();

const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Trop de générations, attendez 1 minute.',
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${GEMINI_API_KEY}`;

// ─── Génération d'image ───────────────────────────────────────────────────────

aiRouter.post('/generate', aiLimiter, async (req, res, next) => {
    try {
        const {
            prompt,
            style = 'illustration',
            aspectRatio,
            printPlacement = 'front',
        } = req.body;

        if (!prompt?.trim()) {
            return res.status(400).json({ error: 'Le prompt est requis' });
        }

        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY manquante dans .env' });
        }

        const ratio = aspectRatio || getAspectRatioForPlacement(printPlacement);
        const enrichedPrompt = buildPrompt(prompt, style, printPlacement);

        console.log(`🎨 Gemini Imagen — style: ${style}, ratio: ${ratio}`);

        const response = await fetch(GEMINI_IMAGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [{ prompt: enrichedPrompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: ratio,
                    safetyFilterLevel: 'block_few',
                    personGeneration: 'allow_adult',
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const msg = errorBody?.error?.message || `Gemini API Error ${response.status}`;
            console.error('❌ Gemini error:', msg);
            throw new Error(msg);
        }

        const data = await response.json();
        const predictions = data.predictions;

        if (!predictions?.length) {
            throw new Error('Gemini n\'a retourné aucune image (filtre de sécurité ou quota dépassé)');
        }

        const imageBase64 = predictions[0].bytesBase64Encoded;
        const mimeType = predictions[0].mimeType || 'image/png';

        const filename = `ai-generated/${Date.now()}-${style}.png`;
        const cdnUrl = await uploadBase64ToCDN(imageBase64, mimeType, filename);

        res.json({
            url: cdnUrl,
            hdUrl: cdnUrl,
            style,
            aspectRatio: ratio,
            model: 'imagen-3.0-generate-001',
        });

    } catch (err) {
        next(err);
    }
});

// ─── Upscale ──────────────────────────────────────────────────────────────────

aiRouter.post('/upscale', aiLimiter, async (req, res, next) => {
    try {
        const { imageUrl, scale = 4 } = req.body;

        const response = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                version: 'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
                input: { image: imageUrl, scale, face_enhance: false },
            }),
        });

        const prediction = await response.json();
        const result = await pollReplicate(prediction.id);
        const cdnUrl = await uploadBase64ToCDN(null, null, `upscaled/${Date.now()}.png`, result.output);

        res.json({ url: cdnUrl, scale });
    } catch (err) {
        next(err);
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(userPrompt, style, placement) {
    const styleModifiers = {
        'realistic': 'photorealistic, highly detailed, sharp focus, professional product artwork',
        'illustration': 'flat vector illustration, clean bold lines, vibrant solid colors, graphic design',
        'abstract': 'abstract art, geometric shapes, dynamic composition, bold vibrant colors',
        'pixel-art': 'pixel art, 8-bit retro style, sharp crisp pixels, game sprite aesthetic',
        'watercolor': 'watercolor painting, soft artistic brushstrokes, translucent layers, dreamy aesthetic',
    };

    const placementModifiers = {
        'front': 'centered composition, isolated on white background, suitable for garment front print',
        'back': 'centered composition, isolated on white background, suitable for garment back print',
        'all-over': 'seamless repeating pattern, full coverage design, tiled motif',
        'left-sleeve': 'vertical narrow composition, sleeve print design',
        'right-sleeve': 'vertical narrow composition, sleeve print design',
        'pocket-area': 'small compact design, chest pocket print',
    };

    const technical = [
        'white or transparent background',
        'high contrast edges',
        'print-ready artwork',
        'no watermarks or signatures',
        'no text unless explicitly requested',
    ].join(', ');

    return [
        userPrompt,
        styleModifiers[style] || '',
        placementModifiers[placement] || '',
        technical,
    ].filter(Boolean).join(', ');
}

function getAspectRatioForPlacement(placement) {
    const ratios = {
        'front': '3:4',
        'back': '3:4',
        'all-over': '3:4',
        'left-sleeve': '9:16',
        'right-sleeve': '9:16',
        'pocket-area': '1:1',
    };
    return ratios[placement] || '1:1';
}

async function uploadBase64ToCDN(base64, mimeType, filename, sourceUrl = null) {
    // ── Production : décommente le provider de ton choix ─────────────────────
    // Vercel Blob :
    // import { put } from '@vercel/blob';
    // const buffer = base64
    //   ? Buffer.from(base64, 'base64')
    //   : await fetch(sourceUrl).then(r => r.arrayBuffer()).then(Buffer.from);
    // const { url } = await put(filename, buffer, { access: 'public', contentType: mimeType || 'image/png' });
    // return url;

    // ── Développement : data URL directe ─────────────────────────────────────
    if (base64) {
        console.log(`✅ Image Gemini générée (${Math.round(base64.length * 0.75 / 1024)} Ko)`);
        return `data:${mimeType || 'image/png'};base64,${base64}`;
    }

    if (sourceUrl) {
        return sourceUrl;
    }

    throw new Error('uploadBase64ToCDN : ni base64 ni sourceUrl fourni');
}

async function pollReplicate(predictionId, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
            headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` },
        });
        const data = await res.json();
        if (data.status === 'succeeded') return data;
        if (data.status === 'failed') throw new Error(data.error);
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Replicate prediction timeout');
}