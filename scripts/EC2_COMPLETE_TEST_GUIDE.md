# EC2 Complete Testing Guide - CPU + Network Load Testing

## 🎯 目標

這個指南幫助你在EC2 t3.micro實例上完成**完整的作業要求**：

### **CPU Load Testing (2 marks):**
- ✅ **CPU使用率 > 80%**
- ✅ **持續時間 ≥ 5分鐘**
- ✅ **通過API請求觸發**
- ✅ **網路連接有足夠餘裕度負載額外的3個服務器**

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

### 2. 運行測試腳本

```bash
# 在新的終端視窗中運行測試

# 測試1: CPU Stress Test
node scripts/ec2-cpu-stress-test.js

# 測試2: Network Load Test (模擬4個服務器)
node scripts/network-load-test.js

# 測試3: 並行測試 (同時運行多個腳本)
node scripts/ec2-cpu-stress-test.js &
node scripts/network-load-test.js &
node scripts/quick-cpu-test.js &
```

## 📊 測試腳本說明

### **1. `ec2-cpu-stress-test.js` - CPU負載測試**
- **目標**: 產生80%+ CPU使用率
- **持續時間**: 5分鐘
- **並發請求**: 200個
- **複雜度**: extreme
- **操作數**: 3,000,000

### **2. `network-load-test.js` - 網路負載測試**
- **目標**: 測試網路容量，模擬4個服務器
- **持續時間**: 5分鐘 (分階段)
- **服務器模擬**: 1個基礎服務器 + 3個額外服務器
- **總請求數**: 450+ 請求
- **網路評估**: 自動評估網路餘裕度

### **3. 並行測試策略**
- 同時運行多個測試腳本
- 模擬真實的多服務器環境
- 測試系統的整體承載能力

## 🔧 EC2 t3.micro 配置優化

### **實例規格：**
- **vCPU**: 2 (shared)
- **記憶體**: 1 GB
- **網路**: Up to 5 Gbps
- **儲存**: EBS only

### **系統優化：**
```bash
# 安裝監控工具
sudo yum install htop iotop -y

# 設置swap空間
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 優化網路設置
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=65535
```

## 🖥️ 監控和驗證

### **方法1: CloudWatch (推薦)**
```bash
# 在AWS Console中查看CloudWatch
# 選擇你的EC2實例
# 查看CPUUtilization和NetworkIn/Out指標
```

### **方法2: 終端監控**
```bash
# 實時CPU使用率
top -p $(pgrep node)

# 更直觀的監控
htop

# 網路連接數
netstat -an | grep :3000 | wc -l

# 系統負載
uptime
```

### **方法3: 應用程式監控**
```bash
# 健康檢查
curl http://localhost:3000/health

# 資料庫狀態
curl http://localhost:3000/api/db-status

# 查看日誌
tail -f app.log
```

## 📈 測試執行流程

### **階段1: 單一CPU測試**
```bash
# 運行CPU stress test
node scripts/ec2-cpu-stress-test.js

# 預期結果:
# - CPU使用率 > 80%
# - 持續5分鐘
# - 成功率 > 95%
```

### **階段2: 網路容量測試**
```bash
# 運行網路負載測試
node scripts/network-load-test.js

# 預期結果:
# - 模擬4個服務器負載
# - 網路錯誤率 < 5%
# - 響應時間 < 3秒
```

### **階段3: 並行負載測試**
```bash
# 同時運行多個測試
node scripts/ec2-cpu-stress-test.js &
node scripts/network-load-test.js &
node scripts/quick-cpu-test.js &

# 監控整體系統性能
htop
```

## 📊 預期結果

### **成功標準：**

#### **CPU Load Testing:**
- ✅ **CPU使用率**: > 80% (持續5分鐘)
- ✅ **測試時間**: ≥ 5分鐘
- ✅ **成功率**: > 95%
- ✅ **系統穩定**: 無崩潰

#### **Network Load Testing:**
- ✅ **網路容量**: 能處理4個服務器
- ✅ **錯誤率**: < 5%
- ✅ **響應時間**: < 3秒
- ✅ **連接穩定性**: 無連接丟失

### **典型輸出示例：**

```
🌐 Network Load Test for EC2 t3.micro
======================================================================
🎯 Testing network capacity to handle 4 servers (1 + 3 additional)
📊 Target: >80% CPU for 5 minutes with network headroom
🔥 Simulating load from multiple servers simultaneously
======================================================================

📊 Network Load Test Results
======================================================================
Total Test Time: 5.00 minutes
Total Requests: 1,250
Successful: 1,198
Failed: 52
Network Errors: 8
Success Rate: 95.84%
Network Error Rate: 0.64%
Average Response Time: 2,345ms
Requests Per Second: 4.17

🎯 Assignment Requirements Check:
--------------------------------------------------
CPU Load Generation: ✅ PASS
Extended Duration (5min): ✅ PASS
Network Headroom (3+ servers): ✅ PASS

🎉 SUCCESS: All network load testing requirements met!
Your EC2 t3.micro can handle the load and has network headroom for additional servers!
```

## ⚠️ 注意事項

### **1. 資源監控**
- 監控CPU使用率
- 檢查記憶體使用情況
- 觀察網路連接數
- 監控磁碟I/O

### **2. 安全考慮**
- 確保防火牆設置正確
- 只允許必要的端口訪問
- 定期更新安全補丁
- 監控異常連接

### **3. 成本控制**
- t3.micro有CPU積分限制
- 長時間高負載可能消耗積分
- 測試完成後停止實例
- 使用CloudWatch監控成本

## 🔍 故障排除

### **常見問題：**

#### **1. CPU使用率不夠高**
```bash
# 解決方案：
# - 增加operations數量
# - 減少request interval
# - 增加concurrent requests
# - 使用並行測試
```

#### **2. 網路錯誤率高**
```bash
# 解決方案：
# - 檢查防火牆設置
# - 優化網路配置
# - 減少並發連接數
# - 檢查系統資源
```

#### **3. 測試提前結束**
```bash
# 解決方案：
# - 檢查duration設置
# - 確保requests數量足夠
# - 檢查錯誤日誌
# - 驗證API端點
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

# 檢查網路連接
netstat -an | grep :3000

# 檢查系統資源
free -h
df -h
```

## 📈 性能優化

### **EC2實例優化：**
1. **啟用詳細監控**
2. **設置CloudWatch警報**
3. **使用SSD儲存**
4. **優化網路設置**
5. **設置適當的swap空間**

### **應用程式優化：**
1. **調整Node.js記憶體限制**
2. **優化資料庫查詢**
3. **使用連接池**
4. **啟用快取**
5. **優化錯誤處理**

## 🎯 驗證要求

### **作業要求檢查清單：**
- [ ] CPU使用率 > 80%
- [ ] 持續時間 ≥ 5分鐘
- [ ] 通過API請求觸發
- [ ] 網路連接有足夠餘裕度
- [ ] 能負載額外的3個服務器
- [ ] 系統穩定運行
- [ ] 測試結果可重現

### **成功指標：**
- **CPU負載**: 80-95%
- **測試時間**: 5-10分鐘
- **成功率**: > 95%
- **網路錯誤率**: < 5%
- **響應時間**: < 3秒
- **系統穩定性**: 無錯誤

## 🏆 完成檢查

當你看到以下情況時，說明測試成功：

1. ✅ **CPU使用率穩定在80%以上**
2. ✅ **測試持續5分鐘或更長**
3. ✅ **網路能處理4個服務器負載**
4. ✅ **所有要求檢查都通過**
5. ✅ **系統穩定運行**
6. ✅ **測試腳本正常完成**

## 🚀 進階測試

### **負載測試組合：**
```bash
# 創建測試腳本
cat > run-all-tests.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Complete EC2 Load Testing Suite"

# 測試1: CPU Stress Test
echo "📊 Running CPU Stress Test..."
node scripts/ec2-cpu-stress-test.js > cpu-test.log 2>&1 &
CPU_PID=$!

# 等待30秒後開始網路測試
sleep 30

# 測試2: Network Load Test
echo "🌐 Running Network Load Test..."
node scripts/network-load-test.js > network-test.log 2>&1 &
NETWORK_PID=$!

# 等待所有測試完成
wait $CPU_PID $NETWORK_PID

echo "✅ All tests completed!"
echo "📁 Check logs: cpu-test.log, network-test.log"
EOF

chmod +x run-all-tests.sh
./run-all-tests.sh
```

## 📚 相關文檔

- **CPU測試指南**: `scripts/ec2-cpu-stress-test.js`
- **網路測試指南**: `scripts/network-load-test.js`
- **快速測試**: `scripts/quick-cpu-test.js`
- **進階測試**: `scripts/cpu-stress-test-advanced.js`

---

**這個完整的測試套件能夠滿足你的所有作業要求，包括CPU負載測試和網路容量驗證！** 🎉

**在EC2 t3.micro上運行這些測試，你將能夠：**
1. **產生80%+ CPU使用率**
2. **持續5分鐘或更長**
3. **驗證網路有足夠餘裕度**
4. **證明能負載額外的3個服務器**
5. **獲得完整的測試報告和驗證**
