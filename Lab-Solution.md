# Codelab Solution & Project Report

Tài liệu này tổng hợp toàn bộ các kết quả và giải pháp đã thực hiện trong quá trình hoàn thiện bài tập của **CODELAB.md**.

## 1. Bài Tập Cộng Điểm (Bonus Exercises)

### Bài 1: Xây dựng Giao diện Demo Trực Quan (Vite + React)
Yêu cầu: *Code HTML File Để demo các tương tác của các Agent ở stage 4 hoặc stage 5.*

**Giải pháp đã triển khai:**
Thay vì chỉ dùng HTML tĩnh cơ bản, chúng tôi đã phát triển hẳn một giao diện **React + Vite Dashboard** cực kỳ chuyên nghiệp và trực quan cho mô hình Distributed A2A (Stage 5).
- **Vị trí code:** Thư mục `registry/ui`
- **Tính năng nổi bật:**
  - Tích hợp **ReactFlow** để vẽ sơ đồ Multi-Agent (User, Customer, Law, Tax, Compliance, LLM, Registry).
  - Tích hợp **WebSocket** (`/ws/traces`) để bắt tín hiệu (traces) theo thời gian thực.
  - **Logic hoạt họa (Animations):** Các Agent sáng lên khi đang xử lý task. Đường truyền (edges) song song hoàn hảo: màu **Xanh (Blue)** cho đường giao việc (ask), màu **Tím (Purple)** cho đường trả kết quả (reply).
  - **Xử lý lỗi (Fault-Tolerance):** Nếu một Agent (ví dụ Tax) bị sập hoặc mất kết nối, hệ thống giao diện sẽ bôi đỏ Agent đó (hiện chữ OFFLINE) và đánh dấu đỏ đường truyền bị lỗi.
  - Tích hợp **Khung Chat (Chat Interface)** với các nút gợi ý, tự động proxy qua `/api/chat` của Registry mà không vướng lỗi CORS.
  - Đã fix lỗi Base Path của Vite (`base: './'`) và cập nhật `EXEMPT_PATHS` trong `common/auth.py` để file tĩnh không bị chặn bởi API Key Middleware.

### Bài 2: Phân tích và Tối ưu Latency (Độ trễ)
Yêu cầu: *Đánh giá Latency và đề xuất phương án giảm thời gian xử lý.*

**A. Đánh giá Latency ban đầu:**
- Trong kiến trúc Distributed A2A, một request phải đi qua: User -> Customer Agent -> Law Agent -> (Tax/Compliance Agent) -> LLM -> Trả ngược lại.
- **Vấn đề gặp phải:** Timeout mặc định ban đầu là `30.0s` trong `test_client.py` thường xuyên gây ra lỗi `A2AClientTimeoutError` vì LLM xử lý mất quá nhiều thời gian cho một chuỗi agents sâu như vậy. 
- **Giải pháp tạm thời:** Nâng timeout lên `120.0s`. Tổng thời gian phản hồi (Latency) đo được trung bình khoảng **20 - 35 giây** tùy thuộc vào độ phức tạp của câu hỏi.

**B. Đề xuất phương án giảm Latency & Tối ưu:**
1. **Thực thi Song song (Parallel Execution):** Tận dụng API `Send` của LangGraph để Law Agent có thể gọi Tax Agent và Compliance Agent *cùng một lúc* thay vì chờ đợi tuần tự.
2. **Caching (Bộ nhớ đệm):** Implement LLM Cache (như `langchain.cache` hoặc Redis). Các câu hỏi phổ biến sẽ được trả lời ngay lập tức (Latency < 1s) mà không cần gọi API OpenAI/OpenRouter.
3. **Model Tiering (Phân cấp Mô hình):** 
   - Dùng các mô hình nhỏ/nhanh (như `gpt-4o-mini` hoặc `llama-3`) cho các Agent chỉ làm nhiệm vụ định tuyến (Router/Customer Agent).
   - Chỉ dùng mô hình lớn (`gpt-4o` / `claude-3.5-sonnet`) cho Law Agent để phân tích chuyên sâu.
4. **Streaming (Truyền dữ liệu dạng dòng):** Mở websocket truyền streaming tokens trực tiếp ra UI. Người dùng sẽ thấy text xuất hiện ngay lập tức thay vì phải đợi toàn bộ chu trình 30s kết thúc (Giảm *Perceived Latency*).

---

## 2. Giải pháp cho các Bài Tập Thực Hành Khác (Stages 1 - 5)

**Phần 1: Direct LLM Calling**
- Đã phân tích cơ chế `ChatOpenAI`, cách thức hoạt động của `SystemMessage` và `HumanMessage`.

**Phần 2: LLM + RAG & Tools**
- Đã nắm rõ cách dùng `@tool` decorator và cơ chế `.bind_tools()` để ép LLM phân tích và chọn tool cần thiết (Function Calling).

**Phần 3: Single Agent với ReAct**
- So với Stage 2 (tự viết vòng lặp gọi tool), hàm `create_react_agent` đã tự động hóa hoàn toàn quy trình *Think -> Act -> Observe* mà chỉ cần 1 lần `.invoke()`.

**Phần 4: Multi-Agent In-Process**
- Phân tích `TypedDict` State dùng chung để điều hướng giữa các agent (`law_agent`, `tax_agent`, `compliance_agent`). Graph được chia nhánh động bằng conditional edges và `Send` API.

**Phần 5: Distributed A2A System**
- Đã trực tiếp xây dựng giao diện quan sát `trace_id`.
- Đã kiểm tra tính năng Dynamic Discovery: Khi tắt Tax Agent, Law Agent vẫn bắt được Exception và trả về log lỗi `[Tax analysis unavailable: ...]`, hệ thống không bị crash toàn bộ.

---

## 3. Lịch sử Fix Bugs quan trọng (Bug Log)
- **Lỗi màn hình trắng (White Screen):** Cập nhật `vite.config.js` (`base: './'`) để các tài nguyên js/css load bằng đường dẫn tương đối.
- **Lỗi 401 Unauthorized API Key:** Cập nhật `EXEMPT_PATHS` trong `common/auth.py` bỏ qua các route Frontend (`/dashboard/`, `/assets/`, `/favicon`, v.v.).
- **Lỗi giao diện vẽ đè dây nối chéo nhau (X-Shape edges):** Tối ưu hệ thống Handles trong ReactFlow. Đường 'ask' được đưa về lane 35% và đường 'reply' đưa về lane 65%, giúp các mũi tên hoạt họa chạy song song mượt mà.
- **Lỗi kẹt hiệu ứng phát sáng (Glowing Bug):** Bổ sung logic tắt (turn-off) cạnh (edge) chiều đi ngay khi nhận được tín hiệu trả lời (reply trace) từ target.
