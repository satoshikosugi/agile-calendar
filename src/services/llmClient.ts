// LLM Client - Provider-agnostic abstraction layer

import { LLMConfig, LLMResponse, DiagramJSON } from '../models/llmTypes';

/**
 * Abstract LLM Client Interface
 */
export interface ILLMClient {
  generateDiagram(prompt: string): Promise<LLMResponse>;
}

/**
 * Ollama Provider Implementation
 */
class OllamaClient implements ILLMClient {
  constructor(private config: LLMConfig) {}

  async generateDiagram(prompt: string): Promise<LLMResponse> {
    try {
      console.log('🤖 Calling Ollama:', this.config.endpoint);
      
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const rawResponse = data.response || '';
      
      console.log('📝 Raw LLM response:', rawResponse.substring(0, 200));

      // Extract JSON from response (handle potential markdown code fences)
      const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                       rawResponse.match(/```\s*([\s\S]*?)\s*```/);
      
      let jsonText = jsonMatch ? jsonMatch[1] : rawResponse;
      jsonText = jsonText.trim();

      // Parse JSON
      const diagramData: DiagramJSON = JSON.parse(jsonText);

      return {
        success: true,
        data: diagramData,
        rawResponse: rawResponse,
      };
    } catch (error: any) {
      console.error('❌ LLM generation error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        rawResponse: error.toString(),
      };
    }
  }
}

/**
 * OpenAI Provider Implementation (stub for future extension)
 */
class OpenAIClient implements ILLMClient {
  constructor(_config: LLMConfig) {}

  async generateDiagram(_prompt: string): Promise<LLMResponse> {
    // TODO: Implement OpenAI API integration
    return {
      success: false,
      error: 'OpenAI provider is not yet implemented',
    };
  }
}

/**
 * Factory function to create LLM client based on provider
 */
export function createLLMClient(config: LLMConfig): ILLMClient {
  switch (config.provider) {
    case 'ollama':
      return new OllamaClient(config);
    case 'openai':
      return new OpenAIClient(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
