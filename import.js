import axios from 'axios';
import fs from 'fs';
import path from 'path';

const GATEWAY_URL = 'http://localhost:5053';

// Tìm file JSON cào gần nhất
function getNewestJSONFile() {
  const files = fs.readdirSync(process.cwd());
  const jsonFiles = files.filter(f => f.startsWith('products_') && f.endsWith('.json'));
  if (jsonFiles.length === 0) return null;
  // Sắp xếp giảm dần theo tên (tên bắt đầu bằng timestamp products_YYYYMMDD_HHMMSS_COUNT.json)
  jsonFiles.sort((a, b) => b.localeCompare(a));
  return jsonFiles[0];
}

// Đăng nhập hoặc tạo mới tài khoản manager
async function getManagerToken() {
  console.log('Đang kết nối tới Gateway để lấy Access Token...');
  
  // 1. Thử đăng nhập bằng manager@gmail.com
  try {
    const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'manager@gmail.com',
      password: '123456'
    });
    if (loginRes.data && loginRes.data.data && loginRes.data.data.accessToken) {
      console.log('Đăng nhập thành công với tài khoản manager@gmail.com');
      return loginRes.data.data.accessToken;
    }
  } catch (error) {
    console.log('Tài khoản manager@gmail.com chưa tồn tại hoặc sai mật khẩu. Tiến hành đăng nhập Admin để khởi tạo...');
  }

  // 2. Đăng nhập bằng admin@sensorx.com
  let adminToken;
  try {
    const adminLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@sensorx.com',
      password: '123456'
    });
    adminToken = adminLoginRes.data.data.accessToken;
    console.log('Đăng nhập thành công với tài khoản Admin.');
  } catch (err) {
    console.error('Đăng nhập Admin thất bại. Vui lòng kiểm tra trạng thái dịch vụ Gateway hoặc seed data.', err.message);
    throw err;
  }

  // 3. Tạo tài khoản manager@gmail.com
  try {
    console.log('Đang tạo tài khoản manager@gmail.com...');
    await axios.post(`${GATEWAY_URL}/auth/create`, {
      email: 'manager@gmail.com',
      password: '123456',
      role: 4 // Manager role
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('Tạo tài khoản manager@gmail.com thành công!');
  } catch (createErr) {
    // Tránh lỗi nếu tài khoản đã được tạo nhưng lỗi login bước trước
    if (createErr.response?.data?.message?.includes('exists') || createErr.response?.data?.Message?.includes('exists')) {
      console.log('Tài khoản manager@gmail.com đã tồn tại.');
    } else {
      console.error('Lỗi khi tạo tài khoản manager:', createErr.response?.data || createErr.message);
      throw createErr;
    }
  }

  // 4. Đăng nhập lại để lấy token cuối cùng
  try {
    const finalLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'manager@gmail.com',
      password: '123456'
    });
    return finalLoginRes.data.data.accessToken;
  } catch (err) {
    console.error('Đăng nhập manager@gmail.com sau khi khởi tạo thất bại:', err.message);
    throw err;
  }
}

async function main() {
  const jsonFile = getNewestJSONFile();
  if (!jsonFile) {
    console.error('Không tìm thấy file products_*.json nào trong thư mục hiện tại. Hãy chạy "node crawl.js" trước.');
    return;
  }

  const filepath = path.join(process.cwd(), jsonFile);
  console.log(`Đọc dữ liệu từ file: ${filepath}`);
  const scrapedProducts = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  console.log(`Tìm thấy ${scrapedProducts.length} sản phẩm cần xử lý.`);

  const token = await getManagerToken();
  const api = axios.create({
    baseURL: `${GATEWAY_URL}/api/data`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // 1. Tải danh mục (Categories) hiện tại
  console.log('Đang tải danh mục sản phẩm từ hệ thống...');
  const catRes = await api.get('/catalog/categories/list-all');
  const categories = catRes.data.value || [];
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase().trim(), c.id]));

  // 2. Tải nhà cung cấp (Suppliers) hiện tại
  console.log('Đang tải nhà cung cấp từ hệ thống...');
  const supRes = await api.get('/catalog/suppliers/list-all');
  const suppliers = supRes.data.value || [];
  const supplierMap = new Map(suppliers.map(s => [s.name.toLowerCase().trim(), s.id]));

  // 3. Tải đơn vị tính (Unit of Quantities) hiện tại
  console.log('Đang tải đơn vị tính từ hệ thống...');
  const unitRes = await api.get('/catalog/unit-of-quantities/list-all');
  const units = unitRes.data.value || [];
  const unitMap = new Map(units.map(u => [u.name.toLowerCase().trim(), u.id]));

  // 4. Tải danh sách hàng hóa hiện có để chống trùng lặp
  console.log('Đang tải danh sách hàng hóa hiện tại để đối chiếu...');
  const prodRes = await api.get('/catalog/products/list?pageSize=100000');
  // API trả về OffsetPagedResult chứa Items
  const existingProducts = prodRes.data.value?.items || [];
  const existingNamesSet = new Set(existingProducts.map(p => p.name.toLowerCase().trim()));
  console.log(`Hệ thống đang có ${existingProducts.length} sản phẩm.`);

  // 5. Đảm bảo đơn vị tính mặc định "Cái"
  let defaultUnitId = unitMap.get('cái');
  if (!defaultUnitId) {
    console.log('Chưa có đơn vị tính "Cái", đang tạo mới...');
    const createUnitRes = await api.post('/catalog/unit-of-quantities/create', {
      name: 'Cái',
      description: 'Đơn vị tính số lượng sản phẩm'
    });
    defaultUnitId = createUnitRes.data.value;
    unitMap.set('cái', defaultUnitId);
  }

  let importedCount = 0;
  let skippedCount = 0;

  console.log('=== BẮT ĐẦU IMPORT SẢN PHẨM ===');
  for (const item of scrapedProducts) {
    const normalizedName = item.name.toLowerCase().trim();
    
    // Kiểm tra trùng lặp
    if (existingNamesSet.has(normalizedName)) {
      skippedCount++;
      continue;
    }

    try {
      // Đảm bảo Nhà cung cấp tồn tại
      const normSupplier = item.supplierName.toLowerCase().trim();
      let supplierId = supplierMap.get(normSupplier);
      if (!supplierId) {
        console.log(`Nhà cung cấp "${item.supplierName}" chưa tồn tại, đang tạo mới...`);
        const createSupRes = await api.post('/catalog/suppliers/create', {
          name: item.supplierName,
          description: 'Hãng sản xuất thiết bị cào tự động'
        });
        supplierId = createSupRes.data.value;
        supplierMap.set(normSupplier, supplierId);
      }

      // Đảm bảo Danh mục tồn tại
      const normCategory = item.categoryName.toLowerCase().trim();
      let categoryId = categoryMap.get(normCategory);
      if (!categoryId) {
        console.log(`Danh mục "${item.categoryName}" chưa tồn tại, đang tạo mới...`);
        const createCatRes = await api.post('/catalog/categories/create', {
          name: item.categoryName,
          description: 'Danh mục hàng hóa cào tự động'
        });
        categoryId = createCatRes.data.value;
        categoryMap.set(normCategory, categoryId);
      }

      // Tạo sản phẩm
      const payload = {
        name: item.name,
        supplierId: supplierId,
        categoryId: categoryId,
        unitOfQuantityId: defaultUnitId,
        showcase: item.imageUrl || null,
        images: item.imageUrl ? [item.imageUrl] : []
      };

      await api.post('/catalog/products/create', payload);
      importedCount++;
      existingNamesSet.add(normalizedName); // Cập nhật danh sách in-memory để chống trùng lặp chéo

      if (importedCount % 50 === 0) {
        console.log(`Đã import thành công: ${importedCount}/${scrapedProducts.length - skippedCount} sản phẩm (Bỏ qua trùng lặp: ${skippedCount})`);
      }
    } catch (err) {
      console.error(`Lỗi khi import sản phẩm "${item.name}":`, err.response?.data || err.message);
    }
  }

  console.log(`\n=== TỔNG KẾT IMPORT ===`);
  console.log(`- Đã import mới thành công: ${importedCount}`);
  console.log(`- Bỏ qua do trùng lặp: ${skippedCount}`);
  console.log(`- Tổng số sản phẩm hiện có trong hệ thống: ${existingNamesSet.size}`);
}

main().catch(err => {
  console.error('Lỗi nghiêm trọng:', err);
});
