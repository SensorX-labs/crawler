import { apiClient } from '../utils/apiClient.js';

const BATCH_SIZE = 50;

const CATEGORY_FALLBACKS = {
  'Đầu nối & Chân pin': 15000,
  'Cầu tiếp địa & Cầu đấu': 45000,
  'Thiết bị tự động hóa': 1200000,
  'Rơ le trung gian': 120000,
  'Cảm biến': 350000,
  'Công tắc & Nút nhấn': 80000,
  'Bộ nguồn': 650000
};

function computeWordOverlap(name1, name2) {
  const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const words1 = new Set(clean(name1));
  const words2 = clean(name2);
  let overlap = 0;
  for (const w of words2) {
    if (words1.has(w)) overlap++;
  }
  return overlap;
}

function estimatePrice(product, crawledPrices) {
  const category = product.categoryName;
  const productName = product.name;

  const sameCategorySamples = crawledPrices.filter(
    p => p.categoryName === category || p.category === category
  );

  if (sameCategorySamples.length === 0) {
    return CATEGORY_FALLBACKS[category] || 100000;
  }

  let bestMatch = null;
  let maxOverlap = 0;

  for (const sample of sameCategorySamples) {
    const overlap = computeWordOverlap(productName, sample.name);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestMatch = sample;
    }
  }

  if (maxOverlap >= 2 && bestMatch?.price) {
    return bestMatch.price;
  }

  const validPrices = sameCategorySamples.filter(p => p.price && p.price > 0);
  if (validPrices.length === 0) return CATEGORY_FALLBACKS[category] || 100000;

  const avg = Math.round(validPrices.reduce((acc, cur) => acc + cur.price, 0) / validPrices.length);
  return avg || CATEGORY_FALLBACKS[category] || 100000;
}

/**
 * Import/cập nhật bảng giá cho tất cả sản phẩm trong hệ thống.
 * Deactivate giá cũ → tạo giá mới.
 *
 * @param {Array} crawledPrices - Mảng giá tham chiếu từ crawl (có thể rỗng)
 * @returns {{ success: number, skipped: number, errors: string[] }}
 */
export async function importPrices(crawledPrices = []) {
  const result = { success: 0, skipped: 0, errors: [] };

  await apiClient.init();
  const api = apiClient.data;

  console.log('Đang tải danh sách sản phẩm từ hệ thống...');
  const prodRes = await api.get('/catalog/products/list?pageSize=100000');
  const products = prodRes.data.value?.items || [];
  console.log(`Tổng số sản phẩm: ${products.length}`);

  if (products.length === 0) {
    console.log('Không có sản phẩm nào, vui lòng import sản phẩm trước.');
    return result;
  }

  console.log('Đang tải danh sách bảng giá hiện tại...');
  const priceRes = await api.get('/catalog/internal-prices/list?pageSize=100000');
  const existingPrices = priceRes.data.value?.items || [];

  const activePrices = existingPrices.filter(
    p => p.status === 2 || p.status === 'Active' || !p.isExpired
  );
  const activePriceMap = new Map(activePrices.map(p => [p.productId, p]));

  // 1. Deactivate giá cũ
  const deactivations = products
    .map(p => activePriceMap.get(p.id)?.id)
    .filter(Boolean);

  if (deactivations.length > 0) {
    console.log(`Deactivate ${deactivations.length} bảng giá cũ...`);
    for (let i = 0; i < deactivations.length; i += BATCH_SIZE) {
      const batch = deactivations.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (id) => {
        try {
          await api.patch(`/catalog/internal-prices/${id}/deactivate`);
        } catch (err) {
          result.errors.push(`Lỗi deactivate giá ${id}: ${err.message}`);
        }
      }));
    }
  }

  // 2. Tạo giá mới
  console.log('Bắt đầu tạo bảng giá mới...');
  const payloads = products.map(product => {
    let msrp = estimatePrice(product, crawledPrices);
    if (msrp < 10000) msrp = 10000;
    const suggestedPrice = Math.round(msrp);
    const floorPrice = Math.round(msrp * 0.75);
    return {
      productId: product.id,
      suggestedPrice,
      floorPrice,
      priceTiers: [
        { quantity: 5, price: Math.round(suggestedPrice * 0.95) },
        { quantity: 10, price: Math.round(suggestedPrice * 0.90) },
        { quantity: 20, price: Math.round(suggestedPrice * 0.85) }
      ],
      isInfinite: true
    };
  });

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (payload) => {
      try {
        await api.post('/catalog/internal-prices/create', payload);
        result.success++;
      } catch (err) {
        if (apiClient.isAlreadyExistsError(err)) {
          result.skipped++;
        } else {
          const msg = `Lỗi tạo giá SP ${payload.productId}: ${err.response?.data?.message || err.message}`;
          result.errors.push(msg);
        }
      }
    }));

    if (i > 0 && i % 500 === 0) {
      console.log(`Đã tạo bảng giá: ${Math.min(i + BATCH_SIZE, payloads.length)}/${payloads.length}`);
    }
  }

  console.log(`\n=== TỔNG KẾT IMPORT BẢNG GIÁ ===`);
  console.log(`- Đã tạo mới: ${result.success}/${payloads.length}`);
  console.log(`- Bỏ qua: ${result.skipped}`);
  console.log(`- Lỗi: ${result.errors.length}`);

  return result;
}
