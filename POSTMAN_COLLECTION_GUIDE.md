# Postman Collection 使用指南

## 📋 概述

這個更新版的Postman Collection包含了你的Media Processor API的所有端點，包括：
- 認證和設置
- CPU測試（無需認證）
- 媒體管理
- 圖片處理
- 視頻處理
- 音頻處理
- 3D動畫生成
- 安全測試
- 性能測試

## 🚀 快速開始

### 1. 導入Collection
1. 打開Postman
2. 點擊 "Import" 按鈕
3. 選擇 `postman_collection_updated.json` 文件
4. 點擊 "Import" 完成導入

### 2. 設置環境變數
Collection已經預設了以下變數：
- `base_url`: http://localhost:3000
- `auth_token`: 登入後自動設置
- `file_id`: 上傳文件後自動設置
- `user_id`: 登入後自動設置

## 📁 Collection 結構

### **1. Authentication & Setup**
- **Login - Admin**: 使用admin/admin123登入
- **Login - User**: 使用user/user123登入
- 登入成功後會自動保存JWT token

### **2. System & Health**
- **Health Check**: 檢查應用程式健康狀態
- **Database Status**: 檢查資料庫狀態

### **3. CPU Testing (No Auth Required)**
- **CPU Load Test - Low**: 低負載測試 (10s, 100K ops)
- **CPU Load Test - Medium**: 中等負載測試 (30s, 500K ops)
- **CPU Load Test - High**: 高負載測試 (60s, 1M ops)
- **CPU Load Test - Extreme**: 極限負載測試 (120s, 2M ops)

### **4. Media Management**
- **Upload Media File**: 上傳媒體文件
- **Get Media Files**: 獲取用戶文件列表
- **Get Processed Files**: 獲取處理後的文件
- **Get Completed Jobs**: 獲取完成的任務
- **Download File**: 下載文件
- **Delete File**: 刪除文件
- **Update File Info**: 更新文件信息

### **5. Image Processing**
- **Resize Image**: 調整圖片大小
- **Crop Image**: 裁剪圖片

### **6. Video Processing**
- **Process Video**: 處理視頻
- **Crop Video**: 裁剪視頻

### **7. Audio Processing**
- **Process Audio**: 處理音頻

### **8. 3D Animation & CPU Tasks**
- **Generate 3D Animation**: 生成3D動畫
- **CPU Intensive Task**: CPU密集型任務（需要認證）

### **9. Security & Error Testing**
- **Unauthorized Access Test**: 測試未授權訪問
- **Invalid Token Test**: 測試無效token
- **File Not Found Test**: 測試文件不存在

### **10. Performance Testing**
- **Concurrent CPU Tests**: 並發CPU測試
- **Stress Test - High Load**: 高負載壓力測試

## 🔧 使用流程

### **基本測試流程：**
1. **啟動應用程式**: `npm start`
2. **健康檢查**: 運行 "Health Check" 確認服務正常
3. **登入**: 運行 "Login - Admin" 或 "Login - User"
4. **上傳文件**: 運行 "Upload Media File"
5. **測試功能**: 根據需要測試各種處理功能
6. **CPU測試**: 運行各種CPU負載測試

### **CPU測試流程：**
1. **無需認證**: 直接運行CPU測試端點
2. **選擇複雜度**: 從Low到Extreme
3. **監控系統**: 觀察CPU使用率
4. **查看結果**: 檢查響應和日誌

## 📊 測試腳本功能

### **自動化功能：**
- **Token管理**: 登入後自動保存JWT token
- **文件ID追蹤**: 上傳文件後自動保存文件ID
- **用戶ID追蹤**: 登入後自動保存用戶ID

### **全局測試：**
- **響應時間檢查**: 確保響應時間 < 5000ms
- **JSON格式驗證**: 確保響應是有效JSON
- **日誌記錄**: 記錄響應狀態和時間

## ⚠️ 注意事項

### **1. 測試順序**
- 先運行認證端點
- 再運行需要認證的功能
- CPU測試可以隨時運行（無需認證）

### **2. 文件上傳**
- 需要選擇實際的文件
- 支持圖片、音頻、視頻格式
- 文件大小限制500MB

### **3. CPU測試**
- 會產生大量CPU負載
- 建議在測試環境中運行
- 監控系統資源使用

### **4. 錯誤處理**
- 包含各種錯誤情況的測試
- 驗證API的安全性和穩定性

## 🎯 測試建議

### **功能測試：**
1. **基本功能**: 認證、文件上傳、下載
2. **處理功能**: 圖片、視頻、音頻處理
3. **管理功能**: 文件列表、刪除、更新

### **性能測試：**
1. **CPU負載**: 從低到高逐步測試
2. **並發測試**: 同時運行多個請求
3. **壓力測試**: 極限負載下的表現

### **安全測試：**
1. **認證測試**: 無效token、過期token
2. **權限測試**: 未授權訪問
3. **錯誤處理**: 無效參數、文件不存在

## 🔍 故障排除

### **常見問題：**
1. **連接失敗**: 檢查應用程式是否運行
2. **認證失敗**: 檢查用戶名密碼
3. **文件上傳失敗**: 檢查文件格式和大小
4. **CPU測試失敗**: 檢查端點是否正常

### **調試技巧：**
1. 查看Postman Console日誌
2. 檢查響應狀態碼
3. 驗證請求參數
4. 檢查環境變數

## 📚 相關文檔

- **API文檔**: 查看README.md中的API端點說明
- **CPU測試指南**: CPU_TEST_GUIDE.md
- **開發指南**: DEVELOPMENT_GUIDE.md

---

**使用這個Collection可以完整測試你的Media Processor API的所有功能！** 🎉
