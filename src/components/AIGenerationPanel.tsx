import React, { useState } from 'react';
import { LLMConfig } from '../models/llmTypes';
import { createLLMClient } from '../services/llmClient';
import { validateDiagramJSON } from '../services/diagramValidationService';
import { renderDiagramToMiro } from '../services/diagramRenderService';
import { createFullPrompt } from '../prompts/diagramGenerator';
import './AIGenerationPanel.css';

interface AIGenerationPanelProps {
  llmConfig?: LLMConfig;
}

const AIGenerationPanel: React.FC<AIGenerationPanelProps> = ({ llmConfig }) => {
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);

  const MAX_RETRIES = 2;

  const handleGenerate = async () => {
    if (!userInput.trim()) {
      setError('自然言語での指示を入力してください');
      return;
    }

    if (!llmConfig) {
      setError('LLM設定が見つかりません。設定画面で LLM を設定してください。');
      return;
    }

    setIsGenerating(true);
    setError('');
    setStatus('LLMに問い合わせています...');
    setRetryCount(0);

    await generateDiagramWithRetry(userInput, llmConfig, 0);
  };

  const generateDiagramWithRetry = async (
    input: string,
    config: LLMConfig,
    attempt: number
  ) => {
    try {
      // 1. Call LLM
      const client = createLLMClient(config);
      const prompt = createFullPrompt(input);
      
      setStatus(`LLMを呼び出し中... (試行 ${attempt + 1}/${MAX_RETRIES + 1})`);
      const response = await client.generateDiagram(prompt);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'LLM からのレスポンスが無効です');
      }

      // 2. Validate JSON
      setStatus('JSON を検証中...');
      const validation = validateDiagramJSON(response.data);

      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('\n');
        console.error('Validation errors:', validation.errors);

        // Retry if we haven't exceeded max retries
        if (attempt < MAX_RETRIES) {
          setRetryCount(attempt + 1);
          setStatus(`検証エラーが発生しました。リトライ中... (${attempt + 1}/${MAX_RETRIES})`);
          
          // Create error feedback prompt for LLM
          const retryPrompt = createFullPrompt(
            `${input}\n\n前回の出力に以下のエラーがありました。修正してください:\n${errorMessages}`
          );
          
          // Wait a bit before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          // Recursive retry
          return await generateDiagramWithRetry(input, config, attempt + 1);
        } else {
          throw new Error(`検証エラー（最大リトライ回数超過）:\n${errorMessages}`);
        }
      }

      // 3. Render to Miro
      setStatus('Miroボードに描画中...');
      const renderResult = await renderDiagramToMiro(response.data);

      if (!renderResult.success) {
        throw new Error(renderResult.message);
      }

      // Success!
      setStatus(renderResult.message);
      setError('');
      setUserInput(''); // Clear input on success
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || '図の生成に失敗しました');
      setStatus('');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="ai-generation-panel">
      <h3>🤖 AIによる図の生成</h3>
      <p className="panel-description">
        自然言語で指示を入力すると、LLMが構造化JSONを生成し、Miroボード上に図を自動描画します。
      </p>

      {!llmConfig && (
        <div className="warning-box">
          ⚠️ LLM設定が未設定です。設定画面で Ollama などの LLM を設定してください。
        </div>
      )}

      <div className="input-section">
        <label htmlFor="user-input">指示を入力</label>
        <textarea
          id="user-input"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="例: 一般的なECサイトのER図を描画して"
          rows={4}
          disabled={isGenerating || !llmConfig}
        />
      </div>

      <button
        className="btn btn-generate"
        onClick={handleGenerate}
        disabled={isGenerating || !llmConfig || !userInput.trim()}
      >
        {isGenerating ? '生成中...' : '🎨 図を生成'}
      </button>

      {isGenerating && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>{status}</p>
          {retryCount > 0 && <p className="retry-info">リトライ回数: {retryCount}/{MAX_RETRIES}</p>}
        </div>
      )}

      {status && !isGenerating && !error && (
        <div className="success-message">
          <p>✅ {status}</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <h4>❌ エラー</h4>
          <pre>{error}</pre>
        </div>
      )}

      <div className="usage-examples">
        <h4>使用例</h4>
        <ul>
          <li>「一般的なECサイトのER図を描画して」</li>
          <li>「ログインフローの処理図を作成」</li>
          <li>「User、Product、Orderのテーブルを含むER図」</li>
        </ul>
      </div>
    </div>
  );
};

export default AIGenerationPanel;
