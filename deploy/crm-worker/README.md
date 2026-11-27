# Bộ đồng bộ CRM trên máy chủ

Container này đọc đúng hai widget **Nhân viên xuất sắc** và **KH có doanh số cao nhất**, dùng hàng đợi webhook và API lưu snapshot hiện có. Website tiếp tục ở Vercel. Không thay giao diện hoặc ba biểu đồ phía trên.

**Chưa có máy chủ được cấp cho dự án.** Bộ triển khai cần một máy Linux chạy liên tục, Docker Engine/Compose và quyền SSH. Dự trù 2 vCPU, 4 GB RAM, 20 GB đĩa để chạy Chromium và build image; cần đo lại tài nguyên theo tải thực tế. Đây là cấu hình triển khai, chưa phải xác nhận đã chạy Production độc lập với máy cá nhân.

Kiểm tra ngày 27/11/2026: các kiểm thử worker/session/parser và TypeScript đạt. Docker đã hoàn tất các bước cài phụ thuộc/copy mã nhưng lỗi I/O khi xuất image vì ổ C gần đầy; chưa chạy được smoke test container. Người dùng sẽ tự xử lý dung lượng. Kiểm tra đọc CRM trên Windows cũng chưa hoàn tất do kết nối CDP timeout. Phải hoàn thành các kiểm tra này và nghiệm thu phiên đăng nhập trên máy chủ trước khi chuyển Production.

## Chuẩn bị

Trên máy hiện tại, tạo cấu hình từ khóa đồng bộ đã có, không cần thay cấu hình webhook CRM:

```powershell
node scripts/prepare-crm-worker-config.mjs
```

File sinh ra là `deploy/crm-worker/.env.local`, không được đưa vào Git hoặc image. Nếu cấu hình thủ công, chép `env.example` thành `.env.local` và điền `AMIS_REPORT_SYNC_SECRET` của Dashboard. Đây là khóa đồng bộ nội bộ, khác khóa webhook. Không cần chép `.env` toàn dự án, cookie hoặc browser profile Windows lên server.

Trên server, clone repository vào thư mục do người vận hành chọn; chuyển riêng `.env.local` bằng SSH/SCP và đặt quyền `chmod 600`. Từ gốc repository:

```sh
docker compose -f deploy/crm-worker/compose.yaml up -d --build
docker compose -f deploy/crm-worker/compose.yaml ps
```

Chỉ chạy **một** instance dùng volume này. Chromium và worker chạy bằng tài khoản thường, sandbox/seccomp được bật. Profile nằm trong named volume `dashboard-crm_browser-profile`; hostname cố định giúp Chromium nhận diện cùng máy sau khi tạo lại container. Không dùng `down -v`, vì lệnh đó xóa phiên đăng nhập.

## Đăng nhập AMIS lần đầu hoặc khi hết phiên

Đăng nhập trên browser của server để phiên được lưu ở đó. Windows mã hóa cookie theo máy nên không coi việc chép profile Windows sang Linux là cách chuyển phiên hợp lệ.

1. Trên server, dừng nhận việc mới và mở màn hình đăng nhập riêng trong tối đa 15 phút:

   ```sh
   docker compose -f deploy/crm-worker/compose.yaml exec crm-worker supervisorctl -c /app/deploy/crm-worker/supervisord.conf stop worker
   docker compose -f deploy/crm-worker/compose.yaml exec crm-worker supervisorctl -c /app/deploy/crm-worker/supervisord.conf start login
   ```

2. Trên máy cá nhân, mở SSH tunnel (thay `USER@SERVER` bằng tài khoản/máy thực):

   ```sh
   ssh -N -L 16080:127.0.0.1:6080 USER@SERVER
   ```

3. Mở `http://127.0.0.1:16080/vnc.html`, bấm Connect, đăng nhập AMIS và hoàn tất OTP nếu AMIS yêu cầu. Mở dashboard CRM, xác nhận có hai widget. Không gửi mật khẩu/OTP vào chat.

4. Đóng cửa sổ truy cập từ xa và khởi động worker:

   ```sh
   docker compose -f deploy/crm-worker/compose.yaml exec crm-worker supervisorctl -c /app/deploy/crm-worker/supervisord.conf stop login
   docker compose -f deploy/crm-worker/compose.yaml exec crm-worker supervisorctl -c /app/deploy/crm-worker/supervisord.conf start worker
   ```

   Nếu `login` đã tự dừng sau 15 phút thì bỏ qua thông báo “not running”. Có thể đóng SSH tunnel sau bước này.

noVNC chỉ được publish tại `127.0.0.1` của server và chỉ chạy khi được bật; truy cập qua SSH đã xác thực. Không publish cổng 5900/9223 hoặc đổi binding 6080 thành `0.0.0.0` trên host. Không mở các cổng này trên firewall.

## Vận hành và nghiệm thu

```sh
docker compose -f deploy/crm-worker/compose.yaml exec crm-worker node deploy/crm-worker/status.mjs
docker compose -f deploy/crm-worker/compose.yaml logs --tail 50 crm-worker
```

- Worker kiểm tra hàng đợi mỗi 5 giây, làm mới dự phòng mỗi 300 giây. Hai widget luôn đọc lần lượt, giữ nguyên phạm vi/cách tính trên CRM.
- `lastSuccessAt` chỉ cập nhật sau khi cả hai snapshot đã lưu. `auth_required` yêu cầu đăng nhập lại theo các bước trên; chưa có bằng chứng AMIS cho phép gia hạn phiên vô thời hạn. Giữ profile không có nghĩa phiên sẽ không bao giờ hết hạn.
- Heartbeat được ghi mỗi 10 giây; Docker healthcheck phát hiện heartbeat quá 45 giây hoặc browser không phản hồi. Supervisor khởi động lại tiến trình bị thoát; Docker khởi động lại container khi tiến trình chính thoát hoặc máy chủ khởi động. Healthcheck báo lỗi, **không tự khởi động lại container chỉ vì unhealthy**.
- Khi chưa đăng nhập hoặc API lỗi, giữ snapshot trước và công việc vẫn chờ thử lại. Không công bố dữ liệu mới bằng số giả.
- Container có 8 phút để hoàn tất công việc và đóng profile trước khi dừng. Nếu bị dừng đột ngột, lease hàng đợi hết hạn sau 10 phút để có thể thử lại.

Sau khi đã đăng nhập server, phải xác minh snapshot cập nhật, restart container vẫn giữ phiên, rồi thử webhook trong lúc worker và hai tác vụ xếp hạng Windows đã tạm dừng. Chỉ tắt các tác vụ Windows lâu dài khi phép thử này thành công. Không tắt tác vụ Kế toán.

Webhook hiện lên lịch cho tháng hiện tại theo giờ Việt Nam. Chưa suy đoán tháng quá khứ từ payload khi chưa xác minh trường ngày nghiệp vụ. Thời gian cập nhật gồm debounce, nhịp hàng đợi, thời gian API CRM và thông báo Realtime; không cam kết tức thì.

## Nguồn cấu hình

- [Playwright Docker](https://playwright.dev/docs/docker): image khớp Playwright 1.62.1, non-root và seccomp. `seccomp_profile.json` lấy nguyên bản từ [tag 1.62.1](https://github.com/microsoft/playwright/blob/v1.62.1/utils/docker/seccomp_profile.json).
- [Vercel Daemons](https://vercel.com/docs/daemons/limits): hiện chưa có ổ đĩa bền vững và inbound TCP/HTTP cho quy trình đăng nhập browser này.
- [Docker volumes](https://docs.docker.com/engine/storage/volumes/) và [restart policy](https://docs.docker.com/engine/containers/start-containers-automatically/).
