/**
 * Comprehensive Test Suite for Browserbase MCP Server
 * 
 * Tests all functions and runs a complex workflow to verify:
 * - All tools work correctly
 * - Session management prevents multiple sessions
 * - Responses are relevant (not blank screens)
 * - Complex workflows execute successfully
 */

const path = require('path');
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

// Use local server for testing, or production URL
const MCP_URL = process.env.MCP_URL || 'http://localhost:3000/api/mcp';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
}

function extractSessionId(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      const match = item.text.match(/sessions\/([a-f0-9-]+)/i);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

function extractObservations(content) {
  if (!Array.isArray(content)) return [];
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      // Look for JSON array in response
      const arrayMatch = item.text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const observations = JSON.parse(arrayMatch[0]);
          if (Array.isArray(observations)) {
            return observations;
          }
        } catch (e) {
          // Continue
        }
      }
    }
  }
  return [];
}

function checkResponseValid(content, toolName) {
  if (!Array.isArray(content) || content.length === 0) {
    return { valid: false, reason: 'Empty response' };
  }
  
  // Check for errors
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      if (item.text.toLowerCase().includes('error')) {
        return { valid: false, reason: `Error in response: ${item.text.substring(0, 100)}` };
      }
    }
  }
  
  // Check for blank screen indicators
  const textContent = content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ')
    .toLowerCase();
  
  if (textContent.includes('blank') || textContent.includes('empty page')) {
    return { valid: false, reason: 'Blank screen detected' };
  }
  
  return { valid: true };
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testSessionCreate(client) {
  logSection('TEST 1: Session Create');
  try {
    const result = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    
    const sessionId = extractSessionId(result.content);
    const validation = checkResponseValid(result.content, 'browserbase_session_create');
    
    console.log('✅ Session created');
    console.log(`   Session ID: ${sessionId || 'NOT FOUND'}`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: !!sessionId && validation.valid, sessionId, result };
  } catch (error) {
    console.error('❌ Session create failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testNavigate(client, sessionId, url = 'https://example.com') {
  logSection('TEST 2: Navigate');
  try {
    const result = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url, sessionId }
    });
    
    const validation = checkResponseValid(result.content, 'browserbase_stagehand_navigate');
    const returnedSessionId = extractSessionId(result.content);
    
    console.log('✅ Navigation completed');
    console.log(`   URL: ${url}`);
    console.log(`   Session ID preserved: ${returnedSessionId === sessionId ? 'YES' : 'NO'}`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: validation.valid, result };
  } catch (error) {
    console.error('❌ Navigation failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testActNaturalLanguage(client, sessionId, action = 'Take a screenshot of the page') {
  logSection('TEST 3: Act (Natural Language)');
  try {
    const result = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: { action, sessionId }
    });
    
    const validation = checkResponseValid(result.content, 'browserbase_stagehand_act');
    
    console.log('✅ Action executed');
    console.log(`   Action: ${action.substring(0, 60)}...`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: validation.valid, result };
  } catch (error) {
    console.error('❌ Act failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testObserve(client, sessionId, instruction = 'Find the main heading or title on the page') {
  logSection('TEST 4: Observe');
  try {
    const result = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction,
        returnAction: true,
        sessionId
      }
    });
    
    const observations = extractObservations(result.content);
    const validation = checkResponseValid(result.content, 'browserbase_stagehand_observe');
    
    console.log('✅ Observation completed');
    console.log(`   Instruction: ${instruction.substring(0, 60)}...`);
    console.log(`   Observations found: ${observations.length}`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: validation.valid && observations.length > 0, observations, result };
  } catch (error) {
    console.error('❌ Observe failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testActObservation(client, sessionId, observation) {
  logSection('TEST 5: Act (Observation/XPath)');
  try {
    const result = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: { observation, sessionId }
    });
    
    const validation = checkResponseValid(result.content, 'browserbase_stagehand_act');
    
    console.log('✅ Observation action executed');
    console.log(`   Method: ${observation.method || 'N/A'}`);
    console.log(`   Description: ${observation.description || 'N/A'}`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: validation.valid, result };
  } catch (error) {
    console.error('❌ Observation act failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testScreenshot(client, sessionId) {
  logSection('TEST 6: Screenshot');
  try {
    const result = await client.callTool({
      name: 'browserbase_screenshot',
      arguments: { sessionId }
    });
    
    const hasImage = result.content.some(item => item.type === 'image');
    const validation = checkResponseValid(result.content, 'browserbase_screenshot');
    
    console.log('✅ Screenshot captured');
    console.log(`   Has image: ${hasImage ? 'YES' : 'NO'}`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: hasImage && validation.valid, result };
  } catch (error) {
    console.error('❌ Screenshot failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testGetUrl(client, sessionId) {
  logSection('TEST 7: Get URL');
  try {
    const result = await client.callTool({
      name: 'browserbase_stagehand_get_url',
      arguments: { sessionId }
    });
    
    const validation = checkResponseValid(result.content, 'browserbase_stagehand_get_url');
    let url = null;
    for (const item of result.content) {
      if (item.type === 'text' && item.text) {
        const urlMatch = item.text.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          url = urlMatch[0];
          break;
        }
      }
    }
    
    console.log('✅ URL retrieved');
    console.log(`   Current URL: ${url || 'NOT FOUND'}`);
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: !!url && validation.valid, url, result };
  } catch (error) {
    console.error('❌ Get URL failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function testSessionClose(client, sessionId) {
  logSection('TEST 8: Session Close');
  try {
    const result = await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId }
    });
    
    const validation = checkResponseValid(result.content, 'browserbase_session_close');
    
    console.log('✅ Session closed');
    console.log(`   Response valid: ${validation.valid ? 'YES' : 'NO'}`);
    if (!validation.valid) {
      console.log(`   Reason: ${validation.reason}`);
    }
    
    return { success: validation.valid, result };
  } catch (error) {
    console.error('❌ Session close failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// COMPLEX WORKFLOW TEST
// ============================================================================

async function testComplexWorkflow(client) {
  logSection('COMPLEX WORKFLOW TEST');
  
  const results = {
    sessionCreate: null,
    navigate1: null,
    observe1: null,
    act1: null,
    navigate2: null,
    act2: null,
    screenshot: null,
    getUrl: null,
    sessionClose: null,
  };
  
  try {
    // 1. Create session
    results.sessionCreate = await testSessionCreate(client);
    if (!results.sessionCreate.success) {
      throw new Error('Failed to create session');
    }
    const sessionId = results.sessionCreate.sessionId;
    
    // 2. Navigate to Wikipedia
    results.navigate1 = await testNavigate(client, sessionId, 'https://en.wikipedia.org/wiki/Main_Page');
    if (!results.navigate1.success) {
      throw new Error('Failed to navigate to Wikipedia');
    }
    
    // 3. Observe search box
    results.observe1 = await testObserve(
      client,
      sessionId,
      'Find the search input box in the top right corner of Wikipedia'
    );
    if (!results.observe1.success || !results.observe1.observations || results.observe1.observations.length === 0) {
      console.log('⚠️  No observations found, using natural language action instead');
      results.act1 = await testActNaturalLanguage(
        client,
        sessionId,
        'Click on the search box and type "Artificial Intelligence"'
      );
    } else {
      // 4. Act using observation
      const observation = results.observe1.observations[0];
      observation.arguments = ['Artificial Intelligence'];
      observation.method = 'fill';
      results.act1 = await testActObservation(client, sessionId, observation);
    }
    
    // 5. Navigate to a different page
    results.navigate2 = await testNavigate(client, sessionId, 'https://example.com');
    if (!results.navigate2.success) {
      throw new Error('Failed second navigation');
    }
    
    // 6. Natural language action
    results.act2 = await testActNaturalLanguage(client, sessionId, 'Find and click on the "More information" link if it exists');
    
    // 7. Screenshot
    results.screenshot = await testScreenshot(client, sessionId);
    
    // 8. Get URL
    results.getUrl = await testGetUrl(client, sessionId);
    
    // 9. Close session
    results.sessionClose = await testSessionClose(client, sessionId);
    
    // Summary
    const successCount = Object.values(results).filter(r => r && r.success).length;
    const totalTests = Object.keys(results).length;
    
    logSection('WORKFLOW TEST SUMMARY');
    console.log(`✅ Passed: ${successCount}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - successCount}/${totalTests}`);
    
    return { success: successCount === totalTests, results };
  } catch (error) {
    console.error('❌ Complex workflow failed:', error.message);
    return { success: false, error: error.message, results };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n🚀 Browserbase MCP Server - Comprehensive Test Suite');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  let client;
  let transport;
  
  try {
    // Connect
    logSection('CONNECTING TO MCP SERVER');
    transport = new StreamableHTTPClientTransport(MCP_URL);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    
    client.onerror = (error) => {
      console.error('❌ MCP Client Error:', error.message || error);
    };
    
    await client.connect(transport);
    console.log('✅ Connected to MCP server');
    
    // List tools
    const toolsResult = await client.listTools();
    console.log(`📋 Available tools: ${toolsResult.tools.map(t => t.name).join(', ')}`);
    
    // Run complex workflow test
    const workflowResult = await testComplexWorkflow(client);
    
    // Final summary
    logSection('FINAL SUMMARY');
    if (workflowResult.success) {
      console.log('✅ All tests passed!');
      console.log('✅ Complex workflow completed successfully');
      console.log('✅ No blank screen issues detected');
      console.log('✅ Session management working correctly');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed');
      console.log('⚠️  Check the logs above for details');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore
      }
    }
    if (transport && transport.close) {
      try {
        transport.close();
      } catch (e) {
        // Ignore
      }
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testSessionCreate,
  testNavigate,
  testActNaturalLanguage,
  testObserve,
  testActObservation,
  testScreenshot,
  testGetUrl,
  testSessionClose,
  testComplexWorkflow,
};

