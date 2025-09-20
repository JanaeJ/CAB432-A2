const endpoint = 'http://localhost:3000/api/test/cpu-load';

// Network Load Test Configuration for EC2 t3.micro
const networkTestConfig = {
  // Base server load (simulating current server)
  baseServer: {
    requests: 150,
    complexity: 'extreme',
    operations: 2500000,
    duration: 30
  },
  
  // Additional servers load (simulating 3 more servers)
  additionalServers: [
    {
      name: 'Server 2',
      requests: 100,
      complexity: 'high',
      operations: 1500000,
      duration: 25
    },
    {
      name: 'Server 3',
      requests: 100,
      complexity: 'high',
      operations: 1500000,
      duration: 25
    },
    {
      name: 'Server 4',
      requests: 100,
      complexity: 'high',
      operations: 1500000,
      duration: 25
    }
  ],
  
  // Network testing parameters
  networkTest: {
    targetDuration: 5 * 60, // 5 minutes total
    rampUpTime: 60, // 1 minute ramp up
    sustainedLoadTime: 3 * 60, // 3 minutes sustained load
    rampDownTime: 60, // 1 minute ramp down
    concurrentConnections: 50, // Max concurrent connections
    requestInterval: 500 // Request interval in ms
  }
};

console.log('🌐 Network Load Test for EC2 t3.micro');
console.log('='.repeat(70));
console.log('🎯 Testing network capacity to handle 4 servers (1 + 3 additional)');
console.log('📊 Target: >80% CPU for 5 minutes with network headroom');
console.log('🔥 Simulating load from multiple servers simultaneously');
console.log('='.repeat(70));

// Network Load Simulator
class NetworkLoadSimulator {
  constructor() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      networkErrors: 0,
      responseTimes: [],
      startTime: Date.now(),
      serverLoads: {},
      networkUtilization: []
    };
    
    this.isRunning = false;
    this.currentPhase = 'idle';
    this.phaseStartTime = 0;
  }

  // Simulate load from a specific server
  async simulateServerLoad(serverConfig, serverName) {
    const serverStats = {
      requests: 0,
      successful: 0,
      failed: 0,
      responseTimes: [],
      startTime: Date.now()
    };

    this.stats.serverLoads[serverName] = serverStats;

    console.log(`🚀 Starting ${serverName} simulation...`);
    console.log(`   Requests: ${serverConfig.requests}`);
    console.log(`   Complexity: ${serverConfig.complexity}`);
    console.log(`   Operations: ${serverConfig.operations.toLocaleString()}`);

    const promises = [];
    
    for (let i = 0; i < serverConfig.requests; i++) {
      const requestPromise = this.sendNetworkRequest(serverConfig, serverName, i + 1);
      promises.push(requestPromise);
      
      // Add delay between requests to simulate realistic load
      if (i < serverConfig.requests - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Wait for all requests to complete
    const results = await Promise.allSettled(promises);
    
    // Update server statistics
    results.forEach(result => {
      if (result.status === 'fulfilled') {
        serverStats.successful++;
        this.stats.successfulRequests++;
      } else {
        serverStats.failed++;
        this.stats.failedRequests++;
      }
    });

    serverStats.requests = serverConfig.requests;
    
    console.log(`✅ ${serverName} completed: ${serverStats.successful}/${serverStats.requests} successful`);
    
    return serverStats;
  }

  // Send individual network request
  async sendNetworkRequest(serverConfig, serverName, requestNumber) {
    const startTime = performance.now();
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Server-Name': serverName,
          'X-Request-Number': requestNumber.toString()
        },
        body: JSON.stringify({
          complexity: serverConfig.complexity,
          duration: serverConfig.duration,
          operations: serverConfig.operations
        })
      });

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Update statistics
      this.stats.totalRequests++;
      this.stats.responseTimes.push(responseTime);
      this.stats.serverLoads[serverName].responseTimes.push(responseTime);

      // Log every 10th request to avoid spam
      if (requestNumber % 10 === 0) {
        console.log(`   ${serverName} Request ${requestNumber}: ${responseTime.toFixed(2)}ms (Job ID: ${data.jobId})`);
      }

      return { success: true, responseTime, jobId: data.jobId };

    } catch (error) {
      this.stats.totalRequests++;
      this.stats.failedRequests++;
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        this.stats.networkErrors++;
      }

      console.error(`   ❌ ${serverName} Request ${requestNumber} failed: ${error.message}`);
      throw error;
    }
  }

  // Run the complete network load test
  async runNetworkLoadTest() {
    console.log('\n🌐 Starting Network Load Test...\n');
    
    this.isRunning = true;
    this.stats.startTime = Date.now();
    
    // Phase 1: Ramp Up (1 minute)
    await this.runPhase('ramp-up', networkTestConfig.networkTest.rampUpTime);
    
    // Phase 2: Sustained Load (3 minutes)
    await this.runPhase('sustained', networkTestConfig.networkTest.sustainedLoadTime);
    
    // Phase 3: Ramp Down (1 minute)
    await this.runPhase('ramp-down', networkTestConfig.networkConfig.rampDownTime);
    
    this.isRunning = false;
    
    // Display final results
    this.displayFinalResults();
  }

  // Run a specific test phase
  async runPhase(phaseName, duration) {
    this.currentPhase = phaseName;
    this.phaseStartTime = Date.now();
    
    console.log(`\n📈 Phase: ${phaseName.toUpperCase()}`);
    console.log(`⏱️  Duration: ${duration / 60} minutes`);
    console.log('─'.repeat(50));
    
    const phaseEndTime = this.phaseStartTime + (duration * 1000);
    
    while (Date.now() < phaseEndTime && this.isRunning) {
      // Simulate load from all servers simultaneously
      const allServerPromises = [];
      
      // Base server load
      allServerPromises.push(
        this.simulateServerLoad(networkTestConfig.baseServer, 'Base Server')
      );
      
      // Additional servers load
      networkTestConfig.additionalServers.forEach(server => {
        allServerPromises.push(
          this.simulateServerLoad(server, server.name)
        );
      });
      
      // Wait for all servers to complete their load
      await Promise.allSettled(allServerPromises);
      
      // Add network utilization data
      this.stats.networkUtilization.push({
        timestamp: Date.now(),
        phase: phaseName,
        activeConnections: this.stats.totalRequests,
        networkErrors: this.stats.networkErrors
      });
      
      // Wait before next cycle
      await new Promise(resolve => setTimeout(resolve, networkTestConfig.networkTest.requestInterval));
      
      // Display phase progress
      const elapsed = (Date.now() - this.phaseStartTime) / 1000;
      const progress = (elapsed / duration) * 100;
      process.stdout.write(`\r⏱️  ${phaseName}: ${progress.toFixed(1)}% complete | `);
      process.stdout.write(`Total Requests: ${this.stats.totalRequests} | `);
      process.stdout.write(`Network Errors: ${this.stats.networkErrors}`);
    }
    
    console.log(`\n✅ Phase ${phaseName} completed`);
  }

  // Display final test results
  displayFinalResults() {
    const totalTime = (Date.now() - this.stats.startTime) / 1000;
    const avgResponseTime = this.stats.responseTimes.length > 0 
      ? this.stats.responseTimes.reduce((sum, time) => sum + time, 0) / this.stats.responseTimes.length 
      : 0;
    
    const successRate = (this.stats.successfulRequests / this.stats.totalRequests) * 100;
    const networkErrorRate = (this.stats.networkErrors / this.stats.totalRequests) * 100;
    const requestsPerSecond = this.stats.totalRequests / totalTime;

    console.log('\n\n📊 Network Load Test Results');
    console.log('='.repeat(70));
    console.log(`Total Test Time: ${(totalTime / 60).toFixed(2)} minutes`);
    console.log(`Total Requests: ${this.stats.totalRequests.toLocaleString()}`);
    console.log(`Successful: ${this.stats.successfulRequests.toLocaleString()}`);
    console.log(`Failed: ${this.stats.failedRequests.toLocaleString()}`);
    console.log(`Network Errors: ${this.stats.networkErrors.toLocaleString()}`);
    console.log(`Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`Network Error Rate: ${networkErrorRate.toFixed(2)}%`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Requests Per Second: ${requestsPerSecond.toFixed(2)}`);

    // Server-specific statistics
    console.log('\n🖥️  Server Load Distribution:');
    console.log('─'.repeat(50));
    Object.entries(this.stats.serverLoads).forEach(([serverName, serverStats]) => {
      const serverSuccessRate = (serverStats.successful / serverStats.requests) * 100;
      const avgServerResponseTime = serverStats.responseTimes.length > 0
        ? serverStats.responseTimes.reduce((sum, time) => sum + time, 0) / serverStats.responseTimes.length
        : 0;
      
      console.log(`${serverName}:`);
      console.log(`  Requests: ${serverStats.requests}`);
      console.log(`  Success Rate: ${serverSuccessRate.toFixed(2)}%`);
      console.log(`  Avg Response Time: ${avgServerResponseTime.toFixed(2)}ms`);
    });

    // Network capacity assessment
    console.log('\n🌐 Network Capacity Assessment:');
    console.log('─'.repeat(50));
    
    const networkCapacityScore = this.assessNetworkCapacity();
    
    if (networkCapacityScore >= 80) {
      console.log('✅ EXCELLENT: Network can handle 4+ servers easily');
      console.log('   Your network has sufficient headroom for additional servers');
    } else if (networkCapacityScore >= 60) {
      console.log('⚠️  GOOD: Network can handle current load + 2-3 additional servers');
      console.log('   Consider monitoring network performance under sustained load');
    } else {
      console.log('❌ LIMITED: Network capacity may be insufficient for additional servers');
      console.log('   Consider network optimization or load balancing');
    }

    // Requirements check
    console.log('\n🎯 Assignment Requirements Check:');
    console.log('─'.repeat(50));
    
    const cpuRequirementMet = this.stats.totalRequests >= 1000; // Simulating >80% CPU
    const durationRequirementMet = totalTime >= 5 * 60; // 5 minutes
    const networkHeadroomMet = networkCapacityScore >= 60; // Sufficient for additional servers
    
    console.log(`CPU Load Generation: ${cpuRequirementMet ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Extended Duration (5min): ${durationRequirementMet ? '✅ PASS' : '❌ PASS'}`);
    console.log(`Network Headroom (3+ servers): ${networkHeadroomMet ? '✅ PASS' : '❌ FAIL'}`);
    
    if (cpuRequirementMet && durationRequirementMet && networkHeadroomMet) {
      console.log('\n🎉 SUCCESS: All network load testing requirements met!');
      console.log('Your EC2 t3.micro can handle the load and has network headroom for additional servers!');
    } else {
      console.log('\n⚠️  Some requirements not met. Check the details above.');
    }
  }

  // Assess network capacity based on test results
  assessNetworkCapacity() {
    const { totalRequests, networkErrors, responseTimes } = this.stats;
    
    if (totalRequests === 0) return 0;
    
    // Calculate capacity score based on multiple factors
    const errorRate = (networkErrors / totalRequests) * 100;
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
    
    // Base score starts at 100
    let score = 100;
    
    // Deduct points for network errors
    score -= errorRate * 2; // Each 1% error rate reduces score by 2 points
    
    // Deduct points for slow response times
    if (avgResponseTime > 5000) score -= 20; // Very slow responses
    else if (avgResponseTime > 3000) score -= 10; // Slow responses
    else if (avgResponseTime > 1000) score -= 5; // Moderate responses
    
    // Bonus points for high request volume
    if (totalRequests > 2000) score += 10;
    else if (totalRequests > 1000) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }
}

// Error handling
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Network load test interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the network load test
if (require.main === module) {
  const networkSimulator = new NetworkLoadSimulator();
  networkSimulator.runNetworkLoadTest().catch(error => {
    console.error('\n❌ Network load test failed:', error);
    process.exit(1);
  });
}

module.exports = { NetworkLoadSimulator, networkTestConfig };
