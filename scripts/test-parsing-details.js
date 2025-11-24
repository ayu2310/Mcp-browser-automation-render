/**
 * Detailed Parsing Error Investigation
 * 
 * Tests to understand what's happening with parsing errors
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
  console.log('\n🔍 Parsing Error Investigation');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'parsing-investigator', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  try {
    // Create session
    console.log('1️⃣ Creating session...');
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    const sessionId = extractSessionId(createResult.content);
    console.log(`   Session ID: ${sessionId}\n`);
    
    // Navigate to a simple page
    console.log('2️⃣ Navigating to a simple page...');
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url: 'https://example.com', sessionId }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('   ✅ Navigated\n');
    
    // Try a very simple observe
    console.log('3️⃣ Testing OBSERVE with very simple instruction...');
    console.log('   Instruction: "What text is visible on the page?"');
    const observeResult = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'What text is visible on the page?',
        returnAction: false, // Don't return action, just observe
        sessionId
      }
    });
    
    console.log('\n   📋 Full Response:');
    observeResult.content.forEach((item, idx) => {
      if (item.type === 'text') {
        console.log(`   [${idx}] ${item.text}`);
      } else {
        console.log(`   [${idx}] ${item.type}: ${JSON.stringify(item).substring(0, 100)}...`);
      }
    });
    
    // Check if it's an error
    const observeText = observeResult.content[0]?.text || '';
    if (observeText.includes('Error') || observeText.includes('Failed')) {
      console.log('\n   ❌ PARSING ERROR DETECTED');
      console.log('   This means:');
      console.log('   1. Stagehand sent request to Gemini LLM');
      console.log('   2. Gemini returned a response');
      console.log('   3. Stagehand tried to parse the response');
      console.log('   4. Parsing FAILED (malformed JSON, wrong format, truncated, etc.)');
      console.log('   5. Action was NEVER executed');
      console.log('\n   Possible causes:');
      console.log('   - Gemini free tier returning truncated/incomplete responses');
      console.log('   - Gemini returning malformed JSON');
      console.log('   - Gemini rate limits causing incomplete responses');
      console.log('   - Page too complex for LLM to analyze');
    } else {
      console.log('\n   ✅ OBSERVE SUCCESSFUL - No parsing error!');
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try a very simple act
    console.log('\n4️⃣ Testing ACT with very simple action...');
    console.log('   Action: "Wait 1 second"');
    const actResult = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Wait 1 second',
        sessionId
      }
    });
    
    console.log('\n   📋 Full Response:');
    actResult.content.forEach((item, idx) => {
      if (item.type === 'text') {
        console.log(`   [${idx}] ${item.text}`);
      } else {
        console.log(`   [${idx}] ${item.type}: ${JSON.stringify(item).substring(0, 100)}...`);
      }
    });
    
    const actText = actResult.content[0]?.text || '';
    if (actText.includes('Error') || actText.includes('Failed')) {
      console.log('\n   ❌ PARSING ERROR DETECTED');
      console.log('   Same issue as above - action was NOT executed.');
    } else {
      console.log('\n   ✅ ACT SUCCESSFUL - Action was executed!');
    }
    
    // Close session
    await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log('\n"Failed to parse server response" means:');
    console.log('  ❌ The action was NOT executed');
    console.log('  ❌ Stagehand could not parse Gemini\'s response');
    console.log('  ❌ This happens BEFORE execution, not during');
    console.log('\nThis is likely a Gemini API issue (free tier limitations)');
    console.log('or Stagehand expecting a different response format.');
    
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

