/**
 * Test Scroll on Long Page
 * 
 * Tests scrolling on a page with lots of content
 */

const path = require('path');
const fs = require('fs');
const sdkClientPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const sdkTransportPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js');
const { Client } = require(sdkClientPath);
const { StreamableHTTPClientTransport } = require(sdkTransportPath);

const MCP_URL = process.env.MCP_URL || 'https://mcp-browser-automation-render.onrender.com/api/mcp';

const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots-scroll-test');
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

async function takeScreenshot(client, sessionId, filename) {
  try {
    const result = await client.callTool({
      name: 'browserbase_screenshot',
      arguments: { sessionId }
    });
    
    let imageData = null;
    let extension = 'png';
    
    const imageItem = result.content.find(item => 
      item.type === 'image' || 
      (item.mimeType && item.mimeType.startsWith('image/'))
    );
    
    if (imageItem && imageItem.data) {
      imageData = Buffer.from(imageItem.data, 'base64');
      extension = imageItem.mimeType ? imageItem.mimeType.split('/')[1] : 'png';
    } else {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          const dataUrlMatch = item.text.match(/data:image\/(\w+);base64,([A-Za-z0-9+/=\s]+)/);
          if (dataUrlMatch) {
            extension = dataUrlMatch[1];
            imageData = Buffer.from(dataUrlMatch[2].replace(/\s/g, ''), 'base64');
            break;
          }
          
          const trimmedText = item.text.trim().replace(/\s/g, '');
          if (trimmedText.length > 100 && /^[A-Za-z0-9+/=]+$/.test(trimmedText)) {
            if (trimmedText.startsWith('iVBORw0KGgo')) {
              imageData = Buffer.from(trimmedText, 'base64');
              extension = 'png';
              break;
            }
          }
        }
      }
    }
    
    if (imageData) {
      const filepath = path.join(SCREENSHOTS_DIR, `${filename}.${extension}`);
      fs.writeFileSync(filepath, imageData);
      return filepath;
    }
    return null;
  } catch (error) {
    console.error(`Screenshot failed: ${error.message}`);
    return null;
  }
}

function compareScreenshots(file1, file2) {
  try {
    const img1 = fs.readFileSync(file1);
    const img2 = fs.readFileSync(file2);
    
    if (img1.equals(img2)) {
      return { identical: true, reason: 'Files are byte-for-byte identical' };
    }
    
    const size1 = img1.length;
    const size2 = img2.length;
    const sizeDiff = Math.abs(size1 - size2);
    const sizeDiffPercent = (sizeDiff / Math.max(size1, size2)) * 100;
    
    if (sizeDiffPercent < 1) {
      return { identical: true, reason: `Files are nearly identical (${sizeDiffPercent.toFixed(2)}% difference)` };
    }
    
    return { identical: false, reason: `Files differ by ${sizeDiffPercent.toFixed(2)}%` };
  } catch (error) {
    return { identical: null, reason: `Error comparing: ${error.message}` };
  }
}

async function main() {
  console.log('\n🔍 Scroll Test on Long Page');
  console.log(`📍 MCP URL: ${MCP_URL}`);
  console.log(`📁 Screenshots: ${SCREENSHOTS_DIR}\n`);
  
  const transport = new StreamableHTTPClientTransport(MCP_URL);
  const client = new Client({ name: 'scroll-test', version: '1.0.0' });
  
  client.onerror = (error) => {
    console.error('❌ MCP Client Error:', error.message || error);
  };
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  let sessionId = null;
  const screenshots = [];
  
  try {
    // Create session
    console.log('1️⃣ Creating session...');
    const createResult = await client.callTool({
      name: 'browserbase_session_create',
      arguments: {}
    });
    sessionId = extractSessionId(createResult.content);
    console.log(`   Session ID: ${sessionId}\n`);
    
    // Navigate to a VERY long page (Wikipedia article with lots of content)
    const url = 'https://en.wikipedia.org/wiki/World_War_II';
    console.log(`2️⃣ Navigating to long page: ${url}...`);
    console.log(`   (This page has lots of content and should definitely be scrollable)`);
    await client.callTool({
      name: 'browserbase_stagehand_navigate',
      arguments: { url, sessionId }
    });
    console.log('   ✅ Navigated\n');
    
    // Wait for page to fully load
    console.log('   ⏳ Waiting 5 seconds for page to fully load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Screenshot 1: Initial state (top of page)
    console.log('📸 Screenshot 1: Initial state (top of page)...');
    const screenshot1 = await takeScreenshot(client, sessionId, '01-initial-top');
    if (screenshot1) {
      screenshots.push(screenshot1);
      const stats = fs.statSync(screenshot1);
      console.log(`   ✅ Saved: ${path.basename(screenshot1)} (${(stats.size / 1024).toFixed(2)} KB)\n`);
    }
    
    // Action: Scroll down using natural language
    console.log('3️⃣ Acting: Scroll down the page...');
    const actResult = await client.callTool({
      name: 'browserbase_stagehand_act',
      arguments: {
        action: 'Scroll down the page to see more content',
        sessionId
      }
    });
    
    const actText = actResult.content[0]?.text || '';
    if (actText.includes('Error') || actText.includes('Failed')) {
      console.log(`   ❌ Action failed: ${actText.substring(0, 200)}`);
    } else {
      console.log(`   ✅ Action completed`);
    }
    console.log();
    
    // Wait for scroll to complete
    console.log('   ⏳ Waiting 3 seconds for scroll to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Screenshot 2: After scroll
    console.log('📸 Screenshot 2: After scroll...');
    const screenshot2 = await takeScreenshot(client, sessionId, '02-after-scroll');
    if (screenshot2) {
      screenshots.push(screenshot2);
      const stats = fs.statSync(screenshot2);
      console.log(`   ✅ Saved: ${path.basename(screenshot2)} (${(stats.size / 1024).toFixed(2)} KB)\n`);
    }
    
    // Try observe + act (deterministic scroll)
    console.log('4️⃣ Observing: Find element further down the page...');
    const observeResult = await client.callTool({
      name: 'browserbase_stagehand_observe',
      arguments: {
        instruction: 'Find a heading, section, or link that appears in the middle or bottom of the page (not visible in current viewport)',
        returnAction: true,
        sessionId
      }
    });
    
    const observations = extractObservations(observeResult.content);
    if (observations.length > 0) {
      console.log(`   ✅ Found ${observations.length} element(s) further down`);
      console.log(`   Using: ${observations[0].description || observations[0].method}\n`);
      
      // Act: Scroll to element
      console.log('5️⃣ Acting: Scroll to element (deterministic)...');
      await client.callTool({
        name: 'browserbase_stagehand_act',
        arguments: {
          observation: observations[0],
          sessionId
        }
      });
      console.log('   ✅ Action completed\n');
      
      // Wait
      console.log('   ⏳ Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Screenshot 3: After scrolling to element
      console.log('📸 Screenshot 3: After scrolling to element...');
      const screenshot3 = await takeScreenshot(client, sessionId, '03-after-scroll-to-element');
      if (screenshot3) {
        screenshots.push(screenshot3);
        const stats = fs.statSync(screenshot3);
        console.log(`   ✅ Saved: ${path.basename(screenshot3)} (${(stats.size / 1024).toFixed(2)} KB)\n`);
      }
    } else {
      console.log(`   ⚠️  No elements found further down\n`);
    }
    
    // Compare screenshots
    console.log('='.repeat(80));
    console.log('🔍 COMPARING SCREENSHOTS');
    console.log('='.repeat(80));
    
    if (screenshots.length >= 2) {
      const comparison1 = compareScreenshots(screenshots[0], screenshots[1]);
      console.log(`\n📊 Screenshot 1 (initial) vs Screenshot 2 (after scroll):`);
      console.log(`   ${comparison1.identical ? '❌ IDENTICAL - Scroll did NOT work' : '✅ DIFFERENT - Scroll worked!'}`);
      console.log(`   ${comparison1.reason}`);
      
      if (screenshots.length >= 3) {
        const comparison2 = compareScreenshots(screenshots[1], screenshots[2]);
        console.log(`\n📊 Screenshot 2 vs Screenshot 3 (after scroll to element):`);
        console.log(`   ${comparison2.identical ? '❌ IDENTICAL' : '✅ DIFFERENT'}`);
        console.log(`   ${comparison2.reason}`);
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
    console.log(`\n📸 Screenshots captured: ${screenshots.length}`);
    screenshots.forEach((filepath, idx) => {
      const stats = fs.statSync(filepath);
      console.log(`   ${idx + 1}. ${path.basename(filepath)} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
    
    if (screenshots.length >= 2) {
      const comparison = compareScreenshots(screenshots[0], screenshots[1]);
      if (comparison.identical) {
        console.log('\n⚠️  WARNING: Screenshots are identical!');
        console.log('   This means scroll action is NOT working.');
        console.log('   Possible causes:');
        console.log('   1. Natural language scroll not supported by Stagehand');
        console.log('   2. Action being accepted but not executed');
        console.log('   3. Need to use deterministic actions (observe + act) instead');
      } else {
        console.log('\n✅ SUCCESS: Screenshots are different!');
        console.log('   Scroll action is working correctly.');
      }
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

