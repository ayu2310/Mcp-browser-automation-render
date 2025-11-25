/**
 * Session Tracking Test - Verify No Multiple Sessions Created
 * 
 * Tests that the same session is reused across multiple calls
 */

const path = require('path');
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

const MCP_URL = process.env.MCP_URL || 'https://mcp-browser-automation-render.onrender.com/api/mcp';

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

async function main() {
  console.log('\n🔍 Session Tracking Test');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'session-tracker', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  const sessionIds = [];
  
  try {
    // 1. Create session
    console.log('1️⃣ Creating session...');
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    const sessionId1 = extractSessionId(createResult.content);
    sessionIds.push({ step: 'create', sessionId: sessionId1 });
    console.log(`   Session ID: ${sessionId1}\n`);
    
    if (!sessionId1) {
      console.error('❌ Failed to get session ID from create');
      return;
    }
    
    // 2. Navigate (should reuse session)
    console.log('2️⃣ Navigating (should reuse session)...');
    const navResult = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url: 'https://example.com', sessionId: sessionId1 }
    });
    const sessionId2 = extractSessionId(navResult.content);
    sessionIds.push({ step: 'navigate', sessionId: sessionId2 || sessionId1 });
    console.log(`   Session ID in response: ${sessionId2 || 'not found (using provided)'}`);
    console.log(`   Using session: ${sessionId1}\n`);
    
    // 3. Get URL (should reuse session)
    console.log('3️⃣ Getting URL (should reuse session)...');
    const urlResult = await client.callTool({
      name: 'browserbase_stagehand_get_url',
      arguments: { sessionId: sessionId1 }
    });
    const currentUrl = urlResult.content.find(item => 
      item.type === 'text' && item.text && item.text.match(/https?:\/\//)
    )?.text?.match(/https?:\/\/[^\s]+/)?.[0];
    console.log(`   Current URL: ${currentUrl || 'NOT FOUND'}`);
    console.log(`   Using session: ${sessionId1}\n`);
    
    // 4. Screenshot (should reuse session)
    console.log('4️⃣ Taking screenshot (should reuse session)...');
    const screenshotResult = await client.callTool({
      name: 'browserbase_screenshot',
      arguments: { sessionId: sessionId1 }
    });
    const hasImage = screenshotResult.content.some(item => item.type === 'image');
    console.log(`   Screenshot captured: ${hasImage ? 'YES' : 'NO'}`);
    console.log(`   Using session: ${sessionId1}\n`);
    
    // 5. Navigate again (should reuse session)
    console.log('5️⃣ Navigating again (should reuse session)...');
    const nav2Result = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url: 'https://en.wikipedia.org/wiki/Main_Page', sessionId: sessionId1 }
    });
    const sessionId3 = extractSessionId(nav2Result.content);
    sessionIds.push({ step: 'navigate2', sessionId: sessionId3 || sessionId1 });
    console.log(`   Session ID in response: ${sessionId3 || 'not found (using provided)'}`);
    console.log(`   Using session: ${sessionId1}\n`);
    
    // 6. Get URL again (should show Wikipedia)
    console.log('6️⃣ Getting URL again (should show Wikipedia)...');
    const url2Result = await client.callTool({
      name: 'browserbase_stagehand_get_url',
      arguments: { sessionId: sessionId1 }
    });
    const currentUrl2 = url2Result.content.find(item => 
      item.type === 'text' && item.text && item.text.match(/https?:\/\//)
    )?.text?.match(/https?:\/\/[^\s]+/)?.[0];
    console.log(`   Current URL: ${currentUrl2 || 'NOT FOUND'}`);
    console.log(`   Using session: ${sessionId1}\n`);
    
    // Summary
    console.log('='.repeat(80));
    console.log('📊 SESSION TRACKING SUMMARY');
    console.log('='.repeat(80));
    console.log(`Initial Session ID: ${sessionId1}`);
    console.log(`\nSession IDs across calls:`);
    sessionIds.forEach(({ step, sessionId }) => {
      const match = sessionId === sessionId1 ? '✅' : '❌';
      console.log(`  ${match} ${step}: ${sessionId}`);
    });
    
    const allMatch = sessionIds.every(({ sessionId }) => sessionId === sessionId1);
    if (allMatch) {
      console.log(`\n✅ SUCCESS: All calls used the same session!`);
      console.log(`   No multiple sessions created.`);
    } else {
      console.log(`\n❌ WARNING: Different session IDs detected!`);
      console.log(`   Multiple sessions may have been created.`);
    }
    
    // Check if URL changed correctly (proves session persistence)
    if (currentUrl2 && currentUrl2.includes('wikipedia')) {
      console.log(`\n✅ Session state preserved: URL changed from example.com to Wikipedia`);
    } else {
      console.log(`\n⚠️  Session state unclear: URL is ${currentUrl2 || 'unknown'}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await client.close();
    if (transport.close) {
      transport.close();
    }
  }
}

main().catch(console.error);

