/**
 * Test Observe Response
 * 
 * Tests observe with returnAction:true and shows exactly what it returns
 */

const path = require('path');
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);
const { extractSessionId, extractObservations } = require('./helpers');

const MCP_URL = process.env.MCP_URL || 'https://mcp-browser-automation-render.onrender.com/api/mcp';

async function main() {
  console.log('\n🔍 Testing Observe Response');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'observe-test', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  let sessionId = null;
  
  try {
    // Create session
    console.log('1️⃣ Creating session...');
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    sessionId = extractSessionId(createResult.content);
    console.log(`   Session ID: ${sessionId}\n`);
    
    // Navigate
    const url = 'https://en.wikipedia.org/wiki/World_War_II';
    console.log(`2️⃣ Navigating to ${url}...`);
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url, sessionId }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('   ✅ Navigated\n');
    
    // Test 1: Observe with returnAction:true
    console.log('='.repeat(80));
    console.log('TEST 1: Observe with returnAction:true');
    console.log('='.repeat(80));
    console.log('Instruction: "Find the main heading (h1) on the page"\n');
    
    const observeResult1 = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find the main heading (h1) on the page',
        returnAction: true,
        sessionId
      }
    });
    
    console.log('📋 Full Response:');
    console.log(JSON.stringify(observeResult1.content, null, 2));
    console.log();
    
    const observations1 = extractObservations(observeResult1.content);
    console.log(`📊 Extracted Observations: ${observations1.length}`);
    if (observations1.length > 0) {
      console.log('✅ Observations found:');
      console.log(JSON.stringify(observations1, null, 2));
      console.log('\n📋 Observation Structure:');
      observations1.forEach((obs, idx) => {
        console.log(`   [${idx + 1}]`);
        console.log(`      method: ${obs.method || 'N/A'}`);
        console.log(`      selector: ${obs.selector || 'N/A'}`);
        console.log(`      description: ${obs.description || 'N/A'}`);
        console.log(`      arguments: ${JSON.stringify(obs.arguments || [])}`);
      });
    } else {
      console.log('⚠️  No observations found in response!');
      console.log('   This means observe is not returning action objects.');
    }
    console.log();
    
    // Test 2: Observe with returnAction:false
    console.log('='.repeat(80));
    console.log('TEST 2: Observe with returnAction:false');
    console.log('='.repeat(80));
    console.log('Instruction: "Find the main heading (h1) on the page"\n');
    
    const observeResult2 = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find the main heading (h1) on the page',
        returnAction: false,
        sessionId
      }
    });
    
    console.log('📋 Full Response:');
    console.log(JSON.stringify(observeResult2.content, null, 2));
    console.log();
    
    // Test 3: Try to act with natural language
    console.log('='.repeat(80));
    console.log('TEST 3: Act with Natural Language');
    console.log('='.repeat(80));
    console.log('Action: "Click on the main heading"\n');
    
    const actResult = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Click on the main heading',
        sessionId
      }
    });
    
    console.log('📋 Full Response:');
    console.log(JSON.stringify(actResult.content, null, 2));
    console.log();
    
    const actText = actResult.content[0]?.text || '';
    if (actText.includes('No elements found')) {
      console.log('❌ ERROR: "No elements found to act on"');
      console.log('   This means Stagehand\'s LLM cannot find elements for the action.');
      console.log('   Possible causes:');
      console.log('   1. LLM cannot interpret the action correctly');
      console.log('   2. Page structure not understood by LLM');
      console.log('   3. Action too abstract (like "scroll down")');
    } else if (actText.includes('Error') || actText.includes('Failed')) {
      console.log('❌ Action failed');
      console.log(`   Error: ${actText}`);
    } else {
      console.log('✅ Action completed');
    }
    console.log();
    
    // Test 4: Try to act with observation (if we got one)
    if (observations1.length > 0) {
      console.log('='.repeat(80));
      console.log('TEST 4: Act with Observation (Deterministic)');
      console.log('='.repeat(80));
      console.log('Using observation from TEST 1\n');
      
      const actObsResult = await client.callTool({
        name: 'browserbase_stagehand_act',
        arguments: {
          observation: observations1[0],
          sessionId
        }
      });
      
      console.log('📋 Full Response:');
      console.log(JSON.stringify(actObsResult.content, null, 2));
      console.log();
      
      const actObsText = actObsResult.content[0]?.text || '';
      if (actObsText.includes('Error') || actObsText.includes('Failed')) {
        console.log('❌ Deterministic action failed');
        console.log(`   Error: ${actObsText}`);
      } else {
        console.log('✅ Deterministic action completed');
      }
    }
    
    // Close session
    await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log('\nKey Findings:');
    console.log(`1. Observe with returnAction:true - ${observations1.length > 0 ? '✅ Returns observations' : '❌ No observations'}`);
    console.log(`2. Act with natural language - ${actText.includes('No elements found') ? '❌ Cannot find elements' : '✅ Works'}`);
    console.log(`3. Act with observation - ${observations1.length > 0 ? 'Tested above' : 'N/A (no observations)'}`);
    
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

