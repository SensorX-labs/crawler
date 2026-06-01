import axios from 'axios';
import { GATEWAY_URL } from '../utils/api.js';

export const STAFF_ACCOUNTS = [
  { email: 'manager@sensorx.com', password: '123456', role: 3, fullName: 'Nguyễn Tùng Sk', phone: '0392604701' }, // Role.Manager
  { email: 'nguyentungsk@gmail.com', password: '123456', role: 2, fullName: 'Nguyễn Tùng Sk', phone: '0365436609' }, // Role.SaleStaff
  { email: 'nguyenduyduc@gmail.com', password: '123456', role: 2, fullName: 'Nguyễn Duy Đức', phone: '0353744555' }, // Role.SaleStaff
  { email: 'chuduchai@gmail.com', password: '123456', role: 2, fullName: 'Chu Đức Hải', phone: '0399959521' } // Role.SaleStaff
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

export async function seedAccountsAndCustomers() {
  console.log('=== BẮT ĐẦU TẠO TÀI KHOẢN MẶC ĐỊNH ===');

  let adminToken;
  try {
    const adminLoginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email: 'admin@sensorx.com',
      password: '123456'
    });
    adminToken = adminLoginRes.data.data.accessToken;
    console.log('Đăng nhập thành công với tài khoản Admin gốc.');
  } catch (err) {
    console.error('Đăng nhập Admin thất bại. Không thể tạo tài khoản nhân viên!', err.message);
    return;
  }

  console.log('\n--- Tạo tài khoản Staff ---');
  for (const account of STAFF_ACCOUNTS) {
    try {
      console.log(`Đang kiểm tra/tạo tài khoản: ${account.email}...`);
      await axios.post(`${GATEWAY_URL}/auth/create`, {
        email: account.email,
        password: account.password,
        role: account.role
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`-> Tạo thành công: ${account.email}`);

      // Login to update profile
      const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
        email: account.email,
        password: account.password
      });
      const staffToken = loginRes.data.data.accessToken;

      await axios.put(`${GATEWAY_URL}/api/data/staff/profile`, {
        name: account.fullName,
        email: account.email,
        phone: account.phone || '0988000000',
        biography: 'Mặc định'
      }, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      console.log(`-> Đã cập nhật profile cho: ${account.email}`);
    } catch (err) {
      if (err.response?.data?.message?.includes('exists') || err.response?.data?.Message?.includes('exists') || err.response?.status === 400 || err.response?.status === 409) {
        console.log(`-> Tài khoản ${account.email} đã tồn tại, tiến hành cập nhật profile...`);
        try {
          const loginRes = await axios.post(`${GATEWAY_URL}/auth/login`, {
            email: account.email,
            password: account.password
          });
          const staffToken = loginRes.data.data.accessToken;

          await axios.put(`${GATEWAY_URL}/api/data/staff/profile`, {
            name: account.fullName,
            email: account.email,
            phone: account.phone || '0988000000',
            biography: 'Mặc định'
          }, {
            headers: { Authorization: `Bearer ${staffToken}` }
          });
          console.log(`-> Đã cập nhật profile cho: ${account.email}`);
        } catch (updateErr) {
          console.error(`-> Lỗi cập nhật profile ${account.email}:`, updateErr.response?.data || updateErr.message);
        }
      } else {
        console.error(`-> Lỗi tạo tài khoản ${account.email}:`, err.response?.data || err.message);
      }
    }
  }

  console.log('\n--- Tạo tài khoản Khách hàng (Customer) ---');
  for (const customer of CUSTOMER_ACCOUNTS) {
    try {
      console.log(`Đang đăng ký khách hàng: ${customer.name} (${customer.taxCode})...`);
      await axios.post(`${GATEWAY_URL}/auth/register`, {
        email: customer.email,
        password: customer.password,
        name: customer.name,
        taxCode: customer.taxCode,
        phone: customer.phone,
        address: customer.address
      });
      console.log(`-> Đăng ký thành công khách hàng: ${customer.email}`);
    } catch (err) {
      if (err.response?.data?.message?.includes('exists') || err.response?.data?.Message?.includes('exists') || err.response?.status === 400 || err.response?.status === 409) {
        console.log(`-> Khách hàng ${customer.email} đã tồn tại.`);
      } else {
        console.error(`-> Lỗi đăng ký khách hàng ${customer.email}:`, err.response?.data || err.message);
      }
    }
  }

  console.log('=== HOÀN TẤT TẠO TÀI KHOẢN ===\n');
}
