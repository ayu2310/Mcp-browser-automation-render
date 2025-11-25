/**
 * Browserbase MCP Server Route Handler
 * 
 * Simplified stateless MCP server using original Browserbase MCP tools.
 * Session management is handled by Browserbase's SessionManager.
 */

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TOOLS } from '@browserbasehq/mcp-server-browserbase/dist/tools/index.js';
import { Context } from '@browserbasehq/mcp-server-browserbase/dist/context.js';

export const maxDuration = 60;

// Helper: Process content to ensure images are in proper format
function processImageContent(content: any[], toolName?: string): any[] {
  return content.map((item: any) => {
    // If it's already an image type, ensure it's properly formatted
    if (item.type === 'image') {
      let imageData = item.data || '';
      let mimeType = item.mimeType || 'image/png';
      
      // If data contains data URL prefix, extract just the base64 part
      if (typeof imageData === 'string' && imageData.includes('data:')) {
        const dataUrlMatch = imageData.match(/data:image\/([^;]+);base64,(.+)/);
        if (dataUrlMatch) {
          mimeType = `image/${dataUrlMatch[1]}`;
          imageData = dataUrlMatch[2];
        }
      }
      
      return {
        type: 'image',
        data: imageData,
        mimeType: mimeType,
      };
    }
    
    // Check if text content contains base64 image data
    if (item.type === 'text' && item.text) {
      // Look for base64 image data in text (common format: data:image/png;base64,...)
      const base64ImageMatch = item.text.match(/data:image\/([^;]+);base64,([A-Za-z0-9+/=\s]+)/);
      if (base64ImageMatch) {
        return {
          type: 'image',
          data: base64ImageMatch[2].replace(/\s/g, ''),
          mimeType: `image/${base64ImageMatch[1]}`,
        };
      }
      
      // For screenshot tools (browserbase_screenshot), check if the entire text is a base64 image
      if (toolName && (toolName.includes('screenshot') || toolName === 'browserbase_screenshot')) {
        const trimmedText = item.text.trim().replace(/\s/g, '');
        if (trimmedText.length > 100 && /^[A-Za-z0-9+/=]+$/.test(trimmedText)) {
          // PNG starts with iVBORw0KGgo, JPEG starts with /9j/
          if (trimmedText.startsWith('iVBORw0KGgo')) {
            return {
              type: 'image',
              data: trimmedText,
              mimeType: 'image/png',
            };
          } else if (trimmedText.startsWith('/9j/')) {
            return {
              type: 'image',
              data: trimmedText,
              mimeType: 'image/jpeg',
            };
          }
        }
      }
    }
    
    // Keep other content types as-is
    return item;
  });
}

// Helper: Execute action using observation (XPath/selector)
// Stagehand's page.act() accepts ObserveResult objects directly
async function executeObservationAction(context: Context, observation: any, sessionId?: string): Promise<any> {
  const stagehand = await context.getStagehand(sessionId);
  const page = stagehand.page;
  
  // Stagehand's act() method accepts ObserveResult objects directly
  // Just pass the observation object to act()
  const result = await page.act(observation);
  
  return {
    content: [
      {
        type: 'text',
        text: `Action performed: ${observation.description || observation.method || 'action'}`,
      },
    ],
  };
}

// Create MCP handler
const handler = createMcpHandler(
  async (server) => {
    const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
    const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
    const modelApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.MODEL_API_KEY;
    const modelName = process.env.MODEL_NAME || 'google/gemini-2.5-flash';

    if (!browserbaseApiKey || !browserbaseProjectId) {
      throw new Error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are required');
    }

    const browserbaseConfig = {
      browserbaseApiKey,
      browserbaseProjectId,
      modelApiKey,
      modelName,
      proxies: process.env.BROWSERBASE_PROXIES === 'true',
      advancedStealth: process.env.BROWSERBASE_ADVANCED_STEALTH === 'true',
      keepAlive: process.env.BROWSERBASE_KEEP_ALIVE === 'true',
    };

    const contextId = randomUUID();
    const browserbaseContext = new Context(server.server, browserbaseConfig, contextId);

    // Register all browserbase tools - use original schemas
    for (const tool of TOOLS) {
      const toolName = tool.schema.name;
      const toolDescription = tool.schema.description;
      
      let enhancedSchema: Record<string, any> = {};
      
      if (tool.schema.inputSchema instanceof z.ZodObject) {
        enhancedSchema = { ...tool.schema.inputSchema.shape };
        
        // Add sessionId parameter to all tools (except session_create which already has it)
        if (toolName !== 'browserbase_session_create' && !enhancedSchema.sessionId) {
          enhancedSchema.sessionId = z.string().optional().describe('Browserbase session ID to reuse (required for session continuity in serverless)');
        }
        
        // Special handling for browserbase_stagehand_act - add observation support
        if (toolName === 'browserbase_stagehand_act') {
          // Make action optional (can use observation instead)
          if (enhancedSchema.action) {
            enhancedSchema.action = enhancedSchema.action.optional();
          }
          
          // Add observation parameter for XPath/selector-based actions
          enhancedSchema.observation = z.object({
            method: z.string().describe('Action method: click, fill, type, select, etc.'),
            selector: z.string().optional().describe('CSS selector for the element'),
            xpath: z.string().optional().describe('XPath expression for the element'),
            arguments: z.array(z.any()).optional().describe('Arguments for the action (e.g., text to fill)'),
            description: z.string().optional().describe('Human-readable description of the action'),
          }).optional().describe('Observation object from browserbase_stagehand_observe (for deterministic actions)');
        }
      } else {
        enhancedSchema = tool.schema.inputSchema as any;
      }

      server.tool(
        toolName,
        toolDescription,
        enhancedSchema,
        async (params: any) => {
          try {
            // CRITICAL: For serverless, we need to ensure session exists before calling tools
            // If sessionId is provided, resume the Browserbase session
            if (params.sessionId && toolName !== 'browserbase_session_create' && toolName !== 'browserbase_session_close') {
              const sessionManager = browserbaseContext.getSessionManager();
              let existingSession = await sessionManager.getSession(params.sessionId, browserbaseContext.config, false);
              
              // If session doesn't exist in Map, we need to resume it
              if (!existingSession) {
                console.log(`[MCP] ${toolName}: Resuming Browserbase session ${params.sessionId}`);
                try {
                  // Resume the Browserbase session by creating a new session with resumeSessionId
                  existingSession = await sessionManager.createNewBrowserSession(
                    params.sessionId, // Internal tracking ID (use Browserbase session ID as tracking ID)
                    browserbaseContext.config,
                    params.sessionId  // Browserbase session ID to resume
                  );
                  console.log(`[MCP] ${toolName}: Successfully resumed session ${params.sessionId}`);
                } catch (resumeError) {
                  console.error(`[MCP] ${toolName}: Failed to resume session ${params.sessionId}:`, resumeError);
                  // If resume fails, the tool will create a new session (fallback behavior)
                }
              } else {
                // Session exists, verify it's still valid and set as active
                if (existingSession.browser && existingSession.browser.isConnected() && !existingSession.page.isClosed()) {
                  sessionManager.setActiveSessionId(params.sessionId);
                  console.log(`[MCP] ${toolName}: Using existing valid session ${params.sessionId}`);
                } else {
                  // Session is stale, try to resume
                  console.log(`[MCP] ${toolName}: Session ${params.sessionId} is stale, attempting to resume`);
                  try {
                    existingSession = await sessionManager.createNewBrowserSession(
                      params.sessionId,
                      browserbaseContext.config,
                      params.sessionId
                    );
                  } catch (resumeError) {
                    console.error(`[MCP] ${toolName}: Failed to resume stale session:`, resumeError);
                  }
                }
              }
            }
            
            // Special handling for browserbase_stagehand_act with observation
            if (toolName === 'browserbase_stagehand_act' && params.observation) {
              const result = await executeObservationAction(
                browserbaseContext,
                params.observation,
                params.sessionId
              );
              return {
                content: processImageContent(result.content || [], toolName),
              };
            }
            
            // For actions/observe, verify page is ready (not blank)
            if ((toolName === 'browserbase_stagehand_act' || toolName === 'browserbase_stagehand_observe') && params.sessionId) {
              try {
                const stagehand = await browserbaseContext.getStagehand(params.sessionId);
                const page = stagehand.page;
                const currentUrl = page.url();
                // If page is on about:blank or data: URL, it's likely blank
                if (currentUrl === 'about:blank' || currentUrl.startsWith('data:')) {
                  console.warn(`[MCP] ${toolName}: Page appears blank (${currentUrl}), action may fail`);
                }
              } catch (e) {
                // Ignore - page check is best effort
              }
            }
            
            // For all other tools, pass through to original Browserbase MCP tool
            const result = await browserbaseContext.run(tool, params);
            
            return {
              content: processImageContent(result.content || [], toolName),
            };
          } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[MCP] Error in ${toolName}:`, errorMessage);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${errorMessage}`,
                },
              ],
            };
          }
        }
      );
    }
  },
  {
    serverInfo: {
      name: 'Browserbase Stagehand MCP Server',
      version: '4.0.0',
    },
  },
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === 'development',
  }
);

export { handler as GET, handler as POST };
