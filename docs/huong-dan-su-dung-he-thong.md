# Hướng dẫn sử dụng hệ thống theo từng vị trí

## 1. Mục đích
Hệ thống được thiết kế để quản lý quy trình thẩm định và in ấn hồ sơ theo từng vai trò khác nhau. Mỗi vị trí có nhiệm vụ riêng, nhưng đều làm việc trên cùng một dashboard trung tâm.

## 2. Cách đăng nhập
1. Mở trình duyệt và truy cập giao diện đăng nhập.
2. Nhập tài khoản và mật khẩu tương ứng với vai trò.
3. Sau khi đăng nhập thành công, hệ thống sẽ chuyển sang dashboard.

### Tài khoản mẫu mặc định
- Admin: admin / admin123
- Kinh doanh: kinhdoanh / kinhdoanh123
- Thẩm định: thamdinh / thamdinh123
- Thẩm định viên: thamdinhvien / thamdinhvien123
- TP Duyệt: truongphong / truongphong123
- In ấn: inan / inan123

## 3. Bảng hướng dẫn sử dụng theo vị trí

| Vị trí | Vai trò chính | Công việc thường xuyên | Thao tác trên hệ thống | Ghi chú |
|---|---|---|---|---|
| Admin | Quản trị hệ thống | Quản lý người dùng, phân công, theo dõi toàn bộ quy trình | Đăng nhập, xem toàn bộ hồ sơ, tạo/sửa/xóa hồ sơ, quản lý tài khoản, xem lịch sử hệ thống | Có quyền cao nhất, có thể điều chỉnh hầu hết dữ liệu |
| Kinh doanh | Người tạo hồ sơ | Tạo hồ sơ mới, tải tài liệu ban đầu, theo dõi tiến độ | Vào Dashboard, chọn tạo hồ sơ, điền thông tin, đính kèm file, gửi hồ sơ đi, theo dõi trạng thái | Là người khởi tạo quy trình |
| Thẩm định | Người phụ trách công đoạn thẩm định | Xem hồ sơ được giao, tải file kết quả thẩm định, đánh giá hồ sơ | Vào danh sách hồ sơ, mở hồ sơ được giao, tải file thẩm định, gửi kết quả, trả hồ sơ nếu cần bổ sung | Là người xử lý chính ở vòng thẩm định |
| Thẩm định viên | Người đánh giá chi tiết hồ sơ | Đánh giá hồ sơ theo từng bước, ghi nhận kết quả, gửi lại cho thẩm định | Mở hồ sơ được phân công, tải file đánh giá, chọn kết quả đạt/không đạt, ghi chú, chuyển hồ sơ tiếp | Thường làm việc trong giai đoạn kiểm tra chi tiết |
| TP Duyệt | Người duyệt cuối trước in ấn | Duyệt hoặc từ chối hồ sơ, kiểm soát luồng hồ sơ | Xem hồ sơ ở trạng thái chờ duyệt, xem kết quả thẩm định, phê duyệt hoặc yêu cầu bổ sung | Có quyền kiểm soát việc chuyển hồ sơ tiếp theo |
| In ấn | Người thực hiện công đoạn in ấn | Hoàn tất hồ sơ sau khi được duyệt | Vào hồ sơ đã chuyển sang In ấn, kiểm tra nội dung, thực hiện công việc in ấn, đánh dấu hoàn tất | Là vị trí cuối cùng trước khi hồ sơ kết thúc |

## 4. Luồng xử lý chung
1. Kinh doanh tạo hồ sơ và đính kèm tài liệu đầu vào.
2. Admin hoặc TP Duyệt phân công người thẩm định.
3. Thẩm định thực hiện đánh giá và gửi kết quả.
4. Thẩm định viên tiếp tục kiểm tra chi tiết và đưa kết luận.
5. TP Duyệt phê duyệt hoặc yêu cầu chỉnh sửa.
6. Hồ sơ chuyển sang In ấn và hoàn tất.

## 5. Gợi ý thao tác từng vị trí

### Admin
- Quản lý danh sách người dùng.
- Phân công thẩm định cho hồ sơ.
- Theo dõi toàn bộ lịch sử xử lý.
- Kiểm tra lỗi hoặc trạng thái hồ sơ bất thường.

### Kinh doanh
- Tạo hồ sơ mới ngay từ dashboard.
- Tải lên tài liệu ban đầu.
- Theo dõi trạng thái hồ sơ sau mỗi bước.
- Chờ kết quả từ thẩm định và duyệt.

### Thẩm định
- Mở hồ sơ được giao.
- Tải file kết quả thẩm định.
- Gửi phản hồi và chuyển hồ sơ cho bước tiếp theo.

### Thẩm định viên
- Xem hồ sơ cần đánh giá.
- Đưa kết quả đạt/không đạt.
- Ghi chú rõ ràng để người phụ trách biết nguyên nhân.

### TP Duyệt
- Xem hồ sơ đã hoàn thành thẩm định.
- Quyết định phê duyệt hoặc yêu cầu bổ sung.
- Đảm bảo hồ sơ đủ điều kiện để chuyển sang in ấn.

### In ấn
- Nhận hồ sơ đã được duyệt.
- Thực hiện công việc in ấn.
- Đánh dấu hồ sơ hoàn tất.

## 6. Cách diễn giải cho nhân viên
Dưới đây là cách trình bày ngắn gọn, dễ hiểu cho nhân viên khi giải thích hệ thống:

- Admin: là người quản trị tổng thể. Admin chịu trách nhiệm tạo tài khoản, phân công công việc, theo dõi toàn bộ tiến trình hồ sơ và kiểm soát các vấn đề phát sinh.
- Kinh doanh: là người khởi tạo hồ sơ. Kinh doanh nhập thông tin hồ sơ, đính kèm tài liệu ban đầu và gửi hồ sơ vào quy trình.
- Thẩm định: là người tiếp nhận hồ sơ từ khâu kinh doanh và thực hiện đánh giá ban đầu. Nếu hồ sơ cần bổ sung, thẩm định sẽ yêu cầu chỉnh sửa trước khi chuyển tiếp.
- Thẩm định viên: là người thực hiện kiểm tra chi tiết hơn. Họ xem xét hồ sơ kỹ lưỡng, đưa kết luận đạt hoặc không đạt và ghi nhận ý kiến rõ ràng.
- TP Duyệt: là người quyết định cuối cùng trước khi hồ sơ đi vào in ấn. TP Duyệt xem xét kết quả thẩm định và phê duyệt hoặc trả lại nếu chưa đủ điều kiện.
- In ấn: là người nhận hồ sơ đã được duyệt và thực hiện công việc in ấn cuối cùng. Sau khi hoàn tất, hồ sơ được xem là kết thúc quy trình.

## 7. Lưu ý quan trọng
- Mỗi thao tác đều nên ghi chú rõ ràng để dễ tra cứu lịch sử.
- Người dùng cần đăng nhập đúng vai trò để thấy đúng danh sách hồ sơ và quyền thao tác.
- Nếu hồ sơ bị trả lại, cần kiểm tra lại file và nội dung phản hồi trước khi gửi lại.
