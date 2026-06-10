import { apiClient } from '../utils/apiClient.js';

export const STAFF_ACCOUNTS = [
  { email: 'manager@sensorx.com', password: '123456', role: 3, fullName: 'Nguyễn Tùng Sk', phone: '0392604701' }, // Role.Manager
  { email: 'nguyentungsk@gmail.com', password: '123456', role: 2, fullName: 'Nguyễn Tùng Sk', phone: '0365436609' }, // Role.SaleStaff
  { email: 'nguyenduyduc@gmail.com', password: '123456', role: 2, fullName: 'Nguyễn Duy Đức', phone: '0353744555' }, // Role.SaleStaff
  { email: 'chuduchai@gmail.com', password: '123456', role: 2, fullName: 'Chu Đức Hải', phone: '0399959521' }  // Role.SaleStaff
];

/**
 * Template tạo tài khoản WarehouseStaff (role = 1).
 * warehouseId được truyền vào lúc runtime sau khi lấy danh sách kho từ API.
 * Gateway bắt buộc có warehouseId khi tạo role WarehouseStaff
 * (xem CreateAccountHandler.cs line 37). 
 */
export const WAREHOUSE_ACCOUNT_TEMPLATE = [
  { emailTemplate: 'warehouse1@sensorx.com', password: '123456', fullName: 'Thủ Kho 1', phone: '0911000001' },
  { emailTemplate: 'warehouse2@sensorx.com', password: '123456', fullName: 'Thủ Kho 2', phone: '0911000002' }
];

export const CUSTOMER_ACCOUNTS = [
  {
    email: 'huyhoang@gmail.com',
    password: '123456',
    name: 'CÔNG TY TNHH THƯƠNG MẠI VÀ SẢN XUẤT NHÔM NỘI THẤT HUY HOÀNG',
    taxCode: '2401076105',
    phone: '0988111222',
    address: 'Bắc Giang'
  },
  {
    email: 'dienca@gmail.com',
    password: '123456',
    name: 'CÔNG TY TNHH THƯƠNG MẠI XÂY DỰNG VÀ XÂY LẮP ĐIỆN ĐIỀN CA',
    taxCode: '0302910196',
    phone: '0988333444',
    address: 'Hồ Chí Minh'
  },
  {
    email: 'dtd@gmail.com',
    password: '123456',
    name: 'CÔNG TY TNHH SẢN XUẤT SẢN PHẨM ĐIỆN THƯƠNG MẠI TỰ ĐỘNG',
    taxCode: '0301439055',
    phone: '0988555666',
    address: 'Hồ Chí Minh'
  }
];

/**
 * Seed tài khoản nhân viên, thủ kho và khách hàng mặc định.
 * Thứ tự: Staff → WarehouseStaff (gắn kho) → Customer
 * @returns {{ success: number, skipped: number, errors: string[] }}
 */
export async function seedAccountsAndCustomers() {
  console.log('=== BẮT ĐẦU TẠO TÀI KHOẢN MẶC ĐỊNH ===');
  const result = { success: 0, skipped: 0, errors: [] };

  // Khởi tạo admin token
  try {
    await apiClient.initAdmin();
  } catch (err) {
    const msg = `Đăng nhập Admin thất bại: ${err.message}`;
    console.error(msg);
    result.errors.push(msg);
    return result;
  }

  // ── Tạo tài khoản Staff ──────────────────────────────────────────────────
  console.log('\n--- Tạo tài khoản Staff ---');
  for (const account of STAFF_ACCOUNTS) {
    console.log(`Đang xử lý: ${account.email}...`);
    try {
      await apiClient.createAccount({
        email: account.email,
        password: account.password,
        role: account.role
      });
      console.log(`-> Tạo thành công: ${account.email}`);
    } catch (err) {
      if (apiClient.isAlreadyExistsError(err)) {
        console.log(`-> ${account.email} đã tồn tại, bỏ qua.`);
        result.skipped++;
      } else {
        const msg = `Lỗi tạo ${account.email}: ${err.response?.data?.message || err.message}`;
        console.error(`-> ${msg}`);
        result.errors.push(msg);
        continue;
      }
    }

    // Cập nhật profile (idempotent)
    try {
      const staffToken = await apiClient.login(account.email, account.password);
      await apiClient.dataWithToken(staffToken).put('/staff/profile', {
        name: account.fullName,
        email: account.email,
        phone: account.phone || '0988000000',
        biography: 'Mặc định'
      });
      console.log(`-> Cập nhật profile: ${account.email}`);
      result.success++;
    } catch (updateErr) {
      const msg = `Lỗi cập nhật profile ${account.email}: ${updateErr.response?.data?.message || updateErr.message}`;
      console.error(`-> ${msg}`);
      result.errors.push(msg);
    }
  }

  // ── Tạo tài khoản Thủ kho (WarehouseStaff) ──────────────────────────────
  // QUAN TRỌNG: Gateway yêu cầu warehouseId khi role = WarehouseStaff (role 1).
  // → Phải lấy danh sách kho từ API trước, rồi mới tạo tài khoản.
  console.log('\n--- Tạo tài khoản Thủ kho (WarehouseStaff) ---');
  try {
    await apiClient.init(); // lấy manager token để gọi /api/data
    const whRes = await apiClient.master.get('/warehouses');
    const warehouses = whRes.data.value || whRes.data.items || whRes.data || [];

    if (warehouses.length === 0) {
      console.log('-> Không tìm thấy kho nào. Bỏ qua tạo tài khoản thủ kho.');
      result.errors.push('Không tìm thấy kho — thủ kho chưa được tạo');
    } else {
      console.log(`-> Tìm thấy ${warehouses.length} kho: ${warehouses.map(w => w.name).join(', ')}`);

      // Mỗi kho tạo 1 tài khoản thủ kho (dùng template, sinh email động nếu vượt quá)
      for (let i = 0; i < warehouses.length; i++) {
        const warehouse = warehouses[i];
        const template = WAREHOUSE_ACCOUNT_TEMPLATE[i % WAREHOUSE_ACCOUNT_TEMPLATE.length];
        const email = i < WAREHOUSE_ACCOUNT_TEMPLATE.length ? template.emailTemplate : `warehouse${i + 1}@sensorx.com`;
        const password = template.password;
        const fullName = i < WAREHOUSE_ACCOUNT_TEMPLATE.length ? template.fullName : `Thủ Kho ${i + 1}`;

        console.log(`\nĐang xử lý thủ kho cho kho "${warehouse.name}": ${email}...`);
        try {
          await apiClient.createAccount({
            email,
            password,
            role: 1,                 // Role.WarehouseStaff
            warehouseId: warehouse.id // ← bắt buộc theo CreateAccountHandler.cs:37
          });
          console.log(`-> Tạo thành công: ${email} → kho "${warehouse.name}"`);
          result.success++;
        } catch (err) {
          if (apiClient.isAlreadyExistsError(err)) {
            console.log(`-> ${email} đã tồn tại.`);
            result.skipped++;
          } else {
            const msg = `Lỗi tạo thủ kho ${email} (kho ${warehouse.name}): ${err.response?.data?.message || err.message}`;
            console.error(`-> ${msg}`);
            result.errors.push(msg);
          }
        }
      }
    }
  } catch (err) {
    const msg = `Lỗi khi lấy danh sách kho: ${err.message}`;
    console.error(msg);
    result.errors.push(msg);
  }

  // ── Tạo tài khoản Khách hàng ─────────────────────────────────────────────
  console.log('\n--- Tạo tài khoản Khách hàng ---');
  for (const customer of CUSTOMER_ACCOUNTS) {
    console.log(`Đang đăng ký: ${customer.name}...`);
    try {
      await apiClient.registerCustomer({
        email: customer.email,
        password: customer.password,
        name: customer.name,
        taxCode: customer.taxCode,
        phone: customer.phone,
        address: customer.address
      });
      console.log(`-> Đăng ký thành công: ${customer.email}`);
      result.success++;
    } catch (err) {
      if (apiClient.isAlreadyExistsError(err)) {
        console.log(`-> ${customer.email} đã tồn tại.`);
        result.skipped++;
      } else {
        const msg = `Lỗi đăng ký ${customer.email}: ${err.response?.data?.message || err.message}`;
        console.error(`-> ${msg}`);
        result.errors.push(msg);
      }
    }
  }

  console.log('=== HOÀN TẤT TẠO TÀI KHOẢN ===\n');
  return result;
}
