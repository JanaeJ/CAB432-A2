# EC2 CPU Stress Test Guide

## 🎯 目標

這個指南幫助你在EC2 t3.micro實例上運行CPU stress test，滿足作業要求：
- **CPU使用率 > 80%**
- **持續時間 ≥ 5分鐘**
- **通過API請求觸發**

## 🚀 快速開始

### 1. 部署到EC2

```bash
# 連接到你的EC2實例
ssh -i your-key.pem ec2-user@your-ec2-ip

# 克隆或上傳你的專案
git clone <your-repo-url>
cd your-project

# 安裝依賴
npm install

# 啟動應用程式
npm start
```

### 2. 運行CPU Stress Test

```bash
# 在新的終端視窗中運行測試
node scripts/ec2-cpu-stress-test.js
```

## 🔧 EC2 t3.micro 配置

### **實例規格：**
- **vCPU**: 2 (shared)
- **記憶體**: 1 GB
- **網路**: Up to 5 Gbps
- **儲存**: EBS only

### **優化建議：**
```bash
# 安裝htop進行監控
sudo yum install htop -y

# 安裝iotop監控I/O
sudo yum install iotop -y

# 設置swap空間（如果需要）
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## 📊 測試腳本特點

### **`ec2-cpu-stress-test.js` 功能：**

#### **🎯 目標配置：**
- **目標CPU**: 80%+
- **測試時間**: 5分鐘
- **並發請求**: 200個
- **複雜度**: extreme
- **操作數**: 3,000,000

#### **📈 實時監控：**
- 實時顯示測試進度
- CPU使用率追蹤
- 請求成功率統計
- 響應時間分析

#### **🔍 結果分析：**
- 自動檢查要求是否滿足
- 性能建議和優化提示
- 詳細的統計報告

## 🖥️ 監控CPU使用率

### **方法1: CloudWatch (推薦)**
```bash
# 在AWS Console中查看CloudWatch
# 選擇你的EC2實例
# 查看CPUUtilization指標
```

### **方法2: 終端監控**
```bash
# 實時CPU使用率
top -p $(pgrep node)

# 更直觀的監控
htop

# 系統負載
uptime

# 進程監控
ps aux | grep node
```

### **方法3: 系統監控命令**
```bash
# CPU使用率
mpstat 1 5

# 系統負載
iostat 1 5

# 記憶體使用
free -h
```

## 🚀 運行測試

### **基本測試：**
```bash
# 運行完整測試
node scripts/ec2-cpu-stress-test.js
```

### **自定義測試：**
```bash
# 修改腳本中的配置
const testConfig = {
  targetCPU: 85,        // 提高目標CPU
  duration: 6 * 60,     // 6分鐘
  requests: 300,         // 更多並發請求
  operations: 5000000    // 更多操作
};
```

### **並行測試：**
```bash
# 開啟多個終端，同時運行多個測試
# 終端1
node scripts/ec2-cpu-stress-test.js

# 終端2
node scripts/quick-cpu-test.js

# 終端3
node scripts/cpu-stress-test-advanced.js
```

## 📊 預期結果

### **成功標準：**
- ✅ **CPU使用率**: > 80% (持續5分鐘)
- ✅ **測試時間**: ≥ 5分鐘
- ✅ **成功率**: > 90%
- ✅ **系統穩定**: 無崩潰或錯誤

### **典型輸出：**
```
🔥 EC2 t3.micro CPU Stress Test
============================================================
Target CPU Usage: 80%+
Test Duration: 5 minutes
Concurrent Requests: 200
Complexity: extreme
Operations: 3,000,000
Request Interval: 1000ms
============================================================

🚀 Starting EC2 CPU Stress Test...

⏱️  Time: 4:59 | ✅ Success: 198 | ❌ Failed: 2 | 📊 RPS: 0.67 | 🔥 CPU: 87.3% | 🚀 Peak: 95.1%

📊 EC2 CPU Stress Test Results
============================================================
Total Test Time: 5.00 minutes
Total Requests: 200
Successful: 198
Failed: 2
Success Rate: 99.00%
Average Response Time: 2345.67ms
Requests Per Second: 0.67
Average CPU Usage: 87.30%
Peak CPU Usage: 95.10%

🎯 Requirements Check:
------------------------------------------------------------
CPU Usage > 80%: ✅ PASS (87.3%)
Duration >= 5 minutes: ✅ PASS (5.00 minutes)

🎉 SUCCESS: All requirements met!
Your EC2 t3.micro instance can handle the CPU load!
```

## ⚠️ 注意事項

### **1. 資源監控**
- 監控記憶體使用情況
- 檢查磁碟I/O
- 觀察網路連接數

### **2. 安全考慮**
- 確保防火牆設置正確
- 只允許必要的端口訪問
- 定期更新安全補丁

### **3. 成本控制**
- t3.micro有CPU積分限制
- 長時間高負載可能消耗積分
- 測試完成後停止實例

## 🔍 故障排除

### **常見問題：**

#### **1. CPU使用率不夠高**
```bash
# 解決方案：
# - 增加operations數量
# - 減少request interval
# - 增加concurrent requests
```

#### **2. 測試提前結束**
```bash
# 解決方案：
# - 檢查duration設置
# - 確保requests數量足夠
# - 檢查錯誤日誌
```

#### **3. 系統不穩定**
```bash
# 解決方案：
# - 減少concurrent requests
# - 增加request interval
# - 檢查系統資源
```

### **調試命令：**
```bash
# 檢查應用程式狀態
curl http://localhost:3000/health

# 檢查API端點
curl http://localhost:3000/api/db-status

# 查看應用程式日誌
tail -f app.log

# 檢查進程
ps aux | grep node
```

## 📈 性能優化

### **EC2實例優化：**
1. **啟用詳細監控**
2. **設置CloudWatch警報**
3. **使用SSD儲存**
4. **優化網路設置**

### **應用程式優化：**
1. **調整Node.js記憶體限制**
2. **優化資料庫查詢**
3. **使用連接池**
4. **啟用快取**

## 🎯 驗證要求

### **作業要求檢查清單：**
- [ ] CPU使用率 > 80%
- [ ] 持續時間 ≥ 5分鐘
- [ ] 通過API請求觸發
- [ ] 系統穩定運行
- [ ] 測試結果可重現

### **成功指標：**
- **CPU負載**: 80-95%
- **測試時間**: 5-10分鐘
- **成功率**: > 95%
- **響應時間**: < 5秒
- **系統穩定性**: 無錯誤

## 🏆 完成檢查

當你看到以下情況時，說明測試成功：

1. ✅ **CPU使用率穩定在80%以上**
2. ✅ **測試持續5分鐘或更長**
3. ✅ **所有要求檢查都通過**
4. ✅ **系統穩定運行**
5. ✅ **測試腳本正常完成**

恭喜！你已經成功在EC2 t3.micro上完成了CPU stress testing！🎉

---

**這個測試腳本專門為EC2 t3.micro優化，能夠產生足夠的CPU負載來滿足作業要求！**
