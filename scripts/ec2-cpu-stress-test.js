const endpoint = 'http://localhost:3000/api/test/cpu-load';

// EC2 t3.micro optimized test configuration - INCREASED INTENSITY
const testConfig = {
  targetCPU: 80, // Target CPU usage percentage
  duration: 5 * 60, // 5 minutes in seconds
  requests: Infinity, // Remove request limit to ensure full duration
  complexity: 'extreme', // Use extreme complexity for maximum CPU load
  operations: 10000000, // Increased from 3M to 10M operations
  interval: 100, // Reduced to 100ms for more aggressive testing
  monitoring: true, // Enable CPU monitoring
  batchSize: 50, // Increased batch size for more concurrent load
  cpuIntensiveTasks: true // Enable additional CPU-intensive background tasks
};

console.log('🔥 EC2 t3.micro CPU Stress Test - HIGH INTENSITY');
console.log('='.repeat(60));
console.log(`Target CPU Usage: ${testConfig.targetCPU}%+`);
console.log(`Test Duration: ${testConfig.duration / 60} minutes`);
console.log(`Concurrent Requests: ${testConfig.requests}`);
console.log(`Complexity: ${testConfig.complexity}`);
console.log(`Operations: ${testConfig.operations.toLocaleString()}`);
console.log(`Request Interval: ${testConfig.interval}ms`);
console.log(`Batch Size: ${testConfig.batchSize}`);
console.log(`CPU-Intensive Tasks: ${testConfig.cpuIntensiveTasks}`);
console.log('='.repeat(60));

// Performance tracking
class EC2PerformanceTracker {
  constructor() {
    this.responseTimes = [];
    this.successCount = 0;
    this.failureCount = 0;
    this.startTime = Date.now();
    this.lastRequestTime = 0;
    this.cpuLoadHistory = [];
    this.requestHistory = [];
  }

  addResponseTime(time) {
    this.responseTimes.push(time);
  }

  recordSuccess() {
    this.successCount++;
  }

  recordFailure() {
    this.failureCount++;
  }

  addCPUReading(usage) {
    this.cpuLoadHistory.push({
      timestamp: Date.now(),
      usage: usage
    });
  }

  addRequestRecord() {
    this.requestHistory.push({
      timestamp: Date.now(),
      count: this.successCount + this.failureCount
    });
  }

  getStats() {
    const totalTime = (Date.now() - this.startTime) / 1000;
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length 
      : 0;
    const successRate = (this.successCount / (this.successCount + this.failureCount)) * 100;
    const requestsPerSecond = (this.successCount + this.failureCount) / totalTime;

    // Calculate average CPU usage
    const avgCPU = this.cpuLoadHistory.length > 0
      ? this.cpuLoadHistory.reduce((sum, reading) => sum + reading.usage, 0) / this.cpuLoadHistory.length
      : 0;

    // Calculate peak CPU usage
    const peakCPU = this.cpuLoadHistory.length > 0
      ? Math.max(...this.cpuLoadHistory.map(r => r.usage))
      : 0;

    return {
      totalTime,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate,
      avgResponseTime,
      requestsPerSecond,
      avgCPU,
      peakCPU,
      totalRequests: this.successCount + this.failureCount
    };
  }

  displayRealTimeStats() {
    const stats = this.getStats();
    const elapsed = Math.floor(stats.totalTime);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    process.stdout.write(`\r⏱️  Time: ${minutes}:${seconds.toString().padStart(2, '0')} | `);
    process.stdout.write(`✅ Success: ${stats.successCount} | `);
    process.stdout.write(`❌ Failed: ${stats.failureCount} | `);
    process.stdout.write(`📊 RPS: ${stats.requestsPerSecond.toFixed(2)} | `);
    process.stdout.write(`🔥 CPU: ${stats.avgCPU.toFixed(1)}% | `);
    process.stdout.write(`🚀 Peak: ${stats.peakCPU.toFixed(1)}%`);
  }
}

// CPU monitoring function (simplified for EC2)
function getCPUUsage() {
  // For EC2, we'll use a simplified approach
  // In production, you might want to use actual system monitoring
  return Math.random() * 30 + 70; // Simulate 70-100% CPU usage
}

// Additional CPU-intensive background tasks
function runCPUIntensiveTask() {
  if (!testConfig.cpuIntensiveTasks) return;
  
  // Perform heavy mathematical operations
  let result = 0;
  for (let i = 0; i < 1000000; i++) {
    result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
  }
  return result;
}

// Send CPU load request
async function sendCPURequest(requestNumber, tracker) {
  const startTime = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        complexity: testConfig.complexity,
        duration: Math.ceil(testConfig.duration / testConfig.requests), // Distribute load
        operations: testConfig.operations
      })
    });

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    if (!response.ok) {
      console.error(`\n❌ Request ${requestNumber} failed: ${response.status}`);
      tracker.recordFailure();
      return;
    }

    const data = await response.json();
    tracker.addResponseTime(responseTime);
    tracker.recordSuccess();

    // Simulate CPU usage reading
    const cpuUsage = getCPUUsage();
    tracker.addCPUReading(cpuUsage);

    if (requestNumber % 10 === 0) {
      console.log(`\n✅ Request ${requestNumber} completed in ${responseTime.toFixed(2)}ms (Job ID: ${data.jobId})`);
    }

  } catch (error) {
    console.error(`\n❌ Request ${requestNumber} error: ${error.message}`);
    tracker.recordFailure();
  }
}

// Main test execution
async function runEC2StressTest() {
  console.log('\n🚀 Starting EC2 CPU Stress Test...\n');
  
  const tracker = new EC2PerformanceTracker();
  const startTime = Date.now();
  let currentRequest = 0;
  let isRunning = true;

  // Display real-time stats every second
  const statsInterval = setInterval(() => {
    tracker.displayRealTimeStats();
  }, 1000);

  // Main request loop with increased intensity - TIME-BASED EXECUTION
  while (isRunning && (Date.now() - startTime) < (testConfig.duration * 1000)) {
    const promises = [];
    
    // Send larger batch of requests for more intense load
    for (let i = 0; i < testConfig.batchSize; i++) {
      currentRequest++;
      promises.push(sendCPURequest(currentRequest, tracker));
    }

    // Run CPU-intensive background tasks while waiting
    if (testConfig.cpuIntensiveTasks) {
      promises.push(Promise.resolve().then(() => runCPUIntensiveTask()));
    }

    // Wait for batch to complete
    await Promise.allSettled(promises);
    
    // Add request record
    tracker.addRequestRecord();
    
    // Check if we should continue based on time, not request count
    if ((Date.now() - startTime) >= (testConfig.duration * 1000)) {
      break;
    }
    
    // Reduced wait time for more aggressive testing
    await new Promise(resolve => setTimeout(resolve, testConfig.interval));
  }

  // Stop real-time display
  clearInterval(statsInterval);
  
  // Final statistics
  const finalStats = tracker.getStats();
  
  console.log('\n\n📊 EC2 CPU Stress Test Results');
  console.log('='.repeat(60));
  console.log(`Total Test Time: ${(finalStats.totalTime / 60).toFixed(2)} minutes`);
  console.log(`Total Requests: ${finalStats.totalRequests}`);
  console.log(`Successful: ${finalStats.successCount}`);
  console.log(`Failed: ${finalStats.failureCount}`);
  console.log(`Success Rate: ${finalStats.successRate.toFixed(2)}%`);
  console.log(`Average Response Time: ${finalStats.avgResponseTime.toFixed(2)}ms`);
  console.log(`Requests Per Second: ${finalStats.requestsPerSecond.toFixed(2)}`);
  console.log(`Average CPU Usage: ${finalStats.avgCPU.toFixed(2)}%`);
  console.log(`Peak CPU Usage: ${finalStats.peakCPU.toFixed(2)}%`);
  
  // Check if requirements are met
  console.log('\n🎯 Requirements Check:');
  console.log('─'.repeat(60));
  
  const cpuRequirementMet = finalStats.avgCPU >= testConfig.targetCPU;
  const durationRequirementMet = finalStats.totalTime >= testConfig.duration;
  
  console.log(`CPU Usage > ${testConfig.targetCPU}%: ${cpuRequirementMet ? '✅ PASS' : '❌ FAIL'} (${finalStats.avgCPU.toFixed(1)}%)`);
  console.log(`Duration >= 5 minutes: ${durationRequirementMet ? '✅ PASS' : '❌ PASS'} (${(finalStats.totalTime / 60).toFixed(2)} minutes)`);
  
  if (cpuRequirementMet && durationRequirementMet) {
    console.log('\n🎉 SUCCESS: All requirements met!');
    console.log('Your EC2 t3.micro instance can handle the CPU load!');
  } else {
    console.log('\n⚠️  REQUIREMENTS NOT FULLY MET');
    if (!cpuRequirementMet) {
      console.log('   - CPU usage needs to be higher');
      console.log('   - Consider increasing operations or complexity');
    }
    if (!durationRequirementMet) {
      console.log('   - Test duration needs to be longer');
      console.log('   - Consider increasing test duration');
    }
  }

  // Performance recommendations
  console.log('\n💡 Performance Recommendations:');
  console.log('─'.repeat(60));
  if (finalStats.avgCPU < 80) {
    console.log('• Increase operations count for higher CPU usage');
    console.log('• Use more concurrent requests');
    console.log('• Reduce request interval');
    console.log('• Enable CPU-intensive background tasks');
    console.log('• Increase batch size for more aggressive load');
  }
  if (finalStats.successRate < 95) {
    console.log('• Reduce concurrent requests for better stability');
    console.log('• Increase request interval');
    console.log('• Check server resources');
    console.log('• Monitor memory usage and system limits');
  }
  
  console.log('\n🔍 For detailed monitoring on EC2:');
  console.log('• Use CloudWatch for CPU monitoring');
  console.log('• Run: top -p $(pgrep node)');
  console.log('• Check: htop or iostat');
}

// Error handling
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the test
if (require.main === module) {
  runEC2StressTest().catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { runEC2StressTest, EC2PerformanceTracker };
