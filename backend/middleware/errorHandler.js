import { PrintfulAPIError } from '../services/printfulService.js';

export function errorHandler(err, req, res, next) {
  console.error(`❌ [${req.method} ${req.path}]`, err.message);

  if (err instanceof PrintfulAPIError) {
    return res.status(err.statusCode || 502).json({
      error: 'Printful API Error',
      message: err.message,
      details: err.details,
    });
  }

  if (err.type === 'StripeInvalidRequestError') {
    return res.status(400).json({ error: 'Stripe Error', message: err.message });
  }

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Une erreur est survenue' : err.message,
  });
}