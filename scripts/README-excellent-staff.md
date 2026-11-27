# Nhân viên xuất sắc

Ô này lấy nguyên danh sách và thứ hạng từ widget **Nhân viên xuất sắc** trên AMIS CRM, không tính lại từ đơn hàng. Nguồn được xác minh: `DashboardID=10`, `DashboardType=4`, `DashboardKey=ExcellentStaff`; request POST `/crm/g{shard}/api/dashboard/Dashboard/4/data`.

`npm run crm:excellent-staff:sync` dùng phiên AMIS sẵn có để gọi API, yêu cầu số liệu mới và gửi snapshot lên Dashboard. Mặc định lấy tháng hiện tại theo giờ Việt Nam; có thể truyền `-- --month YYYY-MM`. Phạm vi tổ chức và cách tính doanh số giữ theo request thực tế của widget. Không lưu token/cookie vào snapshot hoặc mã nguồn.

Áp dụng migration `supabase/migrations/20261127000100_amis_excellent_staff_snapshots.sql` trước khi đồng bộ. Website đọc snapshot qua `/api/crm-excellent-staff?month=YYYY-MM`; endpoint nhận đồng bộ là `/api/amis-excellent-staff-sync`, bảo vệ bằng `AMIS_REPORT_SYNC_SECRET`. Trình duyệt người xem không nhận thông tin đăng nhập AMIS.

Thiết lập trong `.env` trên máy đồng bộ:

- `AMIS_CRM_BROWSER_PROFILE`, `AMIS_CRM_BROWSER_ENDPOINT`: phiên Chrome AMIS đã đăng nhập; có thể dùng chung cấu hình `AMIS_ACCOUNTING_BROWSER_*` hiện có.
- `DASHBOARD_STAFF_SYNC_URL`: URL đầy đủ của endpoint nhận đồng bộ.
- `AMIS_REPORT_SYNC_SECRET`: cùng khóa trên Vercel.

Có thể dùng URL và khóa Dashboard từ `BIKEFORCE_AMIS_ENV_FILE` hoặc file `.env` cạnh `AMIS_ACCOUNTING_OVERVIEW_FILE`, giống tác vụ phải thu hiện có. Node.js 22.18+ và Chrome là bắt buộc.

Tác vụ Windows `Dashboard-ExcellentStaff-Sync` chạy mỗi 5 phút, trong thư mục dự án, ẩn cửa sổ và không chạy chồng. Action dùng `wscript.exe //B //Nologo "<project>\scripts\crm-excellent-staff-sync.vbs" "<node.exe>"`; wrapper chờ Node hoàn tất và trả mã thoát cho Task Scheduler, tránh phụ thuộc cửa sổ PowerShell. Script khóa phiên dùng chung; chỉ đóng tab do chính nó tạo. Máy cần bật và phiên AMIS cần còn hiệu lực. Khi lỗi, dữ liệu cũ được giữ lại và website báo thời gian của bản lưu; không thay bằng dữ liệu mẫu hay số 0. Website kiểm tra snapshot mỗi phút. Những tháng chưa đồng bộ hiện thông báo chưa có dữ liệu.
