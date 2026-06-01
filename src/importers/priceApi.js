import axios from 'axios';
import { getManagerToken, GATEWAY_URL } from '../utils/api.js';

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
  
  const sameCategorySamples = crawledPrices.filter(p => p.categoryName === category || p.category === category);
  
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
  
  if (maxOverlap >= 2 && bestMatch && bestMatch.price) {
    return bestMatch.price;
  }
  
  const validPrices = sameCategorySamples.filter(p => p.price && p.price > 0);
  if (validPrices.length === 0) return CATEGORY_FALLBACKS[category] || 100000;

  const sum = validPrices.reduce((acc, curr) => acc + curr.price, 0);
  const avg = Math.round(sum / validPrices.length);
  return avg || CATEGORY_FALLBACKS[category] || 100000;
}

export async function importPrices(crawledPrices) {
  const token = await getManagerToken();
  const api = axios.create({
    baseURL: `${GATEWAY_URL}/api/data`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('Đang tải danh sách sản phẩm từ hệ thống để chuẩn bị làm giá...');
  const prodRes = await api.get('/catalog/products/list?pageSize=100000');
  const products = prodRes.data.value?.items || [];
  console.log(`Tổng số sản phẩm trong hệ thống: ${products.length}`);

  if (products.length === 0) {
    console.log('Không có sản phẩm nào trong hệ thống, vui lòng import sản phẩm trước.');
    return;
  }

  console.log('Đang tải danh sách bảng giá hiện tại...');
  const priceRes = await api.get('/catalog/internal-prices/list?pageSize=100000');
  const existingPrices = priceRes.data.value?.items || [];

  const activePrices = existingPrices.filter(p => p.status === 2 || p.status === 'Active' || !p.isExpired);
  const activePriceMap = new Map(activePrices.map(p => [p.productId, p]));

  // 1. Deactivate
  const deactivations = [];
  for (const product of products) {
    const activePrice = activePriceMap.get(product.id);
    if (activePrice) {
      deactivations.push(activePrice.id);
    }
  }

  if (deactivations.length > 0) {
    console.log(`Bắt đầu deactivate ${deactivations.length} bảng giá cũ...`);
    for (let i = 0; i < deactivations.length; i += BATCH_SIZE) {
      const batch = deactivations.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (id) => {
        try {
          await api.patch(`/catalog/internal-prices/${id}/deactivate`);
        } catch (err) {
          console.error(`Lỗi khi deactivate bảng giá ${id}:`, err.message);
        }
      }));
    }
  }

  // 2. Tạo mới
  console.log('Bắt đầu tạo bảng giá mới...');
  const payloads = [];
  for (const product of products) {
    let msrp = estimatePrice(product, crawledPrices);
    if (msrp < 10000) msrp = 10000;

    const suggestedPrice = Math.round(msrp);
    const floorPrice = Math.round(msrp * 0.75);
    
    const priceTiers = [
      { quantity: 5, price: Math.round(suggestedPrice * 0.95) },
      { quantity: 10, price: Math.round(suggestedPrice * 0.90) },
      { quantity: 20, price: Math.round(suggestedPrice * 0.85) }
    ];

    payloads.push({
      productId: product.id,
      suggestedPrice,
      floorPrice,
      priceTiers,
      isInfinite: true
    });
  }

  let createdCount = 0;
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (payload) => {
      try {
        await api.post('/catalog/internal-prices/create', payload);
        createdCount++;
      } catch (err) {
        console.error(`Lỗi khi tạo bảng giá cho SP ${payload.productId}:`, err.response?.data || err.message);
      }
    }));
    if (i % 500 === 0 && i > 0) {
        console.log(`Đã tạo bảng giá: ${Math.min(i + BATCH_SIZE, payloads.length)}/${payloads.length}`);
    }
  }

  console.log(`\n=== TỔNG KẾT IMPORT BẢNG GIÁ ===`);
  console.log(`- Đã tạo thành công ${createdCount}/${payloads.length} bảng giá mới.`);
}
