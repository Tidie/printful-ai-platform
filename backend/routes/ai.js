/**
 * AI Routes — Génération d'images via Google Gemini 2.0 Flash
 * Modèle : gemini-2.0-flash-exp (image generation native)
 * Supporte les photos de référence (visages, animaux, etc.)
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export const aiRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Trop de générations, attendez 1 minute.',
});

// ─── POST /api/ai/generate ────────────────────────────────────────────────────
aiRouter.post('/generate', aiLimiter, async (req, res, next) => {
  try {
    const {
      prompt,
      style          = 'illustration',
      negativePrompt = '',
      aspectRatio    = '1:1',
      printPlacement = 'front',
      refImages      = [],
      model          = 'gemini-2.5-flash-image',
    } = req.body;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'Le prompt est requis' });
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY manquante — ajoutez-la dans les variables d'environnement Railway",
      });
    }

    const enrichedPrompt = buildPrompt(prompt, style, printPlacement, negativePrompt, refImages.length > 0);

    console.log(`   Style: ${style}, refs: ${refImages.length}, prompt: ${enrichedPrompt.substring(0, 80)}…`);

    // Parts multimodaux : photos de référence d'abord, puis le texte
    const parts = [];
    for (const ref of refImages) {
      if (!ref.base64 || !ref.mimeType) continue;
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
    }
    parts.push({ text: enrichedPrompt });

    // Modèle sélectionné par l'utilisateur (flash ou pro 4K)
    const ALLOWED_MODELS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
    const safeModel = ALLOWED_MODELS.includes(model) ? model : 'gemini-2.5-flash-image';
    const isPro = safeModel === 'gemini-3-pro-image-preview';

    console.log(`🎨 Modèle : ${safeModel}${isPro ? ' (Pro 4K, ~20s)' : ' (Flash, ~3s)'}`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    let data;
    const rawText = await geminiRes.text();
    try { data = JSON.parse(rawText); } catch { data = {}; }

    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || `Gemini HTTP ${geminiRes.status}`;
      console.error('❌ Gemini error:', errMsg);

      if (geminiRes.status === 401 || geminiRes.status === 403) {
        return res.status(500).json({ error: 'Clé API Gemini invalide ou accès refusé. Vérifiez GEMINI_API_KEY sur Railway.' });
      }
      if (geminiRes.status === 429) {
        return res.status(429).json({ error: 'Quota Gemini dépassé. Attendez quelques secondes.' });
      }
      return res.status(502).json({ error: `Erreur Gemini : ${errMsg}` });
    }

    // Extraction de l'image dans la réponse
    const candidates = data.candidates || [];
    let imageBase64  = null;
    let imageMime    = 'image/png';

    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          imageBase64 = part.inlineData.data;
          imageMime   = part.inlineData.mimeType;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      const finishReason = candidates[0]?.finishReason;
      console.error('❌ Pas d image. finishReason:', finishReason);
      console.error('   Raw:', rawText.substring(0, 500));

      if (finishReason === 'SAFETY') {
        return res.status(400).json({ error: 'Design refusé par le filtre de sécurité. Reformulez votre prompt.' });
      }
      return res.status(502).json({ error: "Gemini n'a retourné aucune image. Réessayez avec un autre prompt." });
    }

    console.log(`✅ Image générée (${Math.round(imageBase64.length * 0.75 / 1024)} Ko)`);

    res.json({
      url:   `data:${imageMime};base64,${imageBase64}`,
      hdUrl: `data:${imageMime};base64,${imageBase64}`,
      style,
      aspectRatio,
      model: safeModel,
    });

  } catch (err) {
    console.error('❌ AI generate crash:', err);
    next(err);
  }
});

// ─── POST /api/ai/upscale ─────────────────────────────────────────────────────
aiRouter.post('/upscale', aiLimiter, async (req, res, next) => {
  try {
    const { imageUrl, scale = 4 } = req.body;
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
        input: { image: imageUrl, scale, face_enhance: false },
      }),
    });
    const prediction = await response.json();
    const result     = await pollReplicate(prediction.id);
    res.json({ url: result.output, scale });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(userPrompt, style, placement, negativePrompt, hasRefImages) {
  const STYLES = {
    realistic:    'photorealistic, highly detailed, sharp focus, professional product artwork',
    illustration: 'flat vector illustration, clean bold lines, vibrant solid colors, graphic design',
    abstract:     'abstract art, geometric shapes, dynamic composition, bold vibrant colors',
    'pixel-art':  'pixel art, 8-bit retro style, sharp crisp pixels, game sprite aesthetic',
    watercolor:   'watercolor painting, soft brushstrokes, translucent layers, dreamy aesthetic',
  };
  const PLACEMENTS = {
    front:                 'centered composition, white background, garment front print ready',
    back:                  'centered composition, white background, garment back print ready',
    'all-over':            'seamless repeating pattern, full coverage design',
    'left-sleeve':         'vertical narrow composition, sleeve print',
    'right-sleeve':        'vertical narrow composition, sleeve print',
    'pocket-area':         'small compact design, chest pocket',
    embroidery_chest_left: 'simple bold shapes, max 15 colors, no gradients, embroidery style',
  };
  return [
    hasRefImages ? 'Use the provided reference images as the main subjects. Integrate them faithfully into the scene.' : '',
    userPrompt,
    STYLES[style]         || '',
    PLACEMENTS[placement] || 'centered composition, white background, print-ready',
    'no watermarks, no signatures, high contrast edges, print-ready artwork',
    negativePrompt ? `Avoid: ${negativePrompt}` : '',
  ].filter(Boolean).join('. ');
}

async function pollReplicate(predictionId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const res  = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
    });
    const data = await res.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed')    throw new Error(data.error);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Replicate prediction timeout');
}
