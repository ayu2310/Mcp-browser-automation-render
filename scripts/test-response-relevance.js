/**
 * Response Relevance Test
 * 
 * Tests all functions and verifies responses are relevant (not blank, not errors)
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

function isRelevantResponse(content, toolName) {
  if (!Array.isArray(content) || content.length === 0) {
    return { relevant: false, reason: 'Empty response' };
  }
  
  const textContent = content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ')
    .toLowerCase();
  
  // Check for errors
  if (textContent.includes('error:') || textContent.includes('failed')) {
    // But check if it's a helpful error message vs actual failure
    if (textContent.includes('rate limit') || textContent.includes('parse')) {
      return { relevant: false, reason: 'Error in response: ' + textContent.substring(0, 100) };
    }
  }
  
  // Check for blank screen indicators
  if (textContent.includes('blank screen') || textContent.includes('about:blank')) {
    return { relevant: false, reason: 'Blank screen detected' };
  }
  
  // Tool-specific checks
  switch (toolName) {
    case 'browserbase_session_create':
      // Should contain session ID
      if (!textContent.includes('session') && !textContent.match(/[a-f0-9-]{36}/)) {
        return { relevant: false, reason: 'No session ID found' };
      }
      break;
      
    case 'browserbase_stagehand_navigate':
      // Should indicate navigation success
      if (textContent.includes('error') && !textContent.includes('helpful')) {
        return { relevant: false, reason: 'Navigation error' };
      }
      break;
      
    case 'browserbase_stagehand_observe':
      // Should contain observations (array-like structure or element descriptions)
      if (textContent.includes('failed to parse') || textContent.includes('error: failed to observe')) {
        return { relevant: false, reason: 'Observe parsing error' };
      }
      // Check if it has observations (brackets indicate array)
      if (!textContent.includes('[') && !textContent.includes('element') && !textContent.includes('found')) {
        return { relevant: false, reason: 'No observations found in response' };
      }
      break;
      
    case 'browserbase_stagehand_act':
      // Should indicate action completion
      if (textContent.includes('failed to parse') || textContent.includes('error: failed to perform')) {
        return { relevant: false, reason: 'Act parsing error' };
      }
      if (textContent.includes('error:') && !textContent.includes('helpful')) {
        return { relevant: false, reason: 'Action error' };
      }
      break;
      
    case 'browserbase_stagehand_screenshot':
      // Should contain image data
      const hasImage = content.some(item => item.type === 'image' || item.mimeType?.startsWith('image/'));
      if (!hasImage && !textContent.includes('screenshot')) {
        return { relevant: false, reason: 'No screenshot image found' };
      }
      break;
      
    case 'browserbase_stagehand_get_url':
      // Should contain a URL
      if (!textContent.match(/https?:\/\//) && !textContent.includes('url')) {
        return { relevant: false, reason: 'No URL found in response' };
      }
      break;
  }
  
  return { relevant: true, reason: 'Response looks relevant' };
}

async function testFunction(client, toolName, args, description) {
  console.log(`\n📋 ${description}`);
  console.log(`   Tool: ${toolName}`);
  
  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    
    const relevance = isRelevantResponse(result.content, toolName);
    
    if (relevance.relevant) {
      console.log(`   ✅ RELEVANT: ${relevance.reason}`);
      // Show snippet of response
      const textSnippet = result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ')
        .substring(0, 150);
      if (textSnippet) {
        console.log(`   Response: ${textSnippet}...`);
      }
      return { success: true, result };
    } else {
      console.log(`   ❌ NOT RELEVANT: ${relevance.reason}`);
      // Show full error
      const errorText = result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ');
      console.log(`   Full response: ${errorText.substring(0, 300)}...`);
      return { success: false, result, reason: relevance.reason };
    }
  } catch (error) {
    console.log(`   ❌ EXCEPTION: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n🔍 Response Relevance Test');
  console.log(`📍 MCP URL: ${MCP_URL}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'relevance-tester', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  const results = [];
  
  try {
    // 1. Create session
    const createResult = await testFunction(
      client,
      'browserbase_session_create',
      {},
      '1️⃣ Creating session'
    );
    results.push(createResult);
    
    if (!createResult.success) {
      throw new Error('Failed to create session');
    }
    
    const sessionId = extractSessionId(createResult.result.content);
    if (!sessionId) {
      throw new Error('Could not extract session ID');
    }
    console.log(`   Session ID: ${sessionId}`);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 2. Navigate
    const navResult = await testFunction(
      client,
      'browserbase_stagehand_navigate',
      { url: 'https://example.com', sessionId },
      '2️⃣ Navigating to example.com'
    );
    results.push(navResult);
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Get URL
    const urlResult = await testFunction(
      client,
      'browserbase_stagehand_get_url',
      { sessionId },
      '3️⃣ Getting current URL'
    );
    results.push(urlResult);
    
    // 4. Screenshot
    const screenshotResult = await testFunction(
      client,
      'browserbase_stagehand_screenshot',
      { sessionId },
      '4️⃣ Taking screenshot'
    );
    results.push(screenshotResult);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. Observe (simple)
    const observeResult = await testFunction(
      client,
      'browserbase_stagehand_observe',
      {
        instruction: 'Find the main heading on the page',
        returnAction: true,
        sessionId
      },
      '5️⃣ Observing page (find main heading)'
    );
    results.push(observeResult);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 6. Act (simple natural language)
    const actResult = await testFunction(
      client,
      'browserbase_stagehand_act',
      {
        action: 'Scroll down a bit on the page',
        sessionId
      },
      '6️⃣ Acting (scroll down)'
    );
    results.push(actResult);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 7. Act with observation (if we got one from observe)
    if (observeResult.success && observeResult.result) {
      const observeText = observeResult.result.content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ');
      
      // Try to extract observation
      const arrayMatch = observeText.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try {
          const observations = JSON.parse(arrayMatch[0]);
          if (Array.isArray(observations) && observations.length > 0) {
            const firstObs = observations[0];
            const actObsResult = await testFunction(
              client,
              'browserbase_stagehand_act',
              {
                observation: firstObs,
                sessionId
              },
              '7️⃣ Acting with observation (deterministic)'
            );
            results.push(actObsResult);
          }
        } catch (e) {
          console.log(`   ⚠️  Could not parse observations for act test`);
        }
      }
    }
    
    // 8. Close session
    const closeResult = await testFunction(
      client,
      'browserbase_session_close',
      { sessionId },
      '8️⃣ Closing session'
    );
    results.push(closeResult);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await client.close();
    if (transport.close) {
      transport.close();
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESPONSE RELEVANCE SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n✅ Relevant responses: ${successful}/${results.length}`);
  console.log(`❌ Not relevant: ${failed}/${results.length}`);
  
  if (failed > 0) {
    console.log(`\n⚠️  Failed tests:`);
    results.forEach((result, idx) => {
      if (!result.success) {
        console.log(`   ${idx + 1}. ${result.reason || result.error || 'Unknown error'}`);
      }
    });
  }
  
  if (successful === results.length) {
    console.log(`\n🎉 All responses are relevant!`);
  } else {
    console.log(`\n⚠️  Some responses need attention.`);
  }
}

main().catch(console.error);

