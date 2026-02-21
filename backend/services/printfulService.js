/**
 * PrintfulService — Wrapper autour de l'API Printful v2
 * Gère : Auth, Catalog, Mockup Generation, File Library, Orders
 */

const PRINTFUL_BASE_URL = 'https://api.printful.com';

class PrintfulService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': process.env.PRINTFUL_STORE_ID,
    };
  }

  async request(endpoint, options = {}) {
    const url = `${PRINTFUL_BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new PrintfulAPIError(error.message || 'Printful API Error', res.status, error);
    }

    return res.json();
  }

  // ─── Authentification & Store ─────────────────────────────────────────────

  async verifyConnection() {
    const data = await this.request('/store');
    return data.result;
  }

  // ─── Catalogue Produits ───────────────────────────────────────────────────

  /**
   * Récupère tous les produits du catalogue avec pagination
   * Retourne : id, name, type, brand, model, image, techniques disponibles
   */
  async getCatalogProducts({ limit = 20, offset = 0, category = null } = {}) {
    const params = new URLSearchParams({ limit, offset });
    if (category) params.append('category_id', category);

    const data = await this.request(`/products?${params}`);
    const products = Array.isArray(data.result) ? data.result : Object.values(data.result || {});
    return { products, paging: data.paging };
  }

  async getProductDetails(productId) {
    // API v1: /products/{id} retourne le produit + ses variantes en une seule requête
    const data = await this.request(`/products/${productId}`);
    const product = data.result?.product || data.result;
    
    // Les variantes sont dans result.variants (tableau)
    const rawVariants = Array.isArray(data.result?.variants)
      ? data.result.variants
      : [];

    const variants = rawVariants.map(v => ({
      id:         v.id,
      name:       v.name || '',
      size:       v.size || '',
      color:      v.color || v.color_name || 'Default',
      color_code: v.color_code || v.color_code2 || '#cccccc',
      price:      v.price || '0.00',
      in_stock:   v.in_stock !== false,
    }));

    return {
      product,
      variants,
      printAreas: this._extractPrintAreas(product),
    };
  }

  /**
   * Extrait les zones d'impression depuis les données Printful v1
   * Utilise product.files (liste des fichiers d'impression) pour les vrais placements
   */
  _extractPrintAreas(product) {
    const areas = {};
    const files = product.files || [];
    const options = product.options || [];

    // Déterminer la technique principale
    let techName = 'Impression DTG';
    let techId = 'dtg';
    if (options.some(o => o.id === 'embroidery_type')) {
      techName = 'Broderie'; techId = 'embroidery';
    } else if ((product.techniques || []).some(t => (t.key || t.technique || '').includes('SUBLIMATION'))) {
      techName = 'Sublimation'; techId = 'sublimation';
    }

    // Extraire les placements depuis les fichiers (ignorer mockup/preview)
    const ignoredTypes = ['default', 'mockup', 'preview', 'back_mockup'];
    files.forEach(file => {
      const type = file.type || file.id;
      if (ignoredTypes.includes(type)) return;
      if (areas[type]) return;

      areas[type] = {
        placement: type,
        label: this._formatPlacementLabel(type),
        techniques: [{ id: techId, name: techName }],
        constraints: { width: 12, height: 12, unit: 'inches' },
      };
    });

    // Fallback si rien dans files → zones par défaut
    if (Object.keys(areas).length === 0) {
      const defaults = this._getDefaultAreas(product.type, product.techniques || []);
      defaults.forEach(a => { areas[a.placement] = a; });
    }

    return Object.values(areas);
  }

  _getDefaultAreas(productType, techniques) {
    const techName = techniques?.[0]?.display_name || 'Impression';
    const techId = techniques?.[0]?.key || 'dtg';
    const t = [{ id: techId, name: techName }];

    const map = {
      'T-SHIRT':    [
        { placement: 'front', label: 'Devant',  techniques: t, constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',     techniques: t, constraints: { width: 12, height: 16 } },
      ],
      'HOODIE':     [
        { placement: 'front', label: 'Devant',  techniques: t, constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',     techniques: t, constraints: { width: 12, height: 16 } },
      ],
      'SWEATSHIRT': [
        { placement: 'front', label: 'Devant',  techniques: t, constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',     techniques: t, constraints: { width: 12, height: 16 } },
      ],
      'DECOR':      [{ placement: 'front', label: 'Surface',    techniques: t, constraints: { width: 12, height: 12 } }],
      'MUG':        [{ placement: 'front', label: 'Face',       techniques: t, constraints: { width: 8,  height: 4  } }],
      'POSTER':     [{ placement: 'front', label: 'Surface',    techniques: t, constraints: { width: 18, height: 24 } }],
      'HAT':        [{ placement: 'front', label: 'Devant',     techniques: t, constraints: { width: 6,  height: 4  } }],
      'BAG':        [{ placement: 'front', label: 'Face avant', techniques: t, constraints: { width: 12, height: 12 } }],
    };

    return map[productType] || [
      { placement: 'front', label: 'Devant', techniques: t, constraints: { width: 12, height: 16 } },
    ];
  }

  _formatPlacementLabel(placement) {
    const labels = {
      'front':              'Devant',
      'back':               'Dos',
      'left-sleeve':        'Manche gauche',
      'right-sleeve':       'Manche droite',
      'label-outside':      'Étiquette extérieure',
      'label-inside':       'Étiquette intérieure',
      'embroidery-front':   'Broderie devant',
      'embroidery-back':    'Broderie dos',
      'pocket-area':        'Poche',
      'all-over':           'All-over',
      'chest-left':         'Poitrine gauche',
      'chest-right':        'Poitrine droite',
      'chest-center':       'Poitrine centre',
      'wrist-left':         'Poignet gauche',
      'wrist-right':        'Poignet droit',
      'sleeve-left':        'Manche gauche',
      'sleeve-right':       'Manche droite',
      'collar-back':        'Col dos',
      'inside-label':       'Étiquette intérieure',
      'outside-label':      'Étiquette extérieure',
      'large-front':        'Grand format devant',
      'large-back':         'Grand format dos',
    };
    return labels[placement] || placement;
  }

  // ─── Catégories ───────────────────────────────────────────────────────────

  async getCategories() {
    const data = await this.request('/categories');
    return data.result.categories;
  }

  // ─── Mockup Generator ─────────────────────────────────────────────────────

  /**
   * Lance la génération de mockup via l'API Printful
   * @param {number} variantId - ID de la variante produit
   * @param {Array} files - [{placement, url}] — URL publiques des images IA
   * @param {string} format - 'jpg' | 'png'
   */
  async createMockupTask(variantId, files, { format = 'png', width = 1000 } = {}) {
    const data = await this.request('/mockup-generator/create-task', {
      method: 'POST',
      body: JSON.stringify({
        variant_ids: [variantId],
        format,
        width,
        files: files.map(f => ({
          placement: f.placement,
          image_url: f.url,
          position: {
            area_width: f.areaWidth || 1800,
            area_height: f.areaHeight || 1800,
            width: f.width || 1800,
            height: f.height || 1800,
            top: f.top || 0,
            left: f.left || 0,
          },
        })),
      }),
    });
    return data.result; // { task_key }
  }

  /**
   * Poll le résultat du mockup (polling toutes les secondes max 30s)
   */
  async getMockupResult(taskKey, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const data = await this.request(`/mockup-generator/task?task_key=${taskKey}`);
      const task = data.result;

      if (task.status === 'completed') {
        return task.mockups; // [{placement, mockup_url, extra}]
      }
      if (task.status === 'failed') {
        throw new Error(`Mockup generation failed: ${task.error}`);
      }

      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Mockup generation timeout');
  }

  /**
   * Helper : Génère et attend le mockup en une seule opération
   */
  async generateMockup(variantId, files, options = {}) {
    const task = await this.createMockupTask(variantId, files, options);
    return this.getMockupResult(task.task_key);
  }

  // ─── File Library ─────────────────────────────────────────────────────────

  /**
   * Upload un fichier dans la File Library Printful
   * @param {string} url - URL publique du fichier HD (min 150 DPI, idéalement 300 DPI)
   * @param {string} filename
   * @param {Object} options - visible, type ('default'|'preview')
   */
  async uploadFile(url, filename, options = {}) {
    const data = await this.request('/files', {
      method: 'POST',
      body: JSON.stringify({
        url,
        filename,
        visible: options.visible ?? true,
        type: options.type ?? 'default',
      }),
    });
    return data.result; // { id, url, preview_url, filename, size, ... }
  }

  /**
   * Liste les fichiers uploadés (pour éviter les doublons)
   */
  async getFiles({ limit = 20, offset = 0 } = {}) {
    const data = await this.request(`/files?limit=${limit}&offset=${offset}`);
    return data.result;
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  /**
   * Crée une commande Printful après paiement Stripe validé
   * @param {Object} orderData - Données de commande avec items + shipping
   */
  async createOrder(orderData) {
    const payload = {
      external_id: orderData.externalId, // ID Stripe PaymentIntent
      shipping: orderData.shippingMethod || 'STANDARD',
      recipient: {
        name: orderData.recipient.name,
        address1: orderData.recipient.address1,
        address2: orderData.recipient.address2 || '',
        city: orderData.recipient.city,
        state_code: orderData.recipient.state,
        country_code: orderData.recipient.country,
        zip: orderData.recipient.zip,
        email: orderData.recipient.email,
        phone: orderData.recipient.phone || '',
      },
      items: orderData.items.map(item => ({
        variant_id: item.variantId,
        quantity: item.quantity,
        name: item.name,
        retail_price: item.retailPrice, // pour les remboursements
        files: item.files.map(f => ({
          type: f.placement,
          id: f.printfulFileId, // ID du fichier dans la File Library
        })),
        options: item.options || [], // thread_colors pour l'embroidery
      })),
    };

    const data = await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.result;
  }

  /**
   * Confirme et envoie une commande en production
   * (par défaut les commandes sont en mode draft)
   */
  async confirmOrder(orderId) {
    const data = await this.request(`/orders/${orderId}/confirm`, { method: 'POST' });
    return data.result;
  }

  async getOrder(orderId) {
    const data = await this.request(`/orders/${orderId}`);
    return data.result;
  }

  // ─── Shipping ─────────────────────────────────────────────────────────────

  async getShippingRates(recipient, items) {
    const data = await this.request('/shipping/rates', {
      method: 'POST',
      body: JSON.stringify({
        recipient: {
          address1: recipient.address1,
          city: recipient.city,
          country_code: recipient.country,
          zip: recipient.zip,
          state_code: recipient.state,
        },
        items: items.map(i => ({
          variant_id: i.variantId,
          quantity: i.quantity,
        })),
        currency: 'EUR',
        locale: 'fr_FR',
      }),
    });
    return data.result;
  }
}

class PrintfulAPIError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'PrintfulAPIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Singleton
const printfulService = new PrintfulService(process.env.PRINTFUL_API_KEY);

export { printfulService, PrintfulService, PrintfulAPIError };
