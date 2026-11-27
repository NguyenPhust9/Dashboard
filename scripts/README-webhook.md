# Cấu hình webhook AMIS CRM

Bộ chạy Linux độc lập đã có cấu hình tại [deploy/crm-worker](../deploy/crm-worker/README.md), gồm Chromium lưu phiên trên volume, worker, healthcheck và đăng nhập qua SSH. Chưa có máy chủ được cấp hoặc phiên AMIS trên server được đăng nhập, nên Production hiện vẫn dùng tác vụ Windows mô tả dưới đây. Chỉ chuyển hẳn sau khi nghiệm thu trên máy chủ.

Địa chỉ nhận: `https://baocao-chi.vercel.app/api/amis-webhook`.

Trong CRM, thay địa chỉ webhook cũ bằng địa chỉ trên, giữ phương thức `POST`, thêm Header `Authorization` với giá trị `Bearer <AMIS_WEBHOOK_SECRET>`. Cấu hình để sao chép nằm trong `data/amis-webhook-config.local.txt`, được loại khỏi Git. Khóa phía server nằm trong `.env` và biến môi trường Production của Vercel.

Endpoint chỉ tiếp nhận JSON đã xác thực, lưu dấu nhận và yêu cầu làm mới tháng hiện tại theo giờ Việt Nam. Số tiền tiếp tục lấy từ API widget CRM, không lấy từ nội dung webhook. Chưa xác minh trường ngày nghiệp vụ của sự kiện, nên webhook không tự suy đoán tháng quá khứ. Các lần gửi gần nhau được gom vào một yêu cầu của tháng; sự kiện mới đến khi đang xử lý vẫn được giữ để đọc lại sau.

Dấu nhận lưu thêm cấu trúc giới hạn của webhook: tên trường cho phép và kiểu dữ liệu, số phần tử, phân hệ `account`/`sale_order`, hành động thêm/sửa. Không lưu nguyên nội dung, mã bản ghi, tên khách hàng, số tiền hoặc ngày nghiệp vụ. Cấu trúc này nằm trong bảng private cùng thời hạn dọn dấu nhận 7 ngày. Lỗi xác thực chỉ ghi một trong ba lý do `missing`, `format`, `mismatch`, không ghi header hay khóa.

Kiểm tra ngày 27/11/2026 xác nhận URL, POST và Bearer trong CRM khớp cấu hình server. API công khai `Account`, `SaleOrders`, `Customers` gọi được bằng client credentials. Token này không đọc được API widget xếp hạng trong phép thử cùng đầy đủ header; token phiên CRM hiện tại đọc được nhưng có thời hạn và chưa có cơ chế gia hạn trên server. Vì vậy luồng dưới đây vẫn phụ thuộc máy đồng bộ, chưa đáp ứng vận hành độc lập khi máy tắt. Không thay số widget bằng trường `Customers.order_sales`, vì kiểm tra thực tế cho thấy số này khác doanh số theo tháng.

## Luồng cập nhật

`CRM → /api/amis-webhook → hàng đợi Supabase → worker trên máy → API widget CRM → snapshot Dashboard → Realtime trên trình duyệt`.

Worker chỉ cập nhật **Nhân viên xuất sắc** và **Top đại lý doanh số**. Mỗi lượt lấy lần lượt hai snapshot bằng các script đồng bộ hiện có; không chạy song song trên cùng phiên Chrome. Chỉ xác nhận hoàn tất khi cả hai đã lưu thành công. Khi API lỗi, phiên AMIS hết hạn hoặc máy mất mạng, hàng đợi giữ yêu cầu để thử lại; bản số liệu gần nhất vẫn còn trên web. Mỗi lượt giữ quyền xử lý trong 10 phút; worker dừng giữa chừng thì yêu cầu có thể được nhận lại khi hết thời hạn. Một xác nhận đã hết hạn (HTTP 409) không ghi đè trạng thái của lượt mới.

Máy phải bật, worker phải chạy và phiên AMIS phải còn đăng nhập để lấy số mới. Webhook là thông báo có thay đổi, không thay thế quyền truy cập API CRM. Tốc độ cập nhật gồm tối đa khoảng 5 giây chờ worker cộng thời gian đọc hai widget và thông báo Realtime; không bảo đảm tức thì. Các tác vụ đồng bộ định kỳ 5 phút vẫn giữ làm dự phòng, và trình duyệt vẫn kiểm tra snapshot mỗi phút nếu Realtime bị ngắt.

## Cấu hình worker

Node.js 22.18+ và phiên Chrome AMIS đã cấu hình cho hai script xếp hạng là bắt buộc. Worker dùng `@next/env` đọc cấu hình tại gốc dự án:

- `DASHBOARD_WEBHOOK_JOBS_URL`: URL đầy đủ, mặc định suy ra `/api/amis-webhook/jobs` từ `DASHBOARD_REPORT26_SYNC_URL` trong cấu hình nguồn.
- `AMIS_REPORT_SYNC_SECRET`: khóa nội bộ dùng để nhận và xác nhận công việc. Nếu chưa đặt ở đây thì lấy `DASHBOARD_REPORT_SYNC_SECRET` trong cấu hình nguồn hiện có.
- Cấu hình nguồn đọc từ `BIKEFORCE_AMIS_ENV_FILE`, hoặc file `.env` cạnh `AMIS_ACCOUNTING_OVERVIEW_FILE`, giống các script đồng bộ hiện tại.

Worker dùng khóa đồng bộ nội bộ; **không dùng `AMIS_WEBHOOK_SECRET` dành cho CRM**. Không ghi khóa, header xác thực hay nội dung webhook vào log. Các script con giữ nguyên `DASHBOARD_STAFF_SYNC_URL` và `DASHBOARD_CUSTOMERS_SYNC_URL` cùng cơ chế mặc định đang dùng. Nếu kiểm thử trên localhost, cần trỏ cả ba URL đến cùng máy chủ thử nghiệm để không gửi snapshot sang Production ngoài ý muốn.

```powershell
npm.cmd run crm:webhook:worker
# Nhận và xử lý tối đa một công việc, rồi thoát; không có công việc cũng thoát thành công.
npm.cmd run crm:webhook:worker -- --once
# Dừng nhận việc mới sau 60 giây; công việc đang chạy được hoàn tất trước khi thoát.
npm.cmd run crm:webhook:worker -- --run-for 60
```

Worker kiểm tra hàng đợi mỗi 5 giây; khi kết nối lỗi thì lùi dần đến tối đa 60 giây. Mỗi script con có thời hạn 180 giây và giới hạn bộ đệm 256 KiB. Log nằm ở `data/amis-webhook-worker.log` (không đưa vào Git), xoay sang `.previous` khi vượt 1 MiB. Chỉ ghi thời gian, tháng, lần thử và trạng thái; không chuyển tiếp stdout/stderr thô của API CRM.

Tác vụ Windows có thể dùng action `wscript.exe //B //Nologo "<project>\scripts\amis-webhook-worker.vbs" "<node.exe>"`. Wrapper ẩn cửa sổ, chờ hết vòng đời worker và trả mã thoát cho Task Scheduler. Đặt tác vụ chạy khi đăng nhập và lặp lại mỗi 5 phút, `MultipleInstances = IgnoreNew`, không giới hạn thời gian chạy (`ExecutionTimeLimit = PT0S`). Nhịp 5 phút này chỉ khởi động lại nếu worker đã dừng; worker đang chạy vẫn kiểm tra hàng đợi mỗi 5 giây. Không thay hoặc xóa hai tác vụ đồng bộ định kỳ cũ.

Kiểm tra logic xác nhận và thử lại bằng `node --test tests/amis-webhook-worker.test.mjs`. Chỉ thực hiện kiểm thử tích hợp và kích hoạt worker sau khi người dùng xác nhận đã lưu cấu hình CRM.
