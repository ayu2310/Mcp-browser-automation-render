/**
 * Browserbase MCP Server Route Handler - Render/Stateful Version
 * 
 * Simplified version for platforms with persistent processes (Render, Railway, etc.)
 * SessionManager maintains state automatically - no resume logic needed!
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
    if (item.type === 'image') {
      let imageData = item.data || '';
      let mimeType = item.mimeType || 'image/png';
      
      if (typeof imageData === 'string' && imageData.includes('data:')) {
        const dataUrlMatch = imageData.match(/data:image\/([^;]+);base64,(.+)/);
        if (dataUrlMatch) {
          mimeType = `image/${dataUrlMatch[1]}`;
          imageData = dataUrlMatch[2];
        }
      }
      
      return { type: 'image', data: imageData, mimeType };
    }
    
    if (item.type === 'text' && item.text) {
      const base64ImageMatch = item.text.match(/data:image\/([^;]+);base64,([A-Za-z0-9+/=\s]+)/);
      if (base64ImageMatch) {
        return {
          type: 'image',
          data: base64ImageMatch[2].replace(/\s/g, ''),
          mimeType: `image/${base64ImageMatch[1]}`,
        };
      }
      
      if (toolName && (toolName.includes('screenshot') || toolName === 'browserbase_screenshot')) {
        const trimmedText = item.text.trim().replace(/\s/g, '');
        if (trimmedText.length > 100 && /^[A-Za-z0-9+/=]+$/.test(trimmedText)) {
          if (trimmedText.startsWith('iVBORw0KGgo')) {
            return { type: 'image', data: trimmedText, mimeType: 'image/png' };
          } else if (trimmedText.startsWith('/9j/')) {
            return { type: 'image', data: trimmedText, mimeType: 'image/jpeg' };
          }
        }
      }
    }
    
    return item;
  });
}

// Helper: Execute action using observation (XPath/selector)
async function executeObservationAction(context: Context, observation: any, sessionId?: string): Promise<any> {
  const stagehand = await context.getStagehand(sessionId);
  const page = stagehand.page;
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

    // Use a single context ID for the entire process (persists across requests on Render)
    const contextId = process.env.RENDER ? 'render-context' : randomUUID();
    const browserbaseContext = new Context(server.server, browserbaseConfig, contextId);

    // Register all browserbase tools
    for (const tool of TOOLS) {
      const toolName = tool.schema.name;
      const toolDescription = tool.schema.description;
      
      let enhancedSchema: Record<string, any> = {};
      
      if (tool.schema.inputSchema instanceof z.ZodObject) {
        enhancedSchema = { ...tool.schema.inputSchema.shape };
        
        // Add sessionId parameter to all tools (except session_create which already has it)
        if (toolName !== 'browserbase_session_create' && !enhancedSchema.sessionId) {
          enhancedSchema.sessionId = z.string().optional().describe('Browserbase session ID to reuse');
        }
        
        // Special handling for browserbase_stagehand_act - add observation support
        if (toolName === 'browserbase_stagehand_act') {
          if (enhancedSchema.action) {
            enhancedSchema.action = enhancedSchema.action.optional();
          }
          
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
            // On Render/stateful platforms, SessionManager maintains state automatically
            // If sessionId is provided, just set it as active (no resume needed!)
            if (params.sessionId && toolName !== 'browserbase_session_create' && toolName !== 'browserbase_session_close') {
              const sessionManager = browserbaseContext.getSessionManager();
              // Just set as active - SessionManager will use it if it exists, or create if needed
              sessionManager.setActiveSessionId(params.sessionId);
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

