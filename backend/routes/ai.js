/**
 * AI Routes — Pipeline complet
 *
 * Mode 1 : TEXT → IMAGE  via Gemini 2.5 Flash / Gemini 3 Pro
 * Mode 2 : IMAGE → IMAGE via Replicate SDXL + IP-Adapter (photo de référence)
 *
 * Post-processing automatique :
 *   ① Background Removal  (rembg via Replicate)
 *   ② Upscale 4×          (Real-ESRGAN via Replicate)
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export const aiRouter = Router();

const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: 'Trop de générations.' });

// ─── POST /api/ai/generate ────────────────────────────────────────────────────
aiRouter.post('/generate', aiLimiter, async (req, res, next) => {
  try {
    const {
      prompt,
      style            = 'illustration',
      negativePrompt   = '',
      aspectRatio      = '1:1',
      printPlacement   = 'front',
      refImages        = [],
      model            = 'gemini-2.5-flash-image',
      removeBackground = true,
      upscale          = true,
    } = req.body;

    if (!prompt?.trim()) return res.status(400).json({ error: 'Le prompt est requis' });

    const GEMINI_KEY      = process.env.GEMINI_API_KEY;
    const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

    let rawBase64    = null;
    let rawMime      = 'image/png';
    let originalUrl  = null;

    // ════════════════════════════════════════════════════════
    // MODE IMAGE→IMAGE  (Replicate SDXL + IP-Adapter)
    // Déclenché si l'utilisateur a uploadé au moins une photo
    // ════════════════════════════════════════════════════════
    if (refImages.length > 0 && REPLICATE_TOKEN) {
      console.log(`🎨 [IMAGE→IMAGE] Replicate IP-Adapter · style: ${style}`);

      const mainRef   = refImages[0];
      const sourceUrl = `data:${mainRef.mimeType};base64,${mainRef.base64}`;
      originalUrl     = sourceUrl;

      const enriched = buildPrompt(prompt, style, printPlacement, negativePrompt, true);

      const prediction = await replicateRun(
        'lucataco/ip-adapter-sdxl:c6b5d2b7459910fec94432e9e1203c3cdce92d90867ba4d4d75c7a3dc0c938af',
        {
          image:               sourceUrl,
          prompt:              enriched,
          negative_prompt:     buildNegativePrompt(style, negativePrompt),
          num_outputs:         1,
          num_inference_steps: 30,
          guidance_scale:      7.5,
          ip_adapter_scale:    0.6,
        },
        REPLICATE_TOKEN
      );

      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) throw new Error('Replicate n\'a pas retourné d\'image');

      const buf = await fetch(outputUrl).then(r => r.arrayBuffer());
      rawBase64 = Buffer.from(buf).toString('base64');
      rawMime   = 'image/png';

    } else {
      // ════════════════════════════════════════════════════════
      // MODE TEXT→IMAGE  (Gemini)
      // ════════════════════════════════════════════════════════
      if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY manquante sur Railway' });

      const ALLOWED = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
      const safeModel = ALLOWED.includes(model) ? model : 'gemini-2.5-flash-image';
      const enriched  = buildPrompt(prompt, style, printPlacement, negativePrompt, false);

      console.log(`🎨 [TEXT→IMAGE] ${safeModel} · style: ${style}`);

      const parts = [];
      for (const r of refImages) {
        if (r.base64 && r.mimeType) parts.push({ inlineData: { mimeType: r.mimeType, data: r.base64 } });
      }
      parts.push({ text: enriched });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${GEMINI_KEY}`;
      const gRes = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
      });

      let gData;
      const gText = await gRes.text();
      try { gData = JSON.parse(gText); } catch { gData = {}; }

      if (!gRes.ok) {
        const msg = gData?.error?.message || `Gemini HTTP ${gRes.status}`;
        if (gRes.status === 401 || gRes.status === 403) return res.status(500).json({ error: 'Clé API Gemini invalide.' });
        if (gRes.status === 429)                        return res.status(429).json({ error: 'Quota dépassé, réessayez.' });
        return res.status(502).json({ error: `Gemini : ${msg}` });
      }

      for (const c of gData.candidates || []) {
        for (const p of c.content?.parts || []) {
          if (p.inlineData?.mimeType?.startsWith('image/')) {
            rawBase64 = p.inlineData.data;
            rawMime   = p.inlineData.mimeType;
            break;
          }
        }
        if (rawBase64) break;
      }

      if (!rawBase64) {
        const reason = gData.candidates?.[0]?.finishReason;
        if (reason === 'SAFETY') return res.status(400).json({ error: 'Prompt refusé par le filtre de sécurité.' });
        return res.status(502).json({ error: 'Gemini n\'a retourné aucune image.' });
      }

      console.log(`✅ Gemini OK (${Math.round(rawBase64.length * 0.75 / 1024)} Ko)`);
    }

    // ════════════════════════════════════════════════════════
    // ① BACKGROUND REMOVAL
    // ════════════════════════════════════════════════════════
    let cleanBase64 = rawBase64;
    let cleanMime   = rawMime;

    if (removeBackground && REPLICATE_TOKEN) {
      console.log('✂️  Background removal…');
      try {
        const bgPred = await replicateRun(
          'lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1',
          { image: `data:${rawMime};base64,${rawBase64}` },
          REPLICATE_TOKEN
        );
        const bgOut = Array.isArray(bgPred.output) ? bgPred.output[0] : bgPred.output;
        if (bgOut) {
          const buf  = await fetch(bgOut).then(r => r.arrayBuffer());
          cleanBase64 = Buffer.from(buf).toString('base64');
          cleanMime   = 'image/png';
          console.log('✅ Fond supprimé');
        }
      } catch (e) { console.warn('⚠️  Background removal raté, on continue :', e.message); }
    }

    // ════════════════════════════════════════════════════════
    // ② UPSCALE 4×
    // ════════════════════════════════════════════════════════
    let finalBase64 = cleanBase64;
    let finalMime   = cleanMime;

    if (upscale && REPLICATE_TOKEN) {
      console.log('🔍 Upscale 4×…');
      try {
        const upPred = await replicateRun(
          'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
          { image: `data:${cleanMime};base64,${cleanBase64}`, scale: 4, face_enhance: true },
          REPLICATE_TOKEN
        );
        const upOut = Array.isArray(upPred.output) ? upPred.output[0] : upPred.output;
        if (upOut) {
          const buf  = await fetch(upOut).then(r => r.arrayBuffer());
          finalBase64 = Buffer.from(buf).toString('base64');
          finalMime   = 'image/png';
          console.log(`✅ Upscale OK (${Math.round(finalBase64.length * 0.75 / 1024)} Ko)`);
        }
      } catch (e) { console.warn('⚠️  Upscale raté, on continue :', e.message); }
    }

    res.json({
      url:         `data:${finalMime};base64,${finalBase64}`,
      hdUrl:       `data:${finalMime};base64,${finalBase64}`,
      rawUrl:      `data:${rawMime};base64,${rawBase64}`,
      originalUrl,
      style,
      aspectRatio,
      model:       refImages.length > 0 ? 'replicate-ip-adapter-sdxl' : model,
      pipeline: {
        imageToImage:      refImages.length > 0,
        backgroundRemoved: removeBackground && !!REPLICATE_TOKEN,
        upscaled:          upscale          && !!REPLICATE_TOKEN,
      },
    });

  } catch (err) { console.error('❌ AI crash:', err); next(err); }
});

// ─── POST /api/ai/remove-bg ───────────────────────────────────────────────────
aiRouter.post('/remove-bg', aiLimiter, async (req, res, next) => {
  try {
    const { imageUrl, imageBase64, mimeType = 'image/png' } = req.body;
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN manquant' });

    const src  = imageUrl || `data:${mimeType};base64,${imageBase64}`;
    const pred = await replicateRun('lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1', { image: src }, token);
    const out  = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    const buf  = await fetch(out).then(r => r.arrayBuffer());
    res.json({ url: `data:image/png;base64,${Buffer.from(buf).toString('base64')}` });
  } catch (err) { next(err); }
});

// ─── POST /api/ai/upscale ─────────────────────────────────────────────────────
aiRouter.post('/upscale', aiLimiter, async (req, res, next) => {
  try {
    const { imageUrl, imageBase64, mimeType = 'image/png', scale = 4 } = req.body;
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'REPLICATE_API_TOKEN manquant' });

    const src  = imageUrl || `data:${mimeType};base64,${imageBase64}`;
    const pred = await replicateRun('nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b', { image: src, scale, face_enhance: true }, token);
    const out  = Array.isArray(pred.output) ? pred.output[0] : pred.output;
    const buf  = await fetch(out).then(r => r.arrayBuffer());
    res.json({ url: `data:image/png;base64,${Buffer.from(buf).toString('base64')}`, scale });
  } catch (err) { next(err); }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function replicateRun(version, input, token) {
  const r = await fetch('https://api.replicate.com/v1/predictions', {
    method:  'POST',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ version, input }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.detail || `Replicate create ${r.status}`);
  }
  return await pollReplicate((await r.json()).id, token);
}

async function pollReplicate(id, token, max = 120) {
  for (let i = 0; i < max; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const r    = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Token ${token}` } });
    const data = await r.json();
    console.log(`   ↳ Replicate [${id.slice(0,8)}] ${data.status}`);
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`Replicate ${data.status}: ${data.error}`);
  }
  throw new Error('Replicate timeout (5 min)');
}

function buildPrompt(userPrompt, style, placement, negativePrompt, hasRefImages) {
  const STYLES = {
    realistic:       'photorealistic, highly detailed, sharp focus, professional product artwork, 8K resolution',
    illustration:    'flat vector illustration, clean bold lines, vibrant solid colors, professional graphic design',
    abstract:        'abstract art, geometric shapes, dynamic composition, bold vibrant colors',
    'pixel-art':     'pixel art, 8-bit retro style, sharp crisp pixels, game sprite aesthetic',
    watercolor:      'watercolor painting, soft brushstrokes, translucent layers, dreamy artistic aesthetic',
    // ── 3 nouveaux styles ──
    pixar:           'Pixar 3D animation style, soft cinematic lighting, expressive cartoon character, Disney-Pixar render quality, cute and highly detailed, subsurface scattering skin, vibrant colors',
    'gta-comic':     'GTA V loading screen art style, bold black outlines, comic book illustration, saturated vivid colors, dynamic action pose, graphic novel shading, pop art style',
    'minimal-vector':'minimalist flat vector art, geometric clean lines, maximum 3 colors, modern logo aesthetic, flat design, no gradients, no shadows, SVG-style illustration',
  };

  const PLACEMENTS = {
    front:                 'centered composition, transparent background, garment front print ready',
    back:                  'centered composition, transparent background, garment back print ready',
    'all-over':            'seamless repeating pattern, full coverage design',
    'left-sleeve':         'vertical narrow composition, sleeve print format',
    'right-sleeve':        'vertical narrow composition, sleeve print format',
    'pocket-area':         'small compact design, chest pocket format',
    embroidery_chest_left: 'simple bold shapes, max 15 colors, absolutely no gradients, embroidery-ready',
  };

  return [
    hasRefImages ? 'Transform the provided reference image: keep the subject\'s identity and structure, apply the new artistic style described below.' : '',
    userPrompt,
    STYLES[style]         || '',
    PLACEMENTS[placement] || 'centered composition, transparent background, print-ready',
    'no watermarks, no signatures, no text unless explicitly requested, isolated subject on transparent background, high contrast edges, print-ready artwork',
    negativePrompt ? `Avoid: ${negativePrompt}` : '',
  ].filter(Boolean).join('. ');
}

function buildNegativePrompt(style, userNegative) {
  const base = 'blurry, low quality, watermark, signature, text overlay, ugly, distorted, deformed, extra limbs, duplicate';
  const extra = {
    'minimal-vector': 'photorealistic, gradients, drop shadows, texture, noise, complex background',
    pixar:            'flat 2D, anime style, sketch, pencil drawing, ugly deformed',
    'gta-comic':      'photorealistic, soft edges, blurry, low contrast',
    watercolor:       'sharp lines, vector, digital art, smooth gradients',
  };
  return [base, extra[style] || '', userNegative].filter(Boolean).join(', ');
}
