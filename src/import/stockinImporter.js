import { apiClient } from '../utils/apiClient.js';
import { WAREHOUSE_ACCOUNT_TEMPLATE } from './accountImporter.js';

const BATCH_SIZE = 500;

/**
 * Import tồn kho ban đầu: tạo phiếu StockIn ngẫu nhiên cho tất cả sản phẩm × tất cả kho.
 * Số lượng mỗi sản phẩm: random 100–10000.
 *
 * @returns {{ success: number, skipped: number, errors: string[] }}
 */
export async function importInventory() {
  console.log('=== BẮT ĐẦU IMPORT DỮ LIỆU TỒN KHO ===');
  const result = { success: 0, skipped: 0, errors: [] };

  await apiClient.init();
  const dataApi = apiClient.data;
  const masterApi = apiClient.master;
  const warehouseApi = apiClient.warehouse;

  // 1. Tải danh sách kho
  console.log('Đang tải danh sách kho...');
  const whRes = await masterApi.get('/warehouses');
  const warehouses = whRes.data.value || whRes.data.items || whRes.data || [];

  if (warehouses.length === 0) {
    const msg = 'Không tìm thấy kho nào trên hệ thống. Dừng quá trình.';
    console.log(msg);
    result.errors.push(msg);
    return result;
  }
  console.log(`Tìm thấy ${warehouses.length} kho: ${warehouses.map(w => w.name).join(', ')}`);

  // 2. Tải danh sách sản phẩm
  console.log('Đang tải danh sách sản phẩm...');
  const prodRes = await dataApi.get('/catalog/products/list?pageSize=100000');
  const products = prodRes.data.value?.items || [];

  if (products.length === 0) {
    const msg = 'Không tìm thấy sản phẩm nào trên hệ thống. Dừng quá trình.';
    console.log(msg);
    result.errors.push(msg);
    return result;
  }
  console.log(`Tìm thấy ${products.length} sản phẩm.`);

  // 3. Tạo phiếu nhập kho theo batch cho từng kho
  // Mỗi kho được gán 1 thủ kho theo index dựa trên WAREHOUSE_ACCOUNT_TEMPLATE
  for (let wi = 0; wi < warehouses.length; wi++) {
    const warehouse = warehouses[wi];
    const template = WAREHOUSE_ACCOUNT_TEMPLATE[wi % WAREHOUSE_ACCOUNT_TEMPLATE.length];
    const keeperName = wi < WAREHOUSE_ACCOUNT_TEMPLATE.length ? template.fullName : `Thủ Kho ${wi + 1}`;
    console.log(`\n>>> Đang tạo phiếu nhập kho cho: ${warehouse.name} (${warehouse.id}) — Thủ kho: ${keeperName}`);

    let currentBatch = [];
    let batchIndex = 1;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const randomQuantity = Math.floor(Math.random() * (10000 - 100 + 1)) + 100;

      currentBatch.push({
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        unit: product.unitOfQuantity?.name || 'Cái',
        quantity: randomQuantity,
        floor: null,
        brandZone: null,
        rackCode: null
      });

      if (currentBatch.length === BATCH_SIZE || i === products.length - 1) {
        const payload = {
          deliveredBy: 'Auto Importer',
          warehouseKeeper: keeperName,
          description: `Khởi tạo tồn kho ngẫu nhiên - Đợt ${batchIndex}`,
          items: currentBatch
        };

        try {
          console.log(`Gửi StockIn đợt ${batchIndex} (${currentBatch.length} SP)...`);
          await warehouseApi.post('/stockIn/createStockIn', payload, {
            headers: { 'X-Warehouse-Id': warehouse.id }
          });
          console.log(`✓ Nhập kho đợt ${batchIndex} thành công.`);
          result.success++;
        } catch (err) {
          const msg = `Lỗi StockIn đợt ${batchIndex} (kho ${warehouse.name}): ${err.response?.data?.message || err.message}`;
          console.error(`✗ ${msg}`);
          result.errors.push(msg);
        }

        currentBatch = [];
        batchIndex++;
      }
    }
  }

  console.log('\n=== HOÀN TẤT IMPORT DỮ LIỆU TỒN KHO ===');
  console.log(`- Phiếu thành công: ${result.success}`);
  console.log(`- Lỗi: ${result.errors.length}`);

  return result;
}
