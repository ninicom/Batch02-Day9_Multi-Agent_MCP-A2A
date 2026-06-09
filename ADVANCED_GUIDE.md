# Tài Liệu Hướng Dẫn: Bài Tập Nâng Cao (Advanced Challenges)

Tài liệu này giải thích chi tiết nguyên lý, quy tắc hoạt động và vị trí chỉnh sửa code cho 4 bài tập nâng cao đã được hoàn thiện trong hệ thống Legal Multi-Agent A2A.

---

## Challenge 1: Thêm Memory / Conversation History

**Mục tiêu:** Giúp Agent ghi nhớ bối cảnh của các câu hỏi trước đó (Conversation Memory) trong cùng một luồng hội thoại.

### Nguyên lý và Quy tắc hoạt động:
- Các agents hiện tại được xây dựng dựa trên LangGraph. LangGraph cung cấp khái niệm **Checkpointer** để lưu lại toàn bộ trạng thái (state) và lịch sử các message tại mỗi bước (node) chạy.
- Bằng cách cấu hình `MemorySaver` (hoặc một DB checkpointer tuỳ chỉnh) và truyền `thread_id` vào lúc `invoke`, agent có thể nạp lại state của các lượt hội thoại trước đó thuộc cùng một `thread_id` trước khi đưa vào LLM.
- Trong giao thức A2A, mỗi chuỗi gọi đều có `context_id`. Chúng ta dùng `context_id` này làm `thread_id` để chia tách memory của từng user/session.

### Code như thế nào & Thêm ở đâu?
- **Sửa file `customer_agent/graph.py`**:
  - `import` và khởi tạo một biến toàn cục `memory = MemorySaver()`.
  - Trong hàm `create_react_agent`, truyền thêm tham số `checkpointer=memory`.
- *Tại sao là global?* Vì hàm `build_graph()` được gọi lại cho mỗi request. Bằng cách giữ `memory` ở dạng global in-memory, các request đến sau có cùng `context_id` có thể truy xuất lại lịch sử từ bộ nhớ chung này.
- *Tại sao ở Customer Agent?* Mọi tương tác của user đều chạm đến Customer Agent đầu tiên. Việc giữ memory ở Customer Agent đảm bảo bối cảnh hội thoại chung được lưu lại ngay từ cổng vào, giúp tiết kiệm bộ nhớ tại các sub-agents.

---

## Challenge 2: Add Authentication (API Key)

**Mục tiêu:** Bảo vệ các A2A endpoints để chỉ những clients hoặc agents nội bộ có API Key hợp lệ mới được gọi API.

### Nguyên lý và Quy tắc hoạt động:
- Thay vì để các API mở hoàn toàn (0.0.0.0), ta áp dụng một **Middleware** ở tầng HTTP. Mọi request (GET, POST) đi vào server đều bị chặn lại để kiểm tra xem có chứa HTTP Header `X-API-Key` hay không.
- Nếu Key trùng khớp với biến môi trường `A2A_API_KEY` (hoặc key mặc định trong `.env`), request được đi tiếp. Ngược lại, trả về `401 Unauthorized`.
- Mọi client (bao gồm `test_client.py` và các agent gọi chéo qua nhau) đều phải được cấu hình để nhúng thêm Header `X-API-Key` khi thực hiện requests qua HTTP.

### Code như thế nào & Thêm ở đâu?
- **Tạo mới file `common/auth.py`**:
  - Viết hàm `api_key_middleware` sử dụng `fastapi.Request`. Hàm này trích xuất header `X-API-Key` và so sánh.
- **Sửa file `__main__.py` của TẤT CẢ các agent (Registry, Customer, Law, Tax, Compliance)**:
  - Ở ngay trước dòng chạy server, thêm middleware vào ứng dụng FastAPI: `app.middleware("http")(api_key_middleware)`.
- **Sửa các HTTP clients (`common/a2a_client.py`, `common/registry_client.py`, `test_client.py`)**:
  - Cập nhật các instance `httpx.AsyncClient(headers={"X-API-Key": A2A_API_KEY})` để tự động truyền key mỗi lần gọi chéo (discovery, delegate, register).

---

## Challenge 3: Implement Retry Logic

**Mục tiêu:** Tự động retry với khoảng trễ tăng dần (exponential backoff) khi một agent khác bị lỗi mạng (tắt đột ngột, timeout). Khắc phục tình trạng agent bị crash ngay trong lần thử kết nối đầu tiên.

### Nguyên lý và Quy tắc hoạt động:
- Khi liên kết qua mạng, một dịch vụ (agent) có thể bị gián đoạn chốc lát.
- Exponential backoff nghĩa là thử lại nhiều lần (max retries), mỗi lần thất bại thì khoảng thời gian chờ (delay) trước khi thử lại sẽ nhân đôi (ví dụ: 2s, 4s, 8s).
- Ta sử dụng một vòng lặp `for` bao bọc lấy khối lệnh gọi API. Bắt (catch) các exception đặc thù của mạng như `httpx.ConnectError` hay `httpx.TimeoutException` thay vì catch toàn bộ Exception để tránh retry các lỗi sai logic (như 400 Bad Request).

### Code như thế nào & Thêm ở đâu?
- **Sửa file `common/a2a_client.py` (Hàm `delegate`)**:
  - Gói toàn bộ logic kết nối (`async with httpx.AsyncClient...` và `client.send_message`) vào trong một vòng `try...except`.
  - Nếu gặp lỗi mạng, sử dụng `await asyncio.sleep(delay)` và tiếp tục vòng lặp cho lần attempt kế. Nếu hết số lần thử (`max_retries = 3`), raise lỗi đó ra ngoài.

---

## Challenge 4: Monitoring & Observability

**Mục tiêu:** Theo dõi và giám sát performance, các suy luận (reasoning paths), input/output của agent một cách trực quan.

### Nguyên lý và Quy tắc hoạt động:
- Kiến trúc của hệ thống tận dụng **LangGraph** & **LangChain**, những thư viện này đã được tích hợp sẵn (native integration) với **LangSmith** của LangChain.
- Bạn không cần viết thêm hay sửa đổi code bên trong các file python. Thay vào đó, bộ thư viện sẽ tự động kích hoạt tính năng gửi telemetry (traces) lên dashboard LangSmith mỗi khi nó nhận diện được các biến môi trường cấu hình hợp lệ.
- Tracing cho phép bạn "mổ xẻ" cụ thể thời gian từng LLM chain chạy, các tokens tiêu thụ, và công cụ nào đã được gọi ra (ví dụ: `delegate_to_legal_agent`).

### Code như thế nào & Thêm ở đâu?
- **Sửa file `.env` (và `.env.example`)**:
  Thêm cấu hình LangSmith:
  ```env
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=<your_langsmith_api_key_here>
  LANGCHAIN_PROJECT=A2A-Legal-Agents
  ```
- Việc gọi `load_dotenv()` ở đầu mỗi agent (`__main__.py`) sẽ nạp các biến này. Ngay khi LangGraph khởi chạy `create_react_agent`, nó sẽ tự động stream toàn bộ trace (trạng thái chạy) lên nền tảng LangSmith. (Nếu chưa có account, bạn có thể đăng ký tại *smith.langchain.com*).
