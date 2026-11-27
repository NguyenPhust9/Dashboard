# Đồng bộ ô Còn phải thu

Nguồn duy nhất: **Tổng → Nợ phải thu theo hạn nợ** tại AMIS Kế toán, trang `https://actapp.misa.vn/app/Overview/dashboard`.

Máy có phiên AMIS chạy `npm run accounting:overview:sync` để đọc trực tiếp ô này và gửi snapshot đến `/api/amis-accounting-overview-sync`. Vercel đọc snapshot trong Supabase; không khởi động Chrome trên Vercel. Trang Tổng quan tải lại riêng ô Còn phải thu mỗi phút.

Yêu cầu Node.js 22.18+ và các dependencies của dự án. Cấu hình trong `.env` trên máy đồng bộ, không commit:

- `AMIS_ACCOUNTING_BROWSER_PROFILE`: thư mục phiên AMIS hiện có.
- `AMIS_ACCOUNTING_BROWSER_ENDPOINT`: mặc định `http://127.0.0.1:9223`.
- `DASHBOARD_ACCOUNTING_SYNC_URL`: URL đầy đủ của endpoint đồng bộ trên website.
- `AMIS_REPORT_SYNC_SECRET`: khóa của endpoint trên Vercel.

Có thể dùng cấu hình đồng bộ BikeForce hiện có từ `BIKEFORCE_AMIS_ENV_FILE`, hoặc file `.env` cạnh `AMIS_ACCOUNTING_OVERVIEW_FILE`. Worker chỉ dùng URL Dashboard và khóa đồng bộ từ cấu hình này.

Để tự đồng bộ, lập lịch chạy `node scripts/accounting-overview-sync.mjs` mỗi phút, với working directory là thư mục Dashboard và chế độ không chạy chồng các lượt. Tác vụ chỉ hoạt động khi máy bật, có mạng và phiên AMIS còn hiệu lực. Nếu lỗi đăng nhập hoặc đọc số, worker không ghi đè snapshot trước; ô Còn phải thu hiện ngày bản lưu và trạng thái dữ liệu cũ.
