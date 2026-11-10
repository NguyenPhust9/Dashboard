# Abraham Bike Dashboard

Dashboard điều hành lấy cảm hứng từ file HTML tham khảo mới nhất. Các chỉ số và bảng hiện dùng dữ liệu minh họa, chưa kết nối AMIS CRM.

## Công nghệ

- Next.js 15, React 19, TypeScript và TSX cho giao diện.
- FastAPI trên Python cho API dữ liệu mẫu.

## Chạy giao diện

```bash
npm.cmd install
npm.cmd run dev
```

Mở `http://localhost:3000`.

## Chạy API Python (tùy chọn)

```bash
py -m venv .venv
.venv\Scripts\activate
pip install -r backend\requirements.txt
uvicorn backend.main:app --reload --port 8000
```

API mẫu: `http://localhost:8000/api/dashboard` và `http://localhost:8000/api/health`.
