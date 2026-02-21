/**
 * AI Routes — Génération d'images via Google Gemini 2.0 Flash
 * Supporte les images de référence (visages, animaux, etc.)
 *
 * Modèle : gemini-2.0-flash-exp-image-generation
 * API : https://generativelanguage.googleapis.com/v1beta
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export const aiRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Trop de générations, attendez 1 minute.',
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ─── POST /api/ai/generate ────────────────────────────────────────────────────
aiRouter.post('/generate', aiLimiter, async (req, res, next) => {
  try {
    const {
      prompt,
      style = 'illustration',
      negativePrompt = '',
      aspectRatio = '1:1',
      printPlacement = 'front',
      refImages = [],   // [{ base64: string, mimeType: string }]
    } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'Le prompt est requis' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY manquante — ajoutez-la dans les variables d\'environnement Railway'
      });
    }

    const enrichedPrompt = buildPrompt(prompt, style, printPlacement, negativePrompt, refImages.length > 0);

    console.log(`🎨 Gemini 2.0 Flash — style: ${style}, ratio: ${aspectRatio}, refs: ${refImages.length}`);
    console.log(`   Prompt: ${enrichedPrompt.substring(0, 120)}…`);

    // ── Construction du message multimodal ───────────────────────────────────
    const parts = [];

    // Ajoute les images de référence en premier (contexte visuel)
    for (let i = 0; i < refImages.length; i++) {
      const ref = refImages[i];
      if (!ref.base64 || !ref.mimeType) continue;
      parts.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: ref.base64,
        }
      });
    }

    // Puis le prompt texte
    parts.push({ text: enrichedPrompt });

    // ── Appel Gemini 2.0 Flash Image Generation ──────────────────────────────
    const modelUrl = `${GEMINI_BASE}/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
      },
    };

    const response = await fetch(modelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMsg = `Gemini API Error ${response.status}`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMsg = errorJson?.error?.message || errorMsg;
      } catch {}
      console.error('❌ Gemini error:', errorMsg);
      console.error('   Response body:', responseText.substring(0, 500));

      // Fallback : essaie avec Imagen 3
      console.log('↩ Tentative avec Imagen 3...');
      return await generateWithImagen3(req, res, { prompt: enrichedPrompt, aspectRatio });
    }

    const data = JSON.parse(responseText);

    // Extrait l'image depuis la réponse Gemini
    const candidates = data.candidates || [];
    let imageBase64 = null;
    let imageMimeType = 'image/png';

    for (const candidate of candidates) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          imageBase64 = part.inlineData.data;
          imageMimeType = part.inlineData.mimeType;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      console.error('❌ Aucune image dans la réponse:', JSON.stringify(data).substring(0, 500));
      // Fallback Imagen 3
      return await generateWithImagen3(req, res, { prompt: enrichedPrompt, aspectRatio });
    }

    const imageSize = Math.round(imageBase64.length * 0.75 / 1024);
    console.log(`✅ Image générée (${imageSize} Ko)`);

    res.json({
      url: `data:${imageMimeType};base64,${imageBase64}`,
      hdUrl: `data:${imageMimeType};base64,${imageBase64}`,
      style,
      aspectRatio,
      model: 'gemini-2.0-flash',
    });

  } catch (err) {
    console.error('❌ AI generate error:', err);
    next(err);
  }
});

// ─── Fallback : Gemini Imagen 3 ──────────────────────────────────────────────
async function generateWithImagen3(req, res, { prompt, aspectRatio }) {
  const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`;

  const response = await fetch(IMAGEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio || '1:1',
        safetyFilterLevel: 'block_few',
        personGeneration: 'allow_adult',
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Imagen 3 Error ${response.status}`;
    console.error('❌ Imagen 3 error:', msg);
    return res.status(502).json({
      error: `Erreur de génération : ${msg}. Vérifiez que GEMINI_API_KEY est valide et que l'API Gemini est activée.`
    });
  }

  const data = await response.json();
  const predictions = data.predictions;

  if (!predictions?.length) {
    return res.status(502).json({
      error: 'Aucune image générée (filtre de sécurité ou quota dépassé). Réessayez avec un autre prompt.'
    });
  }

  const imageBase64 = predictions[0].bytesBase64Encoded;
  const mimeType = predictions[0].mimeType || 'image/png';

  console.log(`✅ Image Imagen 3 générée (${Math.round(imageBase64.length * 0.75 / 1024)} Ko)`);

  res.json({
    url: `data:${mimeType};base64,${imageBase64}`,
    hdUrl: `data:${mimeType};base64,${imageBase64}`,
    style: 'imagen3-fallback',
    aspectRatio,
    model: 'imagen-3.0-generate-001',
  });
}

// ─── POST /api/ai/upscale ────────────────────────────────────────────────────
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

    res.json({ url: result.output, scale });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPrompt(userPrompt, style, placement, negativePrompt, hasRefImages) {
  const styleModifiers = {
    'realistic':   'photorealistic, highly detailed, sharp focus, professional product artwork',
    'illustration':'flat vector illustration, clean bold lines, vibrant solid colors, graphic design style',
    'abstract':    'abstract art, geometric shapes, dynamic composition, bold vibrant colors',
    'pixel-art':   'pixel art, 8-bit retro style, sharp crisp pixels, game sprite aesthetic',
    'watercolor':  'watercolor painting, soft artistic brushstrokes, translucent layers, dreamy aesthetic',
  };

  const placementModifiers = {
    'front':             'centered composition, white background, garment front print ready',
    'back':              'centered composition, white background, garment back print ready',
    'all-over':          'seamless repeating pattern, full coverage design, tiled motif',
    'left-sleeve':       'vertical narrow composition, sleeve print design',
    'right-sleeve':      'vertical narrow composition, sleeve print design',
    'pocket-area':       'small compact design, chest pocket print',
    'embroidery_chest_left': 'simple bold design, minimal colors, embroidery-ready, no gradients',
  };

  const refContext = hasRefImages
    ? 'Use the provided reference images as the main subjects. Integrate them faithfully into the scene described.'
    : '';

  const technical = [
    'white or transparent background',
    'high contrast edges',
    'print-ready artwork',
    'no watermarks or signatures',
    negativePrompt ? `avoid: ${negativePrompt}` : '',
  ].filter(Boolean).join(', ');

  return [
    refContext,
    userPrompt,
    styleModifiers[style] || '',
    placementModifiers[placement] || '',
    technical,
  ].filter(Boolean).join('. ');
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
