/**
 * Detailed Error Analysis Test
 * 
 * Tests observe and act functions to see actual error messages
 * and check if it's rate limits or parsing issues
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

function analyzeError(content) {
  const errorText = content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ')
    .toLowerCase();
  
  const analysis = {
    hasError: false,
    errorType: null,
    isRateLimit: false,
    isParsingError: false,
    isTimeout: false,
    errorMessage: null,
  };
  
  if (errorText.includes('error')) {
    analysis.hasError = true;
    
    // Check for rate limit indicators
    if (errorText.includes('rate limit') || 
        errorText.includes('quota') || 
        errorText.includes('429') ||
        errorText.includes('too many requests')) {
      analysis.isRateLimit = true;
      analysis.errorType = 'rate_limit';
    }
    
    // Check for parsing errors
    if (errorText.includes('parse') || 
        errorText.includes('invalid json') ||
        errorText.includes('malformed')) {
      analysis.isParsingError = true;
      analysis.errorType = 'parsing';
    }
    
    // Check for timeout
    if (errorText.includes('timeout') || 
        errorText.includes('timed out') ||
        errorText.includes('exceeded')) {
      analysis.isTimeout = true;
      analysis.errorType = 'timeout';
    }
    
    // Extract full error message
    const errorMatch = content.find(item => 
      item.type === 'text' && item.text && item.text.toLowerCase().includes('error')
    );
    if (errorMatch) {
      analysis.errorMessage = errorMatch.text;
    }
  }
  
  return analysis;
}

async function main() {
  console.log('\n🔍 Detailed Error Analysis Test');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'error-analyzer', version: '1.0.0' });
  
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
    console.log(`   Session ID: ${sessionId}\n`);
    
    if (!sessionId) {
      throw new Error('Failed to create session');
    }
    
    // 2. Navigate to a simple page
    console.log('2️⃣ Navigating to example.com...');
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url: 'https://example.com', sessionId }
    });
    console.log('   ✅ Navigation completed\n');
    
    // Wait a bit for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Test Observe with simple instruction
    console.log('3️⃣ Testing OBSERVE (simple instruction)...');
    console.log('   Instruction: "Find the main heading on the page"');
    const observeResult = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find the main heading on the page',
        returnAction: true,
        sessionId
      }
    });
    
    const observeError = analyzeError(observeResult.content);
    console.log(`   Response: ${observeError.hasError ? '❌ ERROR' : '✅ SUCCESS'}`);
    if (observeError.hasError) {
      console.log(`   Error Type: ${observeError.errorType || 'unknown'}`);
      console.log(`   Is Rate Limit: ${observeError.isRateLimit ? 'YES ⚠️' : 'NO'}`);
      console.log(`   Is Parsing Error: ${observeError.isParsingError ? 'YES' : 'NO'}`);
      console.log(`   Is Timeout: ${observeError.isTimeout ? 'YES' : 'NO'}`);
      if (observeError.errorMessage) {
        console.log(`   Error Message: ${observeError.errorMessage.substring(0, 200)}...`);
      }
      
      // Show full response for debugging
      console.log(`   Full Response:`);
      observeResult.content.forEach((item, idx) => {
        if (item.type === 'text') {
          const text = item.text.substring(0, 300);
          console.log(`     [${idx}] ${text}${item.text.length > 300 ? '...' : ''}`);
        }
      });
    } else {
      // Check if observations were returned
      const hasObservations = observeResult.content.some(item => 
        item.type === 'text' && item.text && item.text.includes('[') && item.text.includes(']')
      );
      console.log(`   Observations returned: ${hasObservations ? 'YES' : 'NO'}`);
    }
    console.log();
    
    // 4. Test Act with simple action
    console.log('4️⃣ Testing ACT (simple natural language action)...');
    console.log('   Action: "Take a screenshot of the page"');
    const actResult = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Take a screenshot of the page',
        sessionId
      }
    });
    
    const actError = analyzeError(actResult.content);
    console.log(`   Response: ${actError.hasError ? '❌ ERROR' : '✅ SUCCESS'}`);
    if (actError.hasError) {
      console.log(`   Error Type: ${actError.errorType || 'unknown'}`);
      console.log(`   Is Rate Limit: ${actError.isRateLimit ? 'YES ⚠️' : 'NO'}`);
      console.log(`   Is Parsing Error: ${actError.isParsingError ? 'YES' : 'NO'}`);
      console.log(`   Is Timeout: ${actError.isTimeout ? 'YES' : 'NO'}`);
      if (actError.errorMessage) {
        console.log(`   Error Message: ${actError.errorMessage.substring(0, 200)}...`);
      }
      
      // Show full response for debugging
      console.log(`   Full Response:`);
      actResult.content.forEach((item, idx) => {
        if (item.type === 'text') {
          const text = item.text.substring(0, 300);
          console.log(`     [${idx}] ${text}${item.text.length > 300 ? '...' : ''}`);
        }
      });
    } else {
      console.log(`   Action completed successfully`);
    }
    console.log();
    
    // 5. Test Act with even simpler action
    console.log('5️⃣ Testing ACT (very simple action)...');
    console.log('   Action: "Click anywhere on the page"');
    const act2Result = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Click anywhere on the page',
        sessionId
      }
    });
    
    const act2Error = analyzeError(act2Result.content);
    console.log(`   Response: ${act2Error.hasError ? '❌ ERROR' : '✅ SUCCESS'}`);
    if (act2Error.hasError) {
      console.log(`   Error Type: ${act2Error.errorType || 'unknown'}`);
      console.log(`   Is Rate Limit: ${act2Error.isRateLimit ? 'YES ⚠️' : 'NO'}`);
      console.log(`   Is Parsing Error: ${act2Error.isParsingError ? 'YES' : 'NO'}`);
      if (act2Error.errorMessage) {
        console.log(`   Error Message: ${act2Error.errorMessage.substring(0, 200)}...`);
      }
    } else {
      console.log(`   Action completed successfully`);
    }
    console.log();
    
    // Summary
    console.log('='.repeat(80));
    console.log('📊 ERROR ANALYSIS SUMMARY');
    console.log('='.repeat(80));
    
    const errors = [observeError, actError, act2Error].filter(e => e.hasError);
    const rateLimits = errors.filter(e => e.isRateLimit);
    const parsingErrors = errors.filter(e => e.isParsingError);
    
    if (rateLimits.length > 0) {
      console.log(`\n⚠️  RATE LIMIT DETECTED: ${rateLimits.length} error(s) appear to be rate limits`);
      console.log(`   This is likely due to Gemini free tier limits.`);
      console.log(`   Solutions:`);
      console.log(`   1. Wait between requests (add delays)`);
      console.log(`   2. Upgrade Gemini API tier`);
      console.log(`   3. Use a different model (if available)`);
    } else if (parsingErrors.length > 0) {
      console.log(`\n⚠️  PARSING ERRORS: ${parsingErrors.length} error(s) are parsing issues`);
      console.log(`   This suggests Stagehand's LLM returned invalid JSON.`);
      console.log(`   Possible causes:`);
      console.log(`   1. LLM response format changed`);
      console.log(`   2. Page state is unexpected`);
      console.log(`   3. LLM timeout/truncation`);
    } else if (errors.length === 0) {
      console.log(`\n✅ NO ERRORS: All functions working correctly!`);
    } else {
      console.log(`\n⚠️  OTHER ERRORS: ${errors.length} error(s) detected`);
      console.log(`   Check error messages above for details.`);
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

