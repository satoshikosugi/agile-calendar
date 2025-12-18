import React, { useState, useEffect } from 'react';
import { optimizeConnectors } from '../../services/connectorOptimizationService';
import { autoAlignObjects, distributeObjectsEvenly } from '../../services/layoutUtilsService';
import { loadSettings } from '../../services/settingsService';
import { Settings } from '../../models/types';
import AIGenerationPanel from '../AIGenerationPanel';
import './ToolsTab.css';

const ToolsTab: React.FC = () => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [settings, setSettings] = useState<Settings | null>(null);

  // Connector Optimization Settings
  const [allowMovement, setAllowMovement] = useState(true);
  const [spacingFactor, setSpacingFactor] = useState(1.5);
  const [layoutPriority, setLayoutPriority] = useState(50); // 0: Original Position, 100: Avoid Overlap

  // Distribute Settings
  const [distributeSpacingFactor, setDistributeSpacingFactor] = useState(1.5);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const handleOptimizeConnectors = async () => {
    setIsOptimizing(true);
    setStatus('コネクタを最適化中...');
    try {
      const result = await optimizeConnectors({
        allowMovement,
        spacingFactor,
        priority: layoutPriority
      });
      setStatus(result.message);
      alert(result.message);
    } catch (error: any) {
      console.error('Connector optimization error:', error);
      setStatus(`エラー: ${error.message}`);
      alert(`コネクタの最適化に失敗しました: ${error.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAutoAlign = async () => {
    setIsAligning(true);
    setStatus('オブジェクトを整列中...');
    try {
      const result = await autoAlignObjects();
      setStatus(result.message);
      alert(result.message);
    } catch (error: any) {
      console.error('Auto-align error:', error);
      setStatus(`エラー: ${error.message}`);
      alert(`整列に失敗しました: ${error.message}`);
    } finally {
      setIsAligning(false);
    }
  };

  const handleDistributeEvenly = async () => {
    setIsDistributing(true);
    setStatus('オブジェクトを均等配置中...');
    try {
      const result = await distributeObjectsEvenly(distributeSpacingFactor);
      setStatus(result.message);
      alert(result.message);
    } catch (error: any) {
      console.error('Distribute evenly error:', error);
      setStatus(`エラー: ${error.message}`);
      alert(`均等配置に失敗しました: ${error.message}`);
    } finally {
      setIsDistributing(false);
    }
  };

  return (
    <div className="tools-tab">
      <h2>🔧 便利ツール</h2>
      <p className="tools-description">
        Miroボードをより便利にする各種ツールです。
      </p>

      <div className="section">
        <AIGenerationPanel llmConfig={settings?.llmConfig} />
      </div>

      <div className="section">
        <h3>コネクタ最適化</h3>
        <p className="tool-description">
          選択したオブジェクトのコネクタを全て辿り、つながっているオブジェクトを取得して、
          コネクタの線が重ならないようにオブジェクトを自動的に再配置し、最適な接続ポイントに調整します。
          画面遷移図やER図などを見やすくするのに便利です。
        </p>
        
        <div className="tool-settings">
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={allowMovement}
                onChange={(e) => setAllowMovement(e.target.checked)}
              />
              オブジェクトの移動を許可
            </label>
          </div>
          
          {allowMovement && (
            <>
              <div className="setting-row">
                <label>オブジェクト間の距離:</label>
                <select
                  value={spacingFactor}
                  onChange={(e) => setSpacingFactor(parseFloat(e.target.value))}
                >
                  <option value={1.0}>1.0個分（密）</option>
                  <option value={1.5}>1.5個分（標準）</option>
                  <option value={2.0}>2.0個分（広め）</option>
                  <option value={2.5}>2.5個分（かなり広め）</option>
                  <option value={3.0}>3.0個分（最大）</option>
                </select>
              </div>
              
              <div className="setting-row">
                <label>優先度調整:</label>
                <div className="slider-container">
                  <span>元の位置</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={layoutPriority}
                    onChange={(e) => setLayoutPriority(parseInt(e.target.value))}
                  />
                  <span>重なり回避</span>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleOptimizeConnectors}
          disabled={isOptimizing}
        >
          {isOptimizing ? '最適化中...' : 'コネクタを最適化'}
        </button>
      </div>

      <div className="section">
        <h3>オブジェクト整列</h3>
        <p className="tool-description">
          選択したオブジェクトを自動的に整列します。
          水平方向または垂直方向に配置を揃えます。
        </p>
        <button
          className="btn btn-secondary"
          onClick={handleAutoAlign}
          disabled={isAligning}
        >
          {isAligning ? '整列中...' : '自動整列'}
        </button>
      </div>

      <div className="section">
        <h3>均等配置</h3>
        <p className="tool-description">
          選択したオブジェクトを等間隔に配置します。
          水平方向または垂直方向に均等に分散させます。
        </p>
        
        <div className="tool-settings">
          <div className="setting-row">
            <label>オブジェクト間の距離:</label>
            <select
              value={distributeSpacingFactor}
              onChange={(e) => setDistributeSpacingFactor(parseFloat(e.target.value))}
            >
              <option value={1.0}>1.0個分（密）</option>
              <option value={1.5}>1.5個分（標準）</option>
              <option value={2.0}>2.0個分（広め）</option>
              <option value={2.5}>2.5個分（かなり広め）</option>
              <option value={3.0}>3.0個分（最大）</option>
            </select>
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleDistributeEvenly}
          disabled={isDistributing}
        >
          {isDistributing ? '配置中...' : '均等配置'}
        </button>
      </div>

      {status && (
        <div className="status-message">
          <p>{status}</p>
        </div>
      )}

      <div className="section usage-tips">
        <h3>使い方のヒント</h3>
        <ul>
          <li><strong>コネクタ最適化:</strong> 最適化したいオブジェクトを1つ以上選択してから実行してください。</li>
          <li><strong>自動整列:</strong> 整列したいオブジェクトを2つ以上選択してから実行してください。</li>
          <li><strong>均等配置:</strong> 配置したいオブジェクトを3つ以上選択してから実行してください。</li>
        </ul>
      </div>
    </div>
  );
};

export default ToolsTab;
