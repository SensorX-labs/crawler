import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STAFF_ACCOUNTS, CUSTOMER_ACCOUNTS } from '../importers/accountApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_GATEWAY = 'http://localhost:5053';

const ADMIN_CREDENTIALS = { email: 'manager@sensorx.com', password: '123456' };

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

    async createAndSendRFQ(categories, productsByCategory) {
        const numItems = Math.floor(Math.random() * 3) + 1;
        const items = [];
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
        const categoryProducts = productsByCategory[selectedCategory];

        for (let j = 0; j < numItems; j++) {
            const product = categoryProducts[Math.floor(Math.random() * categoryProducts.length)];
            if (!items.find(x => x.productId === product.id)) {
                items.push({
                    productId: product.id,
                    quantity: Math.floor(Math.random() * 10) + 1
                });
            }
        }

        const rfqRes = await this.axios.post('/api/master/rfq', { items });
        const rfqId = rfqRes.data.value.id || rfqRes.data.value; // depends on Response Wrapper
        console.log(`Tạo RFQ thành công: ${rfqId}`);

        await this.axios.post('/api/master/rfq/send', { id: rfqId });
        console.log(`Đã gửi RFQ ${rfqId}, chờ AI phân bổ...`);
        return rfqId;
    }

    async acceptRFQ(rfqId) {
        await this.axios.post('/api/master/rfq/accept', { id: rfqId });
    }

    async createAndSubmitQuote(rfqId) {
        const rfqStaffRes = await this.axios.get(`/api/master/rfq/${rfqId}`);
        const requestedItems = rfqStaffRes.data.value.items || [];

        const quoteItems = requestedItems.map(reqItem => ({
            productId: reqItem.productId,
            unitPrice: 500000 + Math.random() * 1000000, // random price
            taxRate: 10
        }));

        const createQuoteRes = await this.axios.post('/api/master/quotes', {
            rfqId: rfqId,
            note: 'Báo giá tốt nhất cho khách hàng',
            items: quoteItems
        });
        const quoteId = createQuoteRes.data.value;
        console.log(`Nhân viên đã tạo Quote: ${quoteId}`);

        await this.axios.post(`/api/master/quotes/${quoteId}/submit-for-approval`, {});
        return quoteId;
    }

    async approveQuote(quoteId) {
        await this.axios.post(`/api/master/quotes/${quoteId}/approve`, {});
        console.log(`Quản lý đã duyệt Quote.`);
    }

    async publishQuote(quoteId) {
        await this.axios.post(`/api/master/quotes/${quoteId}/publish`, {});
    }

    async respondQuote(quoteId, isAccepted) {
        await this.axios.post(`/api/master/quotes/${quoteId}/customer-response`, {
            id: quoteId,
            responseType: isAccepted ? 0 : 1, // 0: Accepted, 1: Declined
            paymentTerm: 1, // FullPayment
            shippingAddress: 'Tại công trình',
            recipientName: 'Anh Trưởng Phòng',
            recipientPhone: '0909123456',
            feedback: isAccepted ? 'Giá OK' : 'Giá quá đắt'
        });
    }
}

export async function getMasterDataProducts() {
    console.log('Fetching products from Catalog...');
    const publicClient = axios.create({ baseURL: API_GATEWAY });
    let products = [];
    try {
        const prodRes = await publicClient.get('/api/data/catalog/products/list?pageSize=2000');
        if (prodRes.data?.isSuccess) {
            products = prodRes.data.value.items || prodRes.data.value;
        }
    } catch (e) {
        console.error('Failed to fetch products:', e.message);
        return null;
    }

    if (!products || products.length === 0) {
        console.log('No products found, cannot create RFQs.');
        return null;
    }

    const productsByCategory = {};
    for (const p of products) {
        const cat = p.categoryName || 'Unknown';
        if (!productsByCategory[cat]) {
            productsByCategory[cat] = [];
        }
        productsByCategory[cat].push(p);
    }
    const categories = Object.keys(productsByCategory);

    console.log(`Found ${products.length} products across ${categories.length} categories.`);

    return { categories, productsByCategory };
}

export async function runSimulation() {
    console.log('🚀 Bắt đầu giả lập E2E AI Training (Real Data)...');

    // 1. Get a list of products (Use admin or anyone)
    const masterData = await getMasterDataProducts();
    if (!masterData) return;
    const { categories, productsByCategory } = masterData;

    // Cache staff clients
    const staffClients = {};
    for (const staff of STAFF_ACCOUNTS) {
        const client = new SensorXClient(staff.email, staff.password);
        let logged = await client.login();
        if (logged) {
            // Get staff profile to get their ID
            try {
                const profileRes = await client.axios.get('/api/data/staff/profile');
                client.staffId = profileRes.data.value.id;
                staffClients[staff.email] = client;
            } catch (err) {
                console.error(`Failed to get profile for ${staff.email}`);
            }
        } else {
            console.log(`Failed to login staff ${staff.email}`);
        }
    }

    const NUM_CUSTOMERS = 40;
    let successCount = 0;

    const managerClient = staffClients['manager@sensorx.com'];
    if (!managerClient) {
        console.error('Không tìm thấy managerClient để cấp quyền ép phân bổ RFQ!');
        return;
    }

    for (let i = 1; i <= NUM_CUSTOMERS; i++) {
        console.log(`\n--- Bắt đầu giao dịch ${i}/${NUM_CUSTOMERS} ---`);

        const selectedCustomer = CUSTOMER_ACCOUNTS[Math.floor(Math.random() * CUSTOMER_ACCOUNTS.length)];
        const customerClient = new SensorXClient(selectedCustomer.email, selectedCustomer.password);

        const loggedIn = await customerClient.login();
        if (!loggedIn) {
            console.log(`Bỏ qua giao dịch ${i} do không login được Khách hàng ${selectedCustomer.email}.`);
            continue;
        }

        try {
            // Khách hàng tạo và gửi RFQ
            const rfqId = await customerClient.createAndSendRFQ(categories, productsByCategory);

            // Chờ AI phân bổ
            let assignedStaffId = null;
            let pollingAttempts = 0;
            const maxPollingAttempts = 10;

            while (!assignedStaffId && pollingAttempts < maxPollingAttempts) {
                const rfqDetailRes = await managerClient.axios.get(`/api/master/rfq/${rfqId}`);
                assignedStaffId = rfqDetailRes.data.value.staffId;

                if (!assignedStaffId) {
                    pollingAttempts++;
                    await delay(1000);
                }
            }

            if (!assignedStaffId) {
                console.log(`RFQ chưa được AI phân bổ sau ${maxPollingAttempts} giây. Bỏ qua giao dịch này...`);
                continue;
            }

            // Lấy staff client tương ứng
            let assignedStaffClient = Object.values(staffClients).find(c => c.staffId === assignedStaffId);

            if (!assignedStaffClient) {
                console.log(`Không tìm thấy nhân viên đang giữ RFQ ${rfqId} trong inbox.`);
                continue;
            }

            console.log(`AI đã phân bổ RFQ cho: ${assignedStaffClient.email}`);

            // Nhân viên Accept RFQ
            await assignedStaffClient.acceptRFQ(rfqId);

            // Nhân viên tạo và submit Quote
            const quoteId = await assignedStaffClient.createAndSubmitQuote(rfqId);

            // Quản lý duyệt Quote
            await managerClient.approveQuote(quoteId);

            // Nhân viên publish Quote
            await assignedStaffClient.publishQuote(quoteId);

            // Khách hàng phản hồi
            const isAccepted = Math.random() > 0.3; // 70% win rate
            await customerClient.respondQuote(quoteId, isAccepted);

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

if (process.argv[1] && process.argv[1].includes('simulate_closing_behavior.js')) {
    runSimulation().catch(console.error);
}
