import { useState, useEffect } from 'react';
import { useProductCatalog } from '../hooks';

interface Props {
  onSelect: (product: any, variant: any) => void;
}

export function ProductCatalog({ onSelect }: Props) {
  const { products, categories, loading, error, fetchProducts, fetchCategories } = useProductCatalog();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productDetails, setProductDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts({ category: selectedCategory ?? undefined });
  }, [selectedCategory]);

  const handleProductClick = async (product: any) => {
    setSelectedProduct(product);
    setProductDetails(null);
    setLoadingDetails(true);
    setSelectedVariantId(null);
    setSelectedColor('');

    try {
      const res = await fetch(`/api/printful/products/${product.id}`);
      const data = await res.json();
      setProductDetails(data);
      if (data.variants?.length) {
        const firstColor = data.variants[0].color;
        setSelectedColor(firstColor);
        setSelectedVariantId(data.variants[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedProduct || !selectedVariantId) return;
    const variant = productDetails?.variants?.find((v: any) => v.id === selectedVariantId);
    onSelect(selectedProduct, variant);
  };

  if (error) return <div className="error-state">Erreur : {error}</div>;

  const colors = productDetails
    ? [...new Set(productDetails.variants?.map((v: any) => v.color))] as string[]
    : [];

  const filteredVariants = productDetails?.variants?.filter((v: any) => v.color === selectedColor) || [];

  return (
    <div className="catalog-layout">

      {/* Sidebar catégories */}
      <aside className="catalog-sidebar">
        <h3 className="sidebar-title">Catégories</h3>
        <button
          className={`category-btn ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          Tous les produits
        </button>
        {categories.map((cat: any) => (
          <button
            key={cat.id}
            className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.title}
            <span className="cat-count">{cat.product_count}</span>
          </button>
        ))}
      </aside>

      {/* Grille produits */}
      <div className="catalog-main">
        <div className="catalog-header">
          <h2>Choisissez votre produit</h2>
          <p className="catalog-subtitle">{products.length} produits disponibles</p>
        </div>

        {loading ? (
          <div className="product-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="product-card skeleton" />
            ))}
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product: any) => (
              <button
                key={product.id}
                className={`product-card ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                onClick={() => handleProductClick(product)}
              >
                <div className="product-image-wrap">
                  <img src={product.image} alt={product.name} className="product-image" loading="lazy" />
                  {selectedProduct?.id === product.id && (
                    <div className="product-selected-badge">✓</div>
                  )}
                </div>
                <div className="product-info">
                  <p className="product-name">{product.name}</p>
                  <p className="product-brand">{product.brand} · {product.model}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panel détail produit */}
      {selectedProduct && (
        <div className="product-detail-panel">
          {loadingDetails ? (
            <div className="panel-loading">Chargement…</div>
          ) : productDetails ? (
            <>
              <div className="panel-header">
                <h3>{selectedProduct.name}</h3>
                <p className="panel-brand">{selectedProduct.brand}</p>
              </div>

              {/* Zones d'impression */}
              <div className="print-areas-section">
                <h4>Zones d'impression</h4>
                <div className="print-areas-list">
                  {productDetails.printAreas?.map((area: any) => (
                    <div key={area.placement} className="print-area-tag">
                      <span className="area-label">{area.label}</span>
                      <div className="area-techniques">
                        {area.techniques.map((t: any) => (
                          <span key={t.id} className="technique-badge">{t.name}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Couleurs */}
              <div className="variant-section">
                <h4>Couleur</h4>
                <div className="color-swatches">
                  {colors.map(color => {
                    const v = productDetails.variants.find((x: any) => x.color === color);
                    return (
                      <button
                        key={color}
                        className={`color-swatch ${selectedColor === color ? 'active' : ''}`}
                        style={{ backgroundColor: v?.color_code || '#ccc' }}
                        title={color}
                        onClick={() => {
                          setSelectedColor(color);
                          const first = productDetails.variants.find((x: any) => x.color === color);
                          if (first) setSelectedVariantId(first.id);
                        }}
                      />
                    );
                  })}
                </div>
                <p className="selected-color-label">{selectedColor}</p>

                {/* Tailles */}
                <h4>Taille</h4>
                <div className="size-buttons">
                  {filteredVariants.map((v: any) => (
                    <button
                      key={v.id}
                      className={`size-btn ${selectedVariantId === v.id ? 'active' : ''}`}
                      onClick={() => setSelectedVariantId(v.id)}
                    >
                      <span className="size-label">{v.size}</span>
                      <span className="size-price">{v.price}€</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn-primary btn-full"
                disabled={!selectedVariantId}
                onClick={handleConfirm}
              >
                Personnaliser ce produit →
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}