# SensorX Crawler & Importer

Thư mục này chứa các công cụ cào dữ liệu (crawler) và import sản phẩm, bảng giá nội bộ cho hệ thống **SensorX**.

---

## 1. Cấu trúc các công cụ chính

*   `crawl.js`: Cào danh sách sản phẩm mẫu từ trang Haiphong Tech.
*   `import.js`: Tự động đăng nhập tài khoản Manager và đẩy danh sách sản phẩm đã cào vào cơ sở dữ liệu hệ thống.
*   `crawl_haiau.js`: Thu thập các sản phẩm kèm giá thực tế từ **Cơ Điện Hải Âu** (`https://codienhaiau.com/`) để làm cơ sở dữ liệu giá mẫu.
*   `create-prices.js`: So khớp tên sản phẩm, tính toán giá sàn, sinh các bậc chiết khấu sỉ và tự động thiết lập chính sách giá nội bộ (Internal Price) trên hệ thống.

---

## 2. Hướng dẫn chạy chi tiết

### Bước 1: Khởi động hệ thống SensorX Backend
Đảm bảo các dịch vụ backend .NET (`SensorX.Data` và `SensorX.Master` qua API Gateway cổng `5053`) đang chạy bình thường.

### Bước 2: Cài đặt thư viện
Mở terminal tại thư mục `crawler/` và cài đặt các phụ thuộc cần thiết:
```bash
npm install
```

### Bước 3: Thu thập và Import sản phẩm
1.  **Cào sản phẩm thô từ Haiphong Tech**:
    ```bash
    npm run crawl
    ```
    *Kết quả*: Tạo ra file `products_YYYYMMDD_HHMMSS_COUNT.json` trong thư mục.

2.  **Đẩy sản phẩm vào hệ thống**:
    ```bash
    npm run import
    ```
    *Cơ chế*: Tự động đăng nhập tài khoản `manager@gmail.com` / `123456` (hoặc khởi tạo nếu chưa có), đồng thời tạo các Danh mục (Categories) và Nhà cung cấp (Suppliers) nếu chưa tồn tại trước khi tạo sản phẩm.

### Bước 4: Thiết lập bảng giá nội bộ thực tế
1.  **Cào dữ liệu giá thực tế từ Cơ Điện Hải Âu**:
    ```bash
    npm run crawl-haiau
    ```
    *Kết quả*: Tạo file `haiau_prices.json` chứa thông tin giá bán lẻ thực tế của ~350 sản phẩm thuộc các danh mục thiết bị tự động hóa phổ biến.

2.  **Tính toán và gán giá nội bộ cho tất cả sản phẩm**:
    ```bash
    npm run create-prices
    ```
    *Cơ chế*:
    *   Sử dụng thuật toán so khớp từ khóa (Word Overlap) giữa tên sản phẩm của hệ thống với dữ liệu giá mẫu Hải Âu.
    *   Tính toán giá đề xuất (`SuggestedPrice`), giá sàn (`FloorPrice` = 75% giá đề xuất).
    *   Tự động sinh 3 bậc giá sỉ (chiết khấu lần lượt 5%, 10%, 15% khi số lượng mua lớn hơn hoặc bằng 5, 10, 20).
    *   Hủy các bảng giá active cũ (`/deactivate`) và tạo bảng giá mới theo lô 50 sản phẩm song song để tối ưu hóa hiệu năng mạng.

---

## 3. Thuật toán và Công thức giá nội bộ

*   **Giá đề xuất (MSRP)**: Được ánh xạ từ sản phẩm có độ tương đồng tên cao nhất (khớp từ 2 từ trở lên). Nếu không có sản phẩm nào khớp, hệ thống sẽ sử dụng giá trị trung bình của danh mục tương ứng trong dữ liệu giá Hải Âu:
    *   *Cảm biến*: ~350,000 VND
    *   *Bộ nguồn*: ~650,000 VND
    *   *Thiết bị tự động hóa (PLC/HMI)*: ~1,200,000 VND
    *   *Rơ le trung gian*: ~120,000 VND
    *   *Công tắc & Nút nhấn*: ~80,000 VND
    *   *Đầu nối & Chân pin*: ~15,000 VND
    *   *Cầu tiếp địa & Cầu đấu*: ~45,000 VND
*   **Bậc chiết khấu số lượng (Price Tiers)**:
    *   Số lượng $\ge 5$: Giảm 5% giá đề xuất.
    *   Số lượng $\ge 10$: Giảm 10% giá đề xuất.
    *   Số lượng $\ge 20$: Giảm 15% giá đề xuất.
