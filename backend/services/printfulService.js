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
    // Printful API v2: produit d'un côté, variantes de l'autre
    const [productData, variantsData] = await Promise.all([
      this.request(`/catalog/products/${productId}`),
      this.request(`/catalog/variants?product_id=${productId}&limit=100`),
    ]);

    const product = productData.result?.product || productData.result;

    const rawVariants = Array.isArray(variantsData.result)
      ? variantsData.result
      : Object.values(variantsData.result || {});

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
   * Extrait les zones d'impression avec leurs contraintes techniques
   */
  _extractPrintAreas(product) {
    const areas = {};
    const techniques = product.techniques || [];

    techniques.forEach(technique => {
      if (technique.placements) {
        technique.placements.forEach(placement => {
          if (!areas[placement.placement]) {
            areas[placement.placement] = {
              placement: placement.placement,
              label: this._formatPlacementLabel(placement.placement),
              techniques: [],
              constraints: { width: placement.width, height: placement.height, unit: 'inches' },
            };
          }
          areas[placement.placement].techniques.push({
            id: technique.key || technique.technique,
            name: technique.display_name,
            colors: technique.colors,
          });
        });
      }
    });

    // Si rien trouvé → zones par défaut selon le type de produit
    if (Object.keys(areas).length === 0) {
      const defaultAreas = this._getDefaultAreas(product.type, techniques);
      defaultAreas.forEach(area => { areas[area.placement] = area; });
    }

    return Object.values(areas);
  }

  _getDefaultAreas(productType, techniques) {
    const techName = techniques?.[0]?.display_name || 'Impression';
    const techId = techniques?.[0]?.key || 'dtg';
    const defaultTech = [{ id: techId, name: techName }];

    const typeMap = {
      'T-SHIRT':    [
        { placement: 'front', label: 'Devant', techniques: defaultTech, constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',    techniques: defaultTech, constraints: { width: 12, height: 16 } },
      ],
      'HOODIE':     [
        { placement: 'front', label: 'Devant', techniques: defaultTech, constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',    techniques: defaultTech, constraints: { width: 12, height: 16 } },
      ],
      'SWEATSHIRT': [
        { placement: 'front', label: 'Devant', techniques: defaultTech, constraints: { width: 12, height: 16 } },
        { placement: 'back',  label: 'Dos',    techniques: defaultTech, constraints: { width: 12, height: 16 } },
      ],
      'DECOR':  [{ placement: 'front', label: 'Surface',    techniques: defaultTech, constraints: { width: 12, height: 12 } }],
      'MUG':    [{ placement: 'front', label: 'Face',       techniques: defaultTech, constraints: { width: 8,  height: 4  } }],
      'POSTER': [{ placement: 'front', label: 'Surface',    techniques: defaultTech, constraints: { width: 18, height: 24 } }],
      'HAT':    [{ placement: 'front', label: 'Devant',     techniques: defaultTech, constraints: { width: 6,  height: 4  } }],
      'BAG':    [{ placement: 'front', label: 'Face avant', techniques: defaultTech, constraints: { width: 12, height: 12 } }],
      'PHONE_CASE': [{ placement: 'front', label: 'Face',  techniques: defaultTech, constraints: { width: 4,  height: 7  } }],
    };

    return typeMap[productType] || [
      { placement: 'front', label: 'Devant', techniques: defaultTech, constraints: { width: 12, height: 16 } },
    ];
  }

  _formatPlacementLabel(placement) {
    const labels = {
      'front': 'Devant',
      'back': 'Dos',
      'left-sleeve': 'Manche gauche',
      'right-sleeve': 'Manche droite',
      'label-outside': 'Étiquette extérieure',
      'label-inside': 'Étiquette intérieure',
      'embroidery-front': 'Broderie devant',
      'embroidery-back': 'Broderie dos',
      'pocket-area': 'Poche',
      'all-over': 'All-over',
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
