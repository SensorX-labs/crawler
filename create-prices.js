import axios from 'axios';
import fs from 'fs';
import path from 'path';

const GATEWAY_URL = 'http://localhost:5053';
const BATCH_SIZE = 50;

// Danh mục mặc định và giá trị trung bình nếu không khớp
const CATEGORY_FALLBACKS = {
  'Đầu nối & Chân pin': 15000,
  'Cầu tiếp địa & Cầu đấu': 45000,
  'Thiết bị tự động hóa': 1200000,
  'Rơ le trung gian': 120000,
  'Cảm biến': 350000,
  'Công tắc & Nút nhấn': 80000,
  'Bộ nguồn': 650000
};

// Đăng nhập hoặc lấy Token
async function getManagerToken() {
  try {
    const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'manager@gmail.com',
      password: '123456'
    });
    return loginRes.data.data.accessToken;
  } catch (error) {
    const adminLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@sensorx.com',
      password: '123456'
    });
    return adminLoginRes.data.data.accessToken;
  }
}

// So khớp từ khóa để tính độ tương đồng
function computeWordOverlap(name1, name2) {
  const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const words1 = new Set(clean(name1));
  const words2 = clean(name2);
  let overlap = 0;
  for (const w of words2) {
    if (words1.has(w)) overlap++;
  }
  return overlap;
}

// Tìm giá thực tế phù hợp từ dữ liệu cào
function estimatePrice(product, crawledPrices) {
  const category = product.categoryName;
  const productName = product.name;
  
  // Lọc sản phẩm cùng danh mục từ dữ liệu Hải Âu
  const sameCategorySamples = crawledPrices.filter(p => p.category === category);
  
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
  
  // Nếu có trùng khớp từ khóa tốt (>= 2 từ khớp)
  if (maxOverlap >= 2 && bestMatch) {
    return bestMatch.price;
  }
  
  // Fallback: Lấy giá trung bình của danh mục đó trong dữ liệu cào
  const sum = sameCategorySamples.reduce((acc, curr) => acc + curr.price, 0);
  const avg = Math.round(sum / sameCategorySamples.length);
  return avg || CATEGORY_FALLBACKS[category] || 100000;
}

async function main() {
  const token = await getManagerToken();
  const api = axios.create({
    baseURL: `${GATEWAY_URL}/api/data`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // Đọc dữ liệu giá từ codienhaiau
  const haiauPricesPath = path.join(process.cwd(), 'haiau_prices.json');
  let crawledPrices = [];
  if (fs.existsSync(haiauPricesPath)) {
    crawledPrices = JSON.parse(fs.readFileSync(haiauPricesPath, 'utf-8'));
    console.log(`Đã đọc ${crawledPrices.length} sản phẩm mẫu từ haiau_prices.json`);
  } else {
    console.log('Không tìm thấy haiau_prices.json. Sẽ sử dụng giá trị fallback của danh mục.');
  }

  // Tải toàn bộ sản phẩm
  console.log('Đang tải danh sách sản phẩm từ hệ thống...');
  const prodRes = await api.get('/catalog/products/list?pageSize=100000');
  const products = prodRes.data.value?.items || [];
  console.log(`Tổng số sản phẩm trong hệ thống: ${products.length}`);

  // Tải danh sách bảng giá hiện tại
  console.log('Đang tải danh sách bảng giá hiện tại...');
  const priceRes = await api.get('/catalog/internal-prices/list?pageSize=100000');
  const existingPrices = priceRes.data.value?.items || [];
  console.log(`Tổng số bảng giá hiện tại: ${existingPrices.length}`);

  // Bản đồ các bảng giá Active theo ProductId
  const activePrices = existingPrices.filter(p => p.status === 2 || p.status === 'Active' || !p.isExpired);
  const activePriceMap = new Map(activePrices.map(p => [p.productId, p]));

  // 1. Deactivate các bảng giá active cũ của các sản phẩm có giá
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
      console.log(`Đã deactivate lô: ${Math.min(i + BATCH_SIZE, deactivations.length)}/${deactivations.length}`);
    }
  }

  // 2. Tạo bảng giá mới cho toàn bộ sản phẩm
  console.log('Bắt đầu tạo bảng giá mới...');
  const payloads = [];
  for (const product of products) {
    let msrp = estimatePrice(product, crawledPrices);
    if (msrp < 10000) msrp = 10000; // Đảm bảo giá tối thiểu 10k VND

    const suggestedPrice = Math.round(msrp);
    const floorPrice = Math.round(msrp * 0.75);
    
    // Tạo 3 bậc giá sỉ giảm dần
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
    console.log(`Đã tạo bảng giá: ${Math.min(i + BATCH_SIZE, payloads.length)}/${payloads.length}`);
  }

  console.log(`\n=== TỔNG KẾT ===`);
  console.log(`- Đã tạo thành công ${createdCount}/${payloads.length} bảng giá mới.`);
}

main().catch(console.error);
