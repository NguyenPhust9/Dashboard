# Cấu hình webhook AMIS CRM

Địa chỉ nhận: `https://baocao-chi.vercel.app/api/amis-webhook`.

Trong CRM, thay địa chỉ webhook cũ bằng địa chỉ trên, giữ phương thức `POST`, thêm Header `Authorization` với giá trị `Bearer <AMIS_WEBHOOK_SECRET>`. Cấu hình để sao chép nằm trong `data/amis-webhook-config.local.txt`, được loại khỏi Git. Khóa phía server nằm trong `.env` và biến môi trường Production của Vercel.

Endpoint chỉ tiếp nhận JSON đã xác thực, lưu dấu nhận và yêu cầu làm mới tháng hiện tại. Số tiền tiếp tục lấy từ API widget CRM, không lấy từ nội dung webhook. Phạm vi sự kiện và định dạng phản hồi của CRM sẽ được xác minh sau khi người dùng điền cấu hình.

Trạng thái chuẩn bị: endpoint nhận và hàng đợi đã triển khai; chưa bật worker xử lý webhook, chưa bật cập nhật giao diện qua Realtime. Các tác vụ đồng bộ định kỳ cũ vẫn giữ nguyên. Theo yêu cầu của người dùng, không gửi webhook giả lập, không chạy worker hay kiểm thử tích hợp trước khi người dùng xác nhận đã điền xong cấu hình CRM.
