import axios from 'axios';
import { getManagerToken, GATEWAY_URL } from '../utils/api.js';

export async function importProducts(scrapedProducts) {
  if (!scrapedProducts || scrapedProducts.length === 0) {
    console.log('Không có dữ liệu sản phẩm để import.');
    return;
  }

  const token = await getManagerToken();
  const api = axios.create({
    baseURL: `${GATEWAY_URL}/api/data`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // 1. Tải danh mục hiện tại
  console.log('Đang tải danh mục sản phẩm từ hệ thống...');
  const catRes = await api.get('/catalog/categories/list-all');
  const categories = catRes.data.value || [];
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase().trim(), c.id]));

  // 2. Tải nhà cung cấp hiện tại
  console.log('Đang tải nhà cung cấp từ hệ thống...');
  const supRes = await api.get('/catalog/suppliers/list-all');
  const suppliers = supRes.data.value || [];
  const supplierMap = new Map(suppliers.map(s => [s.name.toLowerCase().trim(), s.id]));

  // 3. Tải đơn vị tính
  console.log('Đang tải đơn vị tính từ hệ thống...');
  const unitRes = await api.get('/catalog/unit-of-quantities/list-all');
  const units = unitRes.data.value || [];
  const unitMap = new Map(units.map(u => [u.name.toLowerCase().trim(), u.id]));

  // 4. Tải danh sách hàng hóa hiện có
  console.log('Đang tải danh sách hàng hóa hiện tại để đối chiếu...');
  const prodRes = await api.get('/catalog/products/list?pageSize=100000');
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
    
    if (existingNamesSet.has(normalizedName)) {
      skippedCount++;
      continue;
    }

    try {
      const normSupplier = (item.supplierName || 'Unknown').toLowerCase().trim();
      let supplierId = supplierMap.get(normSupplier);
      if (!supplierId) {
        console.log(`Nhà cung cấp "${item.supplierName}" chưa tồn tại, đang tạo mới...`);
        const createSupRes = await api.post('/catalog/suppliers/create', {
          name: item.supplierName || 'Unknown',
          description: 'Hãng sản xuất'
        });
        supplierId = createSupRes.data.value;
        supplierMap.set(normSupplier, supplierId);
      }

      const normCategory = (item.categoryName || 'Unknown').toLowerCase().trim();
      let categoryId = categoryMap.get(normCategory);
      if (!categoryId) {
        console.log(`Danh mục "${item.categoryName}" chưa tồn tại, đang tạo mới...`);
        const createCatRes = await api.post('/catalog/categories/create', {
          name: item.categoryName || 'Unknown',
          description: 'Danh mục hàng hóa'
        });
        categoryId = createCatRes.data.value;
        categoryMap.set(normCategory, categoryId);
      }

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
      existingNamesSet.add(normalizedName);

      if (importedCount % 50 === 0) {
        console.log(`Đã import thành công: ${importedCount} sản phẩm (Bỏ qua trùng lặp: ${skippedCount})`);
      }
    } catch (err) {
      console.error(`Lỗi khi import sản phẩm "${item.name}":`, err.response?.data || err.message);
    }
  }

  console.log(`\n=== TỔNG KẾT IMPORT SẢN PHẨM ===`);
  console.log(`- Đã import mới thành công: ${importedCount}`);
  console.log(`- Bỏ qua do trùng lặp: ${skippedCount}`);
}
