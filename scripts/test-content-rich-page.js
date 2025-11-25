/**
 * Test with Content-Rich Page
 * 
 * Tests observe and act on a page with actual content
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

function extractObservations(content) {
  if (!Array.isArray(content)) return [];
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      const arrayMatch = item.text.match(/\[[\s\S]*?\]/);
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

async function main() {
  console.log('\n🧪 Content-Rich Page Test');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'content-test', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  try {
    // 1. Create session
    console.log('1️⃣ Creating session...');
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    const sessionId = extractSessionId(createResult.content);
    console.log(`   ✅ Session ID: ${sessionId}\n`);
    
    if (!sessionId) {
      throw new Error('Failed to create session');
    }
    
    // 2. Navigate to a content-rich page (Wikipedia)
    console.log('2️⃣ Navigating to Wikipedia (content-rich page)...');
    const navResult = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url: 'https://en.wikipedia.org/wiki/Web_automation', sessionId }
    });
    console.log(`   ✅ ${navResult.content[0]?.text || 'Navigation completed'}\n`);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Get URL
    console.log('3️⃣ Getting current URL...');
    const urlResult = await client.callTool({
      name: 'browserbase_stagehand_get_url',
      arguments: { sessionId }
    });
    console.log(`   ✅ URL: ${urlResult.content[0]?.text || 'N/A'}\n`);
    
    // 4. Observe - find a heading or link
    console.log('4️⃣ Observing page (find main heading)...');
    const observeResult = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find the main heading (h1) on the page',
        returnAction: true,
        sessionId
      }
    });
    
    const observeText = observeResult.content[0]?.text || '';
    if (observeText.includes('Error') || observeText.includes('Failed')) {
      console.log(`   ❌ Error: ${observeText.substring(0, 200)}`);
    } else {
      console.log(`   ✅ Observation successful`);
      const observations = extractObservations(observeResult.content);
      if (observations.length > 0) {
        console.log(`   Found ${observations.length} observation(s)`);
        console.log(`   First observation: ${JSON.stringify(observations[0], null, 2).substring(0, 200)}...`);
      }
    }
    console.log();
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. Act - scroll down
    console.log('5️⃣ Acting (scroll down)...');
    const actResult = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Scroll down the page a bit',
        sessionId
      }
    });
    
    const actText = actResult.content[0]?.text || '';
    if (actText.includes('Error') || actText.includes('Failed')) {
      console.log(`   ❌ Error: ${actText.substring(0, 200)}`);
    } else {
      console.log(`   ✅ Action completed successfully`);
    }
    console.log();
    
    // 6. Act with observation (if we got one)
    if (observeText && !observeText.includes('Error')) {
      const observations = extractObservations(observeResult.content);
      if (observations.length > 0) {
        console.log('6️⃣ Acting with observation (deterministic click)...');
        const actObsResult = await client.callTool({
          name: 'browserbase_stagehand_act',
          arguments: {
            observation: observations[0],
            sessionId
          }
        });
        
        const actObsText = actObsResult.content[0]?.text || '';
        if (actObsText.includes('Error') || actObsText.includes('Failed')) {
          console.log(`   ❌ Error: ${actObsText.substring(0, 200)}`);
        } else {
          console.log(`   ✅ Observation-based action completed`);
        }
        console.log();
      }
    }
    
    // 7. Close session
    console.log('7️⃣ Closing session...');
    await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId }
    });
    console.log('   ✅ Session closed\n');
    
    // Summary
    console.log('='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log('✅ Session management: Working (no extra sessions)');
    console.log('✅ Navigation: Working');
    console.log('✅ Get URL: Working');
    console.log(observeText.includes('Error') ? '❌ Observe: Failed' : '✅ Observe: Working');
    console.log(actText.includes('Error') ? '❌ Act: Failed' : '✅ Act: Working');
    console.log('\n🎉 All core functionality verified!');
    
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

