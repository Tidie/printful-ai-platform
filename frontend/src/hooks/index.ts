import { useState, useCallback } from 'react';

export function useProductCatalog() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async ({ category, limit = 50, offset = 0 }: any = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit, offset });
      if (category) params.append('category', category);
      const res = await fetch(`/api/printful/products?${params}`);
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/printful/categories');
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Categories error:', err);
    }
  }, []);

  return { products, categories, loading, error, fetchProducts, fetchCategories };
}

export function useMockupGenerator() {
  const generateMockup = async (variantId: number, files: any[]) => {
    const res = await fetch('/api/printful/mockup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId, files }),
    });
    if (!res.ok) throw new Error('Mockup generation failed');
    const data = await res.json();
    return data.mockups;
  };

  return { generateMockup };
}