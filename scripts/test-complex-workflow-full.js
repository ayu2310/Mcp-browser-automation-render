/**
 * Comprehensive Complex Workflow Test
 * 
 * Tests complex task with screenshots at each step, extract, and response validation
 */

const path = require('path');
const fs = require('fs');
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

const MCP_URL = process.env.MCP_URL || 'https://mcp-browser-automation-render.onrender.com/api/mcp';

// Create screenshots directory
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
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

function extractJsonData(content) {
  if (!Array.isArray(content)) return null;
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      // Try to find JSON object
      const jsonMatch = item.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Continue
        }
      }
    }
  }
  return null;
}

function saveScreenshot(content, stepName) {
  const imageItem = content.find(item => 
    item.type === 'image' || 
    (item.mimeType && item.mimeType.startsWith('image/')) ||
    (item.data && typeof item.data === 'string' && item.data.startsWith('data:image'))
  );
  
  if (imageItem) {
    let imageData = null;
    let extension = 'png';
    
    if (imageItem.data) {
      // Base64 data URL
      const match = imageItem.data.match(/data:image\/(\w+);base64,(.+)/);
      if (match) {
        extension = match[1];
        imageData = Buffer.from(match[2], 'base64');
      }
    } else if (imageItem.mimeType) {
      extension = imageItem.mimeType.split('/')[1] || 'png';
      // Handle base64 in text if present
      const textItem = content.find(item => item.type === 'text' && item.text);
      if (textItem && textItem.text.includes('base64')) {
        const match = textItem.text.match(/base64,(.+)/);
        if (match) {
          imageData = Buffer.from(match[1], 'base64');
        }
      }
    }
    
    if (imageData) {
      const filename = `${stepName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${extension}`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);
      fs.writeFileSync(filepath, imageData);
      return filepath;
    }
  }
  
  return null;
}

function checkResponseValid(content, toolName, stepName) {
  if (!Array.isArray(content) || content.length === 0) {
    return { valid: false, reason: 'Empty response' };
  }
  
  const textContent = content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ')
    .toLowerCase();
  
  // Check for errors
  if (textContent.includes('error:') && !textContent.includes('helpful')) {
    if (textContent.includes('failed to parse')) {
      return { valid: false, reason: 'Parsing error - API key or LLM issue' };
    }
    if (textContent.includes('rate limit') || textContent.includes('403') || textContent.includes('leaked')) {
      return { valid: false, reason: 'API key issue - check Gemini API key' };
    }
    return { valid: false, reason: 'Error in response: ' + textContent.substring(0, 100) };
  }
  
  // Tool-specific validation
  switch (toolName) {
    case 'browserbase_stagehand_screenshot':
      const hasImage = content.some(item => 
        item.type === 'image' || 
        (item.mimeType && item.mimeType.startsWith('image/')) ||
        (item.data && typeof item.data === 'string' && item.data.startsWith('data:image'))
      );
      if (!hasImage) {
        return { valid: false, reason: 'No screenshot image found' };
      }
      break;
      
    case 'browserbase_stagehand_extract':
      const hasJson = extractJsonData(content) !== null;
      if (!hasJson && !textContent.includes('json') && !textContent.includes('extract')) {
        return { valid: false, reason: 'No extracted data found' };
      }
      break;
      
    case 'browserbase_stagehand_observe':
      if (textContent.includes('failed to observe') || textContent.includes('failed to parse')) {
        return { valid: false, reason: 'Observe failed' };
      }
      break;
      
    case 'browserbase_stagehand_act':
      if (textContent.includes('failed to perform') || textContent.includes('failed to parse')) {
        return { valid: false, reason: 'Act failed' };
      }
      break;
  }
  
  return { valid: true, reason: 'Response looks valid' };
}

async function takeScreenshot(client, sessionId, stepName) {
  console.log(`   📸 Taking screenshot: ${stepName}...`);
  
  try {
    // Try browserbase_screenshot
    let result = await client.callTool({
      name: 'browserbase_screenshot',
      arguments: { sessionId }
    });
    
    // Check for image in response
    let imageData = null;
    let extension = 'png';
    
    // Method 1: Check for image type item
    const imageItem = result.content.find(item => 
      item.type === 'image' || 
      (item.mimeType && item.mimeType.startsWith('image/'))
    );
    
    if (imageItem) {
      if (imageItem.data) {
        imageData = Buffer.from(imageItem.data, 'base64');
        extension = imageItem.mimeType ? imageItem.mimeType.split('/')[1] : 'png';
      }
    }
    
    // Method 2: Check text content for base64 image
    if (!imageData) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          // Check for data URL format
          const dataUrlMatch = item.text.match(/data:image\/(\w+);base64,([A-Za-z0-9+/=\s]+)/);
          if (dataUrlMatch) {
            extension = dataUrlMatch[1];
            imageData = Buffer.from(dataUrlMatch[2].replace(/\s/g, ''), 'base64');
            break;
          }
          
          // Check if entire text is base64 (PNG or JPEG)
          const trimmedText = item.text.trim().replace(/\s/g, '');
          if (trimmedText.length > 100 && /^[A-Za-z0-9+/=]+$/.test(trimmedText)) {
            if (trimmedText.startsWith('iVBORw0KGgo')) {
              // PNG
              imageData = Buffer.from(trimmedText, 'base64');
              extension = 'png';
              break;
            } else if (trimmedText.startsWith('/9j/')) {
              // JPEG
              imageData = Buffer.from(trimmedText, 'base64');
              extension = 'jpg';
              break;
            }
          }
        }
      }
    }
    
    if (imageData) {
      const filename = `${stepName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${extension}`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);
      fs.writeFileSync(filepath, imageData);
      console.log(`   ✅ Screenshot saved: ${path.basename(filepath)}`);
      return filepath;
    } else {
      // Log response for debugging
      console.log(`   ⚠️  Could not extract screenshot data`);
      console.log(`   Response types: ${result.content.map(item => item.type).join(', ')}`);
      if (result.content.some(item => item.type === 'text')) {
        const textContent = result.content.find(item => item.type === 'text')?.text || '';
        console.log(`   Text preview: ${textContent.substring(0, 100)}...`);
      }
      return null;
    }
  } catch (error) {
    console.log(`   ⚠️  Screenshot failed: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('\n🧪 Comprehensive Complex Workflow Test');
  console.log(`📍 MCP URL: ${MCP_URL}`);
  console.log(`📁 Screenshots: ${SCREENSHOTS_DIR}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'complex-workflow-test', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    screenshots: []
  };
  
  let sessionId = null;
  
  try {
    // ========================================
    // STEP 1: Create Session
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 1: Creating Session');
    console.log('='.repeat(80));
    
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    
    sessionId = extractSessionId(createResult.content);
    const validation = checkResponseValid(createResult.content, 'browserbase_session_create', 'Create Session');
    
    if (validation.valid && sessionId) {
      console.log(`✅ Session created: ${sessionId}`);
      results.passed++;
    } else {
      console.log(`❌ Failed: ${validation.reason}`);
      results.failed++;
      throw new Error('Failed to create session');
    }
    console.log();
    
    // ========================================
    // STEP 2: Navigate to Content-Rich Page
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 2: Navigating to Wikipedia');
    console.log('='.repeat(80));
    
    const targetUrl = 'https://en.wikipedia.org/wiki/Web_automation';
    const navResult = await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url: targetUrl, sessionId }
    });
    
    const navValidation = checkResponseValid(navResult.content, 'browserbase_stagehand_navigate', 'Navigate');
    if (navValidation.valid) {
      console.log(`✅ Navigated to: ${targetUrl}`);
      results.passed++;
    } else {
      console.log(`❌ Navigation failed: ${navValidation.reason}`);
      results.failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Screenshot after navigation
    const screenshot1 = await takeScreenshot(client, sessionId, '01-after-navigation');
    if (screenshot1) results.screenshots.push(screenshot1);
    console.log();
    
    // ========================================
    // STEP 3: Get Current URL
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 3: Getting Current URL');
    console.log('='.repeat(80));
    
    const urlResult = await client.callTool({
      name: 'browserbase_stagehand_get_url',
      arguments: { sessionId }
    });
    
    const urlValidation = checkResponseValid(urlResult.content, 'browserbase_stagehand_get_url', 'Get URL');
    if (urlValidation.valid) {
      const currentUrl = urlResult.content.find(item => item.type === 'text')?.text || 'N/A';
      console.log(`✅ Current URL: ${currentUrl}`);
      results.passed++;
    } else {
      console.log(`❌ Get URL failed: ${urlValidation.reason}`);
      results.failed++;
    }
    console.log();
    
    // ========================================
    // STEP 4: Observe - Find Main Heading
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 4: Observing Page (Find Main Heading)');
    console.log('='.repeat(80));
    
    const observeResult = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find the main heading (h1) on the page',
        returnAction: true,
        sessionId
      }
    });
    
    const observeValidation = checkResponseValid(observeResult.content, 'browserbase_stagehand_observe', 'Observe');
    if (observeValidation.valid) {
      const observations = extractObservations(observeResult.content);
      console.log(`✅ Observation successful`);
      if (observations.length > 0) {
        console.log(`   Found ${observations.length} observation(s)`);
        console.log(`   First: ${JSON.stringify(observations[0]).substring(0, 150)}...`);
      }
      results.passed++;
    } else {
      console.log(`❌ Observe failed: ${observeValidation.reason}`);
      results.failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Screenshot after observe
    const screenshot2 = await takeScreenshot(client, sessionId, '02-after-observe');
    if (screenshot2) results.screenshots.push(screenshot2);
    console.log();
    
    // ========================================
    // STEP 5: Act - Scroll Down
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 5: Acting (Scroll Down)');
    console.log('='.repeat(80));
    
    const actResult = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Scroll down the page to see more content',
        sessionId
      }
    });
    
    const actValidation = checkResponseValid(actResult.content, 'browserbase_stagehand_act', 'Act');
    if (actValidation.valid) {
      console.log(`✅ Action completed successfully`);
      results.passed++;
    } else {
      console.log(`❌ Act failed: ${actValidation.reason}`);
      results.failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Screenshot after act
    const screenshot3 = await takeScreenshot(client, sessionId, '03-after-act');
    if (screenshot3) results.screenshots.push(screenshot3);
    console.log();
    
    // ========================================
    // STEP 6: Extract - Get Page Information
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 6: Extracting Structured Data');
    console.log('='.repeat(80));
    
    const extractResult = await client.callTool({
      name: 'browserbase_stagehand_extract',
      arguments: {
        instruction: 'Extract the main information from this Wikipedia page. Return JSON with: {"title": "page title", "firstParagraph": "first paragraph text", "sections": ["section1", "section2"]}',
        sessionId
      }
    });
    
    const extractValidation = checkResponseValid(extractResult.content, 'browserbase_stagehand_extract', 'Extract');
    if (extractValidation.valid) {
      const extractedData = extractJsonData(extractResult.content);
      if (extractedData) {
        console.log(`✅ Extraction successful`);
        console.log(`   Extracted data:`, JSON.stringify(extractedData, null, 2).substring(0, 300));
        results.passed++;
      } else {
        const textContent = extractResult.content.find(item => item.type === 'text')?.text || '';
        console.log(`✅ Extraction completed (text format)`);
        console.log(`   Response: ${textContent.substring(0, 200)}...`);
        results.passed++;
      }
    } else {
      console.log(`❌ Extract failed: ${extractValidation.reason}`);
      results.failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Screenshot after extract
    const screenshot4 = await takeScreenshot(client, sessionId, '04-after-extract');
    if (screenshot4) results.screenshots.push(screenshot4);
    console.log();
    
    // ========================================
    // STEP 7: Act with Observation (Deterministic)
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 7: Acting with Observation (Deterministic)');
    console.log('='.repeat(80));
    
    // Get observations first
    const observe2Result = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find a link or button on the page',
        returnAction: true,
        sessionId
      }
    });
    
    const observations2 = extractObservations(observe2Result.content);
    if (observations2.length > 0) {
      console.log(`   Found ${observations2.length} observation(s), using first one...`);
      
      const actObsResult = await client.callTool({
        name: 'browserbase_stagehand_act',
        arguments: {
          observation: observations2[0],
          sessionId
        }
      });
      
      const actObsValidation = checkResponseValid(actObsResult.content, 'browserbase_stagehand_act', 'Act Observation');
      if (actObsValidation.valid) {
        console.log(`✅ Deterministic action completed`);
        results.passed++;
      } else {
        console.log(`❌ Deterministic act failed: ${actObsValidation.reason}`);
        results.failed++;
      }
    } else {
      console.log(`⚠️  No observations found, skipping deterministic action`);
      results.warnings++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Screenshot after deterministic act
    const screenshot5 = await takeScreenshot(client, sessionId, '05-after-deterministic-act');
    if (screenshot5) results.screenshots.push(screenshot5);
    console.log();
    
    // ========================================
    // STEP 8: Final Screenshot
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 8: Final Screenshot');
    console.log('='.repeat(80));
    
    const screenshot6 = await takeScreenshot(client, sessionId, '06-final-state');
    if (screenshot6) results.screenshots.push(screenshot6);
    console.log();
    
    // ========================================
    // STEP 9: Close Session
    // ========================================
    console.log('='.repeat(80));
    console.log('STEP 9: Closing Session');
    console.log('='.repeat(80));
    
    const closeResult = await client.callTool({
      name: 'browserbase_session_close',
      arguments: { sessionId }
    });
    
    const closeValidation = checkResponseValid(closeResult.content, 'browserbase_session_close', 'Close Session');
    if (closeValidation.valid) {
      console.log(`✅ Session closed successfully`);
      results.passed++;
    } else {
      console.log(`❌ Close failed: ${closeValidation.reason}`);
      results.failed++;
    }
    console.log();
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    results.failed++;
  } finally {
    await client.close();
    if (transport.close) {
      transport.close();
    }
  }
  
  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.warnings}`);
  console.log(`📸 Screenshots: ${results.screenshots.length}`);
  
  if (results.screenshots.length > 0) {
    console.log(`\n📁 Screenshot files:`);
    results.screenshots.forEach((path, idx) => {
      console.log(`   ${idx + 1}. ${path}`);
    });
  }
  
  if (results.failed === 0) {
    console.log(`\n🎉 All tests passed! Complex workflow working correctly.`);
  } else {
    console.log(`\n⚠️  Some tests failed. Check errors above.`);
  }
  
  console.log();
}

main().catch(console.error);

