# Top đại lý doanh số

Ô này dùng nguyên danh sách của widget **KH có doanh số cao nhất** trên AMIS CRM: thứ hạng, tên khách hàng, mã khách hàng và doanh số chính xác. Không lọc lại loại khách hàng, không tính từ đơn hàng, không thêm tỉnh hay tỷ lệ tăng giảm. Các ô khác giữ nguồn dữ liệu hiện tại.

API đã xác minh: POST `/crm/g{shard}/api/dashboard/Dashboard/55/data`, `DashboardID=63`, `DashboardKey=AccountWithTheHighestSale`. Danh sách nằm trong `Data`, các trường `AccountID`, `AccountName`, `AccountNumber`, `Revenue`. Giữ thứ tự trả về và số dòng theo `DisplayItemNumber` của widget (hiện tại 10). Giữ phạm vi tổ chức và tùy chọn doanh số của request CRM thực tế; chỉ đổi khoảng ngày theo tháng Việt Nam và yêu cầu dữ liệu mới.

Áp dụng migration `supabase/migrations/20261127000200_amis_top_customers_snapshots.sql` trước khi chạy `npm run crm:top-customers:sync`. Có thể truyền `-- --month YYYY-MM`; mặc định là tháng hiện tại ở Việt Nam. Script dùng phiên đăng nhập AMIS sẵn có và đẩy snapshot tới `/api/amis-top-customers-sync`, bảo vệ bằng `AMIS_REPORT_SYNC_SECRET`. Website đọc `/api/crm-top-customers?month=YYYY-MM` mỗi phút, không nhận cookie/token CRM.

Cấu hình máy đồng bộ:

- `AMIS_CRM_BROWSER_PROFILE`, `AMIS_CRM_BROWSER_ENDPOINT`, hoặc cấu hình `AMIS_ACCOUNTING_BROWSER_*` hiện tại.
- `DASHBOARD_CUSTOMERS_SYNC_URL`: endpoint đồng bộ của chính Dashboard.
- `AMIS_REPORT_SYNC_SECRET`: cùng khóa trên Vercel.

URL và khóa có thể dùng từ `BIKEFORCE_AMIS_ENV_FILE` hoặc `.env` cạnh `AMIS_ACCOUNTING_OVERVIEW_FILE`, giống tác vụ nhân viên hiện tại. Cần Node.js 22.18+ và Chrome.

Tác vụ Windows `Dashboard-TopCustomers-Sync` chạy mỗi 5 phút, ẩn cửa sổ và không chạy chồng. Action: `wscript.exe //B //Nologo "<project>\scripts\crm-top-customers-sync.vbs" "<node.exe>"`. Máy cần bật, phiên AMIS cần còn hiệu lực. Các tác vụ dùng chung khóa phiên và chỉ đóng tab mình tạo.

Lỗi đồng bộ không thay bản lưu bằng số 0 hoặc dữ liệu mẫu. Website giữ bản lưu cùng tháng và báo thời điểm đọc; bản tháng hiện tại quá 15 phút có cảnh báo chưa cập nhật. Tháng chưa đồng bộ hiển thị chưa có dữ liệu.
