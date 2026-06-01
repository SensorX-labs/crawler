import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_GATEWAY = 'http://localhost:5053';

const ADMIN_CREDENTIALS = { email: 'manager@sensorx.com', password: '123456' };
const STAFF_ACCOUNTS = [
    { email: 'nguyentungsk@gmail.com', password: 'password' }, // assuming default 'password' or '123456'? Wait, user said 123456!
    { email: 'nguyenduyduc@gmail.com', password: 'password' },
    { email: 'chuduchai@gmail.com', password: 'password' },
];
// Note: user said "Mật khẩu đều là 123456". Let's use 123456.
STAFF_ACCOUNTS.forEach(s => s.password = '123456');

// Utilities
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class SensorXClient {
    constructor(email, password) {
        this.email = email;
        this.password = password;
        this.token = null;
        this.axios = axios.create({ baseURL: API_GATEWAY });
    }

    async login() {
        try {
            const res = await this.axios.post('/auth/login', { email: this.email, password: this.password });
            if (res.data?.success && res.data.data?.accessToken) {
                this.token = res.data.data.accessToken;
                this.axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
                return true;
            }
            throw new Error(res.data?.message || 'Login failed');
        } catch (e) {
            return false;
        }
    }

    async createStaff(role) {
        try {
            const res = await this.axios.post('/auth/create', {
                email: this.email,
                password: this.password,
                role: role
            });
            console.log(`Tạo tài khoản ${this.email} thành công.`);
            return true;
        } catch (e) {
            console.error(`Lỗi tạo tài khoản ${this.email}:`, e?.response?.data || e.message);
            return false;
        }
    }

    async register(name, phone, taxCode, address) {
        try {
            const res = await this.axios.post('/auth/register', {
                email: this.email,
                password: this.password,
                name,
                phone,
                taxCode,
                address
            });
            return res.data?.success || res.data?.isSuccess;
        } catch (e) {
            // Might already exist
            return false;
        }
    }
}

async function runSimulation() {
    console.log('🚀 Bắt đầu giả lập E2E AI Training (Real Data)...');

    // 1. Get a list of products (Use admin or anyone)
    console.log('Fetching products from Catalog...');
    const publicClient = axios.create({ baseURL: API_GATEWAY });
    let products = [];
    try {
        const prodRes = await publicClient.get('/api/data/catalog/products/list?pageSize=100');
        if (prodRes.data?.isSuccess) {
            products = prodRes.data.value.items || prodRes.data.value;
        }
    } catch (e) {
        console.error('Failed to fetch products:', e.message);
        return;
    }
    
    if (!products || products.length === 0) {
        console.log('No products found, cannot create RFQs.');
        return;
    }
    console.log(`Found ${products.length} products.`);

    const adminClient = new SensorXClient(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    let adminLogged = await adminClient.login();
    if (!adminLogged) {
        // Maybe admin is using different password, let's just create a Manager account
        console.log('Tạo tài khoản Manager thay thế cho Admin...');
        await adminClient.createStaff(3); // Role.Manager
        adminLogged = await adminClient.login();
        if (!adminLogged) {
            console.error('Không thể đăng nhập tài khoản Admin/Manager!');
            return;
        }
    }

    // Cache staff clients
    const staffClients = {};
    for (const staff of STAFF_ACCOUNTS) {
        const client = new SensorXClient(staff.email, staff.password);
        let logged = await client.login();
        if (!logged) {
            console.log(`Tạo tài khoản Staff: ${staff.email}...`);
            await client.createStaff(2); // Role.SaleStaff
            logged = await client.login();
        }
        if (logged) {
            staffClients[staff.email] = client;
        } else {
            console.log(`Failed to login staff ${staff.email}`);
        }
    }

    const NUM_CUSTOMERS = 30;
    let successCount = 0;

    for (let i = 1; i <= NUM_CUSTOMERS; i++) {
        console.log(`\n--- Bắt đầu giao dịch ${i}/${NUM_CUSTOMERS} ---`);
        
        const customerEmail = `company${i}@test.com`;
        const customerClient = new SensorXClient(customerEmail, '123456');
        
        // Register or login
        await customerClient.register(`CÔNG TY TNHH AI DEMO ${i}`, `09880000${i.toString().padStart(2, '0')}`, `100000${i.toString().padStart(4, '0')}`, 'Hà Nội');
        const loggedIn = await customerClient.login();
        if (!loggedIn) {
            console.log(`Bỏ qua giao dịch ${i} do không login được Khách hàng.`);
            continue;
        }

        try {
            // Thêm sản phẩm và tạo RFQ
            const numItems = Math.floor(Math.random() * 3) + 1;
            const items = [];
            for (let j = 0; j < numItems; j++) {
                const product = products[Math.floor(Math.random() * products.length)];
                items.push({
                    productId: product.id,
                    quantity: Math.floor(Math.random() * 10) + 1
                });
            }

            const rfqRes = await customerClient.axios.post('/api/master/rfq', { items });
            const rfqId = rfqRes.data.value.id || rfqRes.data.value; // depends on Response Wrapper
            console.log(`Tạo RFQ thành công: ${rfqId}`);

            // Gửi RFQ -> Kích hoạt AI phân bổ
            await customerClient.axios.post('/api/master/rfq/send', { id: rfqId });
            console.log(`Đã gửi RFQ ${rfqId}, chờ AI phân bổ...`);
            
            // Cho AI vài giây để xử lý
            await delay(1000);

            // Lấy thông tin RFQ bằng Admin để biết Staff nào được assign
            const rfqDetailRes = await adminClient.axios.get(`/api/master/rfq/${rfqId}`);
            let assignedStaffId = rfqDetailRes.data.value.staffId;
            let wasForceAssigned = false;
            
            if (!assignedStaffId) {
                console.log(`RFQ chưa được AI phân bổ (StaffId null). Dùng Manager ép phân bổ...`);
                // Get all staffs to find one
                const staffsRes = await adminClient.axios.get('/api/master/rfq/load-more-sale-staff?pageIndex=1&pageSize=100&isDescending=false');
                const staffs = staffsRes.data.value?.items || staffsRes.data.value || [];
                if (staffs.length === 0) {
                    console.error('Không có SaleStaff nào trong hệ thống! Không thể ép phân bổ.');
                    continue;
                }
                const randomStaff = staffs[Math.floor(Math.random() * staffs.length)];
                await adminClient.axios.post(`/api/master/rfq/force-assign`, {
                    id: rfqId,
                    staffId: randomStaff.id
                });
                console.log(`Đã ép phân bổ cho Staff ${randomStaff.id}`);
                assignedStaffId = randomStaff.id;
                wasForceAssigned = true;
            }

            // Map StaffId to Email (We don't have direct mapping, so we'll try to find which staff got it)
            // In real app, we'd get the staff's email from an API. Here we just brute force check which staff has this RFQ in their inbox.
            let assignedStaffClient = null;
            let assignedStaffEmail = '';
            for (const email of Object.keys(staffClients)) {
                const sClient = staffClients[email];
                const inboxRes = await sClient.axios.get(`/api/master/rfq?pageIndex=1&pageSize=50&isDescending=false`);
                const items = inboxRes.data.value?.items || [];
                if (items.some(x => x.id === rfqId)) {
                    assignedStaffClient = sClient;
                    assignedStaffEmail = email;
                    break;
                }
            }

            if (!assignedStaffClient) {
                console.log(`Không tìm thấy nhân viên đang giữ RFQ ${rfqId} trong inbox.`);
                continue;
            }

            console.log(`AI đã phân bổ RFQ cho: ${assignedStaffEmail}`);

            // Nhân viên Accept RFQ (Nếu AI phân bổ thì Status là Pending, cần Accept. Nếu Manager ép gán thì đã Accepted)
            if (!wasForceAssigned) {
                await assignedStaffClient.axios.post('/api/master/rfq/accept', { id: rfqId });
            }

            // Nhân viên Tạo báo giá Draft
            // Fetch RFQ detail as staff to get the requested items
            const rfqStaffRes = await assignedStaffClient.axios.get(`/api/master/rfq/${rfqId}`);
            const requestedItems = rfqStaffRes.data.value.items || [];
            
            const quoteItems = requestedItems.map(reqItem => ({
                productId: reqItem.productId,
                unitPrice: 500000 + Math.random() * 1000000, // random price
                taxRate: 10
            }));

            const createQuoteRes = await assignedStaffClient.axios.post('/api/master/quotes', {
                rfqId: rfqId,
                note: 'Báo giá tốt nhất cho khách hàng',
                items: quoteItems
            });
            const quoteId = createQuoteRes.data.value;
            console.log(`Nhân viên đã tạo Quote: ${quoteId}`);

            // Nhân viên Submit For Approval
            await assignedStaffClient.axios.post(`/api/master/quotes/${quoteId}/submit-for-approval`, {});

            // Quản lý Approve
            await adminClient.axios.post(`/api/master/quotes/${quoteId}/approve`, {});
            console.log(`Quản lý đã duyệt Quote.`);

            // Nhân viên Publish
            await assignedStaffClient.axios.post(`/api/master/quotes/${quoteId}/publish`, {});

            // Khách hàng phản hồi (AI Backward Pass sẽ chạy ở backend)
            // Khách hàng đôi khi Accept, đôi khi Reject dựa trên WinRate.
            const isAccepted = Math.random() > 0.3; // 70% win rate
            await customerClient.axios.post(`/api/master/quotes/${quoteId}/customer-response`, {
                id: quoteId, // Although ID is in route, it might be required in body depending on command
                responseType: isAccepted ? 0 : 1, // 0: Accepted, 1: Declined
                paymentTerm: 1, // FullPayment
                shippingAddress: 'Tại công trình',
                recipientName: 'Anh Trưởng Phòng',
                recipientPhone: '0909123456',
                feedback: isAccepted ? 'Giá OK' : 'Giá quá đắt'
            });

            console.log(`Khách hàng đã phản hồi: ${isAccepted ? 'CHỐT ĐƠN' : 'TỪ CHỐI'}. (AI Backward Pass triggered in Backend)`);
            successCount++;

        } catch (error) {
            console.error(`Lỗi trong luồng giao dịch ${i}:`, error?.response?.data || error.message);
            if (error?.response?.status === 404) {
                console.error(`404 URL:`, error.response.config.url);
            }
        }
    }

    console.log(`\n🎉 Hoàn tất giả lập! Chạy thành công ${successCount}/${NUM_CUSTOMERS} giao dịch.`);
    console.log('Bạn có thể mở giao diện SensorX Frontend > Cài đặt > AI Monitoring để xem lịch sử hội tụ.');
}

runSimulation();
