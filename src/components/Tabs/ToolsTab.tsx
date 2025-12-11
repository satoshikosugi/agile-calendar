import React, { useState } from 'react';
import { optimizeConnectors } from '../../services/connectorOptimizationService';
import { autoAlignObjects, distributeObjectsEvenly } from '../../services/layoutUtilsService';
import './ToolsTab.css';

const ToolsTab: React.FC = () => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [status, setStatus] = useState<string>('');

  const handleOptimizeConnectors = async () => {
    setIsOptimizing(true);
    setStatus('コネクタを最適化中...');
    try {
      const result = await optimizeConnectors();
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
      const result = await distributeObjectsEvenly();
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
        <h3>コネクタ最適化</h3>
        <p className="tool-description">
          選択したオブジェクトのコネクタを全て辿り、つながっているオブジェクトを取得して、
          コネクタの線が重ならないように最適な配置と接続ポイントに調整します。
          画面遷移図やER図などを見やすくするのに便利です。
        </p>
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
