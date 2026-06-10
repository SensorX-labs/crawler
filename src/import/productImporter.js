import { apiClient } from '../utils/apiClient.js';

/**
 * Import sản phẩm đã crawl vào hệ thống.
 * Tự động tạo Nhà cung cấp, Danh mục, Đơn vị tính nếu chưa có.
 * Bỏ qua sản phẩm đã tồn tại (theo tên).
 *
 * @param {Array} scrapedProducts - Mảng sản phẩm từ file JSON crawl
 * @returns {{ success: number, skipped: number, errors: string[] }}
 */
export async function importProducts(scrapedProducts) {
  const result = { success: 0, skipped: 0, errors: [] };

  if (!scrapedProducts || scrapedProducts.length === 0) {
    console.log('Không có dữ liệu sản phẩm để import.');
    return result;
  }

  await apiClient.init();
  const api = apiClient.data;

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

  // 4. Tải danh sách sản phẩm hiện có để đối chiếu
  console.log('Đang tải danh sách sản phẩm hiện tại...');
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

  console.log(`\n=== BẮT ĐẦU IMPORT ${scrapedProducts.length} SẢN PHẨM ===`);

  for (const item of scrapedProducts) {
    const normalizedName = item.name.toLowerCase().trim();

    // Bỏ qua nếu đã tồn tại
    if (existingNamesSet.has(normalizedName)) {
      result.skipped++;
      continue;
    }

    try {
      // Tạo/lấy Nhà cung cấp
      const normSupplier = (item.supplierName || 'Unknown').toLowerCase().trim();
      let supplierId = supplierMap.get(normSupplier);
      if (!supplierId) {
        const createSupRes = await api.post('/catalog/suppliers/create', {
          name: item.supplierName || 'Unknown',
          description: 'Hãng sản xuất'
        });
        supplierId = createSupRes.data.value;
        supplierMap.set(normSupplier, supplierId);
      }

      // Tạo/lấy Danh mục
      const normCategory = (item.categoryName || 'Unknown').toLowerCase().trim();
      let categoryId = categoryMap.get(normCategory);
      if (!categoryId) {
        const createCatRes = await api.post('/catalog/categories/create', {
          name: item.categoryName || 'Unknown',
          description: 'Danh mục hàng hóa'
        });
        categoryId = createCatRes.data.value;
        categoryMap.set(normCategory, categoryId);
      }

      await api.post('/catalog/products/create', {
        name: item.name,
        supplierId,
        categoryId,
        unitOfQuantityId: defaultUnitId,
        showcase: item.imageUrl || null,
        images: item.imageUrl ? [item.imageUrl] : []
      });

      result.success++;
      existingNamesSet.add(normalizedName);

      if (result.success % 50 === 0) {
        console.log(`Đã import: ${result.success} sản phẩm (Bỏ qua: ${result.skipped})`);
      }
    } catch (err) {
      if (apiClient.isAlreadyExistsError(err)) {
        result.skipped++;
        existingNamesSet.add(normalizedName);
      } else {
        const msg = `Lỗi SP "${item.name}": ${err.response?.data?.message || err.message}`;
        result.errors.push(msg);
        console.error(msg);
      }
    }
  }

  console.log(`\n=== TỔNG KẾT IMPORT SẢN PHẨM ===`);
  console.log(`- Đã import mới: ${result.success}`);
  console.log(`- Bỏ qua trùng lặp: ${result.skipped}`);
  console.log(`- Lỗi: ${result.errors.length}`);

  return result;
}
