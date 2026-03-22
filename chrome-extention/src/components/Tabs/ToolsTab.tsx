import React, { useState } from 'react';
import { Settings } from '../../models/types';
import { optimizeConnectors } from '../../services/connectorOptimizationService';
import { autoAlignObjects, distributeObjectsEvenly } from '../../services/layoutUtilsService';
import { extractBoardId } from '../../services/miroApiService';
import { hasMiroSettings } from '../../services/calendarLayoutService';
import './ToolsTab.css';

interface ToolsTabProps {
  settings: Settings;
}

const ToolsTab: React.FC<ToolsTabProps> = ({ settings }) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [status, setStatus] = useState<string>('');

  // Connector Optimization Settings
  const [allowMovement, setAllowMovement] = useState(true);
  const [spacingFactor, setSpacingFactor] = useState(1.5);
  const [layoutPriority, setLayoutPriority] = useState(50);

  // Distribute Settings
  const [distributeSpacingFactor, setDistributeSpacingFactor] = useState(1.5);

  const boardId = extractBoardId(settings.miroBoardId || '');
  const token = settings.miroApiToken || '';
  const miroConfigured = hasMiroSettings(token, boardId);

  const handleOptimizeConnectors = async () => {
    if (!miroConfigured) {
      alert('Miro API トークンとボードIDを設定タブで設定してください。');
      return;
    }
    setIsOptimizing(true);
    setStatus('コネクタを最適化中...');
    try {
      const result = await optimizeConnectors(boardId, token, {
        allowMovement,
        spacingFactor,
        priority: layoutPriority,
      });
      setStatus(result.message);
      alert(result.message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus(`エラー: ${msg}`);
      alert(`コネクタの最適化に失敗しました: ${msg}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAutoAlign = async () => {
    if (!miroConfigured) {
      alert('Miro API トークンとボードIDを設定タブで設定してください。');
      return;
    }
    setIsAligning(true);
    setStatus('オブジェクトを整列中...');
    try {
      const result = await autoAlignObjects(boardId, token);
      setStatus(result.message);
      alert(result.message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus(`エラー: ${msg}`);
      alert(`整列に失敗しました: ${msg}`);
    } finally {
      setIsAligning(false);
    }
  };

  const handleDistributeEvenly = async () => {
    if (!miroConfigured) {
      alert('Miro API トークンとボードIDを設定タブで設定してください。');
      return;
    }
    setIsDistributing(true);
    setStatus('オブジェクトを均等配置中...');
    try {
      const result = await distributeObjectsEvenly(boardId, token, distributeSpacingFactor);
      setStatus(result.message);
      alert(result.message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus(`エラー: ${msg}`);
      alert(`均等配置に失敗しました: ${msg}`);
    } finally {
      setIsDistributing(false);
    }
  };

  return (
    <div className="tools-tab">
      <h2>🔧 便利ツール</h2>
      <p className="tools-description">
        Miro REST API 経由でボードを操作する便利ツールです。設定タブで Miro API トークンとボード URL を設定してください。
      </p>

      {!miroConfigured && (
        <div className="tools-warning">
          ⚠️ Miro API の設定が必要です。<strong>設定タブ</strong>の「Miro連携」セクションで設定してください。
        </div>
      )}

      <div className="section">
        <h3>コネクタ最適化</h3>
        <p className="tool-description">
          ボード上のすべてのコネクタを解析し、線が重ならないようにオブジェクトを再配置して最適な接続ポイントに調整します。
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
          disabled={isOptimizing || !miroConfigured}
        >
          {isOptimizing ? '最適化中...' : 'コネクタを最適化'}
        </button>
      </div>

      <div className="section">
        <h3>オブジェクト整列</h3>
        <p className="tool-description">
          ボード上のすべてのオブジェクトを自動的に整列します。
          オブジェクトの広がりに応じて水平または垂直方向に揃えます。
        </p>
        <button
          className="btn btn-secondary"
          onClick={handleAutoAlign}
          disabled={isAligning || !miroConfigured}
        >
          {isAligning ? '整列中...' : 'オブジェクトを整列'}
        </button>
      </div>

      <div className="section">
        <h3>均等配置</h3>
        <p className="tool-description">
          ボード上のすべてのオブジェクトを等間隔に配置します。
        </p>

        <div className="tool-settings">
          <div className="setting-row">
            <label>オブジェクト間の間隔:</label>
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
          disabled={isDistributing || !miroConfigured}
        >
          {isDistributing ? '配置中...' : 'オブジェクトを均等配置'}
        </button>
      </div>

      {status && (
        <div className="status-message">
          <p>{status}</p>
        </div>
      )}

      <div className="section usage-tips">
        <h3>💡 使い方のヒント</h3>
        <ul>
          <li>コネクタ最適化はボード上のすべての接続済みオブジェクトを対象にします</li>
          <li>整列・均等配置はフレームやコネクタを除くすべてのオブジェクトに適用されます</li>
          <li>大きなボードでは処理に時間がかかる場合があります</li>
        </ul>
      </div>
    </div>
  );
};

export default ToolsTab;
