import axios from 'axios';
import * as cheerio from 'cheerio';

const CATEGORIES = {
  'Đầu nối & Chân pin': 'https://codienhaiau.com/category/dau-cosse/',
  'Cầu tiếp địa & Cầu đấu': 'https://codienhaiau.com/category/cau-dau-day-dien/',
  'Thiết bị tự động hóa': 'https://codienhaiau.com/category/plc/',
  'Rơ le trung gian': 'https://codienhaiau.com/category/ro-le-trung-gian/',
  'Cảm biến': 'https://codienhaiau.com/category/cam-bien/',
  'Công tắc & Nút nhấn': 'https://codienhaiau.com/category/nut-nhan/',
  'Bộ nguồn': 'https://codienhaiau.com/category/bo-nguon/'
};

function parsePrice(priceText) {
  if (!priceText) return null;
  const cleanText = priceText.replace(/\s/g, '');

  if (priceText.includes('Giá hiện tại là:')) {
    const parts = priceText.split('Giá hiện tại là:');
    const currentPricePart = parts[parts.length - 1];
    const match = currentPricePart.match(/\d+(\.\d+)*/);
    if (match) return parseInt(match[0].replace(/\./g, ''), 10);
  }

  const numbers = cleanText.match(/\d+(\.\d+)*/g);
  if (!numbers || numbers.length === 0) return null;
  return parseInt(numbers[0].replace(/\./g, ''), 10);
}

async function scrapeCategory(categoryName, url) {
  const products = [];
  console.log(`Đang cào danh mục: ${categoryName} (${url})...`);

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(res.data);

    $('li.product').each((i, el) => {
      const name = $(el).find('.woocommerce-loop-product__title, h2, h3').text().trim();
      const priceText = $(el).find('.price').text().trim();
      const link = $(el).find('a').attr('href');
      const price = parsePrice(priceText);
      const imgEl = $(el).find('img').first();
      const imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';

      if (name) {
        products.push({
          categoryName,
          name,
          price: price || 0,
          productUrl: link,
          imageUrl,
          supplierName: 'Hải Âu',
          unitName: 'Cái'
        });
      }
    });

    console.log(`-> Tìm thấy ${products.length} sản phẩm.`);
  } catch (err) {
    console.error(`Lỗi khi cào danh mục ${categoryName}:`, err.message);
  }

  return products;
}

export async function scrapeHaiAu() {
  const allProducts = [];

  for (const [name, url] of Object.entries(CATEGORIES)) {
    const products = await scrapeCategory(name, url);
    allProducts.push(...products);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allProducts;
}
