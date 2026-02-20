import { useState, useEffect } from 'react';
import { useProductCatalog } from '../hooks/index';

interface Props {
  onSelect: (product: any, variant: any) => void;
}

const TOP_CATEGORIES = [
  { id: 1,   title: "Men's clothing" },
  { id: 2,   title: "Women's clothing" },
  { id: 3,   title: "Kids' & youth clothing" },
  { id: 4,   title: "Accessories" },
  { id: 5,   title: "Home & living" },
];

export function ProductCatalog({ onSelect }: Props) {
  const { products, categories, loading, error, fetchProducts, fetchCategories } = useProductCatalog();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productDetails, setProductDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('');

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts({ category: selectedSubCategory ?? selectedCategory ?? undefined });
    setSelectedProduct(null);
    setProductDetails(null);
  }, [selectedCategory, selectedSubCategory]);

  const handleCategoryClick = (id: number | null) => {
    setSelectedCategory(id);
    setSelectedSubCategory(null);
  };

  // Sous-catégories de la catégorie active
  const subCategories = categories.filter((cat: any) =>
    cat.parent_id === selectedCategory
  );

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

  const colors = productDetails
    ? ([...new Set(productDetails.variants?.map((v: any) => v.color))] as string[])
    : [];

  const filteredVariants = productDetails?.variants?.filter((v: any) => v.color === selectedColor) || [];

  const currentCategoryTitle = selectedCategory
    ? TOP_CATEGORIES.find(c => c.id === selectedCategory)?.title
    : 'Tous les produits';

  if (error) return <div className="error-state">Erreur : {error}</div>;

  return (
    <div>
      {/* ── Navigation catégories principales ── */}
      <nav className="category-nav">
        <button
          className={`category-nav-btn ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => handleCategoryClick(null)}
        >
          Tout
        </button>
        {TOP_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`category-nav-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategoryClick(cat.id)}
          >
            {cat.title}
          </button>
        ))}
      </nav>

      <div className="catalog-layout">
        {/* ── Grille produits ── */}
        <div className="catalog-main">

          <div className="catalog-header">
            <h2>{currentCategoryTitle}</h2>
            <span className="catalog-subtitle">{products.length} produits</span>
          </div>

          {/* Sous-catégories en pills */}
          {subCategories.length > 0 && (
            <div className="subcategory-pills">
              <button
                className={`subcategory-pill ${selectedSubCategory === null ? 'active' : ''}`}
                onClick={() => setSelectedSubCategory(null)}
              >
                Tout voir
              </button>
              {subCategories.map((sub: any) => (
                <button
                  key={sub.id}
                  className={`subcategory-pill ${selectedSubCategory === sub.id ? 'active' : ''}`}
                  onClick={() => setSelectedSubCategory(sub.id)}
                >
                  {sub.title}
                </button>
              ))}
            </div>
          )}

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
                    <img
                      src={product.image}
                      alt={product.name}
                      className="product-image"
                      loading="lazy"
                    />
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

        {/* ── Panel détail produit ── */}
        {selectedProduct && (
          <div className="product-detail-panel">
            {loadingDetails ? (
              <div className="panel-loading">Chargement des variantes…</div>
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
    </div>
  );
}
