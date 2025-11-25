/**
 * Test Client-Side Replay
 * 
 * Demonstrates how to use ReplayManager for deterministic replay
 */

const path = require('path');
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);
const { ReplayManager } = require('./replay-manager');

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
  console.log('\n🎬 Client-Side Replay Test');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'replay-test', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  const replayManager = new ReplayManager();
  
  try {
    // ========================================
    // STEP 1: Record actions
    // ========================================
    console.log('📹 Recording actions...\n');
    
    // Create session
    console.log('1️⃣ Creating session...');
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    const sessionId = extractSessionId(createResult.content);
    replayManager.setSessionId(sessionId);
    console.log(`   Session ID: ${sessionId}\n`);
    
    // Navigate
    const url = 'https://example.com';
    console.log(`2️⃣ Navigating to ${url}...`);
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url, sessionId }
    });
    replayManager.setUrl(url);
    replayManager.trackNavigate(url);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('   ✅ Navigated\n');
    
    // Observe
    console.log('3️⃣ Observing page...');
    const observeResult = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find the main heading on the page',
        returnAction: true,
        sessionId
      }
    });
    replayManager.trackObserve('Find the main heading on the page', true);
    
    const observations = extractObservations(observeResult.content);
    if (observations.length > 0) {
      console.log(`   Found ${observations.length} observation(s)\n`);
      
      // Act with observation (deterministic)
      console.log('4️⃣ Acting with observation (deterministic)...');
      await client.callTool({
        name: 'browserbase_stagehand_act',
        arguments: {
          observation: observations[0],
          sessionId
        }
      });
      replayManager.trackActObservation(observations[0]);
      console.log('   ✅ Action completed\n');
    }
    
    // Act with natural language
    console.log('5️⃣ Acting (natural language)...');
    await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Scroll down a bit',
        sessionId
      }
    });
    replayManager.trackAct('Scroll down a bit');
    console.log('   ✅ Action completed\n');
    
    // Close session
    await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId }
    });
    
    // ========================================
    // STEP 2: Save replay state
    // ========================================
    console.log('💾 Saving replay state...');
    const replayState = replayManager.save();
    console.log(`   Saved ${replayState.length} bytes`);
    console.log(`   Actions recorded: ${replayManager.getState().actions.length}\n`);
    
    // ========================================
    // STEP 3: Replay actions
    // ========================================
    console.log('🔄 Replaying actions...\n');
    
    // Create new session for replay
    const replayResult = await replayManager.replay(client, {
      createNewSession: true,
      delay: 1000,
      onAction: (type, action) => {
        console.log(`   → Executing: ${type}`);
      },
      onError: (error, action, index) => {
        console.error(`   ❌ Error at action ${index + 1}:`, error.message);
        return false; // Stop on error
      }
    });
    
    console.log(`\n✅ Replay completed!`);
    console.log(`   Session ID: ${replayResult.sessionId}`);
    console.log(`   Actions replayed: ${replayResult.actionsReplayed}`);
    
    // Close replay session
    await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId: replayResult.sessionId }
    });
    
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

