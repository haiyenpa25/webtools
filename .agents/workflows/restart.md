---
description: Restart WebTools CMS server - kill process cũ rồi khởi động lại
---

Chạy file `restart.bat` để kill process Node.js cũ trên port 3000 và khởi động lại server.

// turbo

1. Chạy file restart.bat để restart server:
```powershell
Start-Process -FilePath "c:\xampp\htdocs\Webtools\restart.bat"
```

2. Xác nhận hoàn tất
Server đang restart trong cửa sổ mới. Sau vài giây, truy cập http://localhost:3000 để kiểm tra.
