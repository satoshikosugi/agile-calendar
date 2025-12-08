import { Task, Settings } from '../models/types';
import { miro } from '../miro';
import { loadSettings } from './settingsService';
import { calculateTaskPosition, calculateTaskPositionsForDate, getCalendarFrame, calculatePersonalSchedulePosition, getDateFromPosition, PERSONAL_NOTE_WIDTH } from './calendarLayoutService';
import { parseTime, formatTime } from './scheduleService';
import { withRetry, sleep } from '../utils/retry';
import { debugService } from './debugService';

const TASK_METADATA_KEY = 'task';
const PERSONAL_SCHEDULE_APP_TYPE = 'personalSchedule';

// タスクの日付を追跡するためのローカルキャッシュ（バッチ間での古いデータ問題を回避）
const taskDateCache = new Map<string, string>();

// デバウンス設定
let moveDebounceTimer: any = null;
let isProcessingMoves = false;
const pendingMoveItems = new Map<string, any>();
const MOVE_DEBOUNCE_MS = 5000; // ドロップ時の応答速度を優先して5000msに短縮

// 同時移動時の競合を防ぐためのロック機構
const processingDates = new Set<string>();

// ボード上でのタスク移動を処理
export async function handleTaskMove(items: any[]): Promise<void> {
  debugService.startOperation('handleTaskMove');
  try {
    console.log('handleTaskMove called with', items.length, 'items');
    
    // 保留中のマップにアイテムを追加
    for (const item of items) {
        // 付箋のみを追跡
        if (item.type === 'sticky_note') {
            pendingMoveItems.set(item.id, item);
        }
    }

    // 処理がすでに進行中の場合は、キューに追加して戻る
    // 処理ループが現在のバッチ後に新しいアイテムを取得する
    if (isProcessingMoves) {
        console.log(`移動処理が進行中です。${items.length}個のアイテムを次のバッチのキューに追加しました。`);
        return;
    }

    // タイマーをリセット
    if (moveDebounceTimer) {
        clearTimeout(moveDebounceTimer);
    }

    console.log(`${pendingMoveItems.size}個のアイテムを移動のキューに追加しました。${MOVE_DEBOUNCE_MS}ms待機中...`);

    moveDebounceTimer = setTimeout(async () => {
        await processPendingMoves();
    }, MOVE_DEBOUNCE_MS);
  } finally {
    debugService.endOperation();
  }
}

// キューに入っている移動をバッチ処理
async function processPendingMoves() {
    if (isProcessingMoves) return;
    isProcessingMoves = true;
    debugService.startOperation('processPendingMoves');
    
    try {
        // キューが空になるまでループ
        do {
            console.log('保留中の移動バッチを処理中...');
            const items = Array.from(pendingMoveItems.values());
            pendingMoveItems.clear();
            moveDebounceTimer = null;

            if (items.length > 0) {
                await processBatch(items);
            }
            
            // 処理中に新しいアイテムが到着した場合、ループが続行される
            if (pendingMoveItems.size > 0) {
                console.log(`キューに${pendingMoveItems.size}個の新しいアイテムが見つかりました。処理を続行します...`);
            }
        } while (pendingMoveItems.size > 0);

    } catch (error) {
        console.error('processPendingMovesでエラーが発生しました:', error);
    } finally {
        isProcessingMoves = false;
        debugService.endOperation();
    }
}

async function processBatch(items: any[]) {
        const affectedDates = new Set<string>();
        const movedItemsByDate = new Map<string, { note: any, task: Task }[]>();
        const movedTaskIds = new Set<string>();

        try {
            // 1. すべてのタスクを更新し、影響を受ける日付を収集
            for (const item of items) {
                // このアイテムに新しい保留中の移動がある場合はスキップ
                if (pendingMoveItems.has(item.id)) {
                    console.log(`現在のバッチでタスク${item.id}をスキップします。新しい移動が保留中です。`);
                    continue;
                }

                try {
                    // アイテムを再取得して最新のメタデータ/メソッドを確保
                    const freshItems = await withRetry<any[]>(() => miro.board.get({ id: item.id }), undefined, 'board.get(id)');
                    if (!freshItems || freshItems.length === 0) continue;
                    
                    const freshItem = freshItems[0];
                    const metadata = await freshItem.getMetadata(TASK_METADATA_KEY);
                    
                    if (!metadata || !(metadata as Task).id) continue;
                    
                    const task = metadata as Task;
                    
                    // キャッシュされた日付が利用可能な場合はそれを使用（バッチ間の高速移動を処理）、そうでなければメタデータを使用
                    const cachedDate = taskDateCache.get(task.id);
                    const oldDate = cachedDate || task.date;
                    
                    // このタスクが移動されていることを追跡
                    movedTaskIds.add(task.id);
                    
                    // 利用可能な場合はイベントトリガー（クライアント側）の座標を使用、そうでなければサーバー側にフォールバック
                    // これにより、board.get()がドラッグ操作中に古い座標を返す問題を修正
                    const targetX = (typeof item.x === 'number') ? item.x : freshItem.x;
                    const targetY = (typeof item.y === 'number') ? item.y : freshItem.y;

                    // 修正: 移動前に親から切り離して「別のアイテムの子」エラーを回避
                    // これはMiro SDKがフレームの子であるアイテムの移動を制限するため必要
                    if (freshItem.parentId) {
                        await detachFromParent(freshItem);
                    }

                    // 重要な修正: freshItemの座標をクライアント側の座標に一致させる
                    // これにより、sync()が古いサーバー側の値に位置を戻すのを防ぐ
                    freshItem.x = targetX;
                    freshItem.y = targetY;

                    // 位置に基づいて新しい日付を計算
                    // 古いparentIdを無視して空間検索を強制するため、itemにundefinedを渡す
                    const newDate = await getDateFromPosition(targetX, targetY, undefined);
                    
                    if (newDate) {
                        if (newDate !== oldDate) {
                            console.log(`タスク${task.title}が${oldDate}から${newDate}に移動されました`);
                            
                            // タスクの日付を更新
                            const updatedTask = { ...task, date: newDate };
                            
                            // キャッシュを即座に更新
                            taskDateCache.set(task.id, newDate);
                            
                            // メタデータのみを更新（完全なupdateStickyNotePropertiesをスキップして二重同期を回避）
                            // reorganizeTasksOnDateが完全な更新と同期を処理する
                            await withRetry(() => freshItem.setMetadata(TASK_METADATA_KEY, updatedTask), undefined, 'note.setMetadata(task)');
                            
                            // 重要な修正: 新しい日付のフレームに明示的に追加
                            // これにより、reorganizeTasksOnDateがframe.getChildren()を介してそれを見つけることを保証
                            const dateObj = new Date(newDate);
                            const frame = await getCalendarFrame(dateObj.getFullYear(), dateObj.getMonth());
                            if (frame) {
                                await withRetry(() => frame.add(freshItem), undefined, 'frame.add');
                            }

                            // 移動されたアイテムを追跡
                            if (!movedItemsByDate.has(newDate)) {
                                movedItemsByDate.set(newDate, []);
                            }
                            movedItemsByDate.get(newDate)!.push({ note: freshItem, task: updatedTask });

                            if (oldDate) affectedDates.add(oldDate);
                            affectedDates.add(newDate);
                        } else {
                            console.log(`タスク${task.title}が移動されましたが、同じ日付${oldDate}に留まりました`);
                            
                            // 移動されたアイテムを追跡（同じ日付でも、レイアウトに含まれることを保証）
                            if (!movedItemsByDate.has(oldDate)) {
                                movedItemsByDate.set(oldDate, []);
                            }
                            movedItemsByDate.get(oldDate)!.push({ note: freshItem, task: task });

                            // スナップを確実にするために、影響を受ける日付に追加
                            affectedDates.add(oldDate);
                        }
                    } else {
                        console.warn(`タスク${task.title}の日付を(${targetX}, ${targetY})で判定できませんでした`);
                    }
                } catch (e) {
                    console.error('個別のアイテム移動処理でエラーが発生しました:', e);
                }
            }

            // 2. 影響を受ける日付を再編成
            // reorganizeTasksOnDateの内部最適化（frame.getChildren）に依存して
            // ボード上のすべてのノートを取得する代わりに、レート制限を引き起こす
            console.log('影響を受ける日付を再編成中:', Array.from(affectedDates));
            
            // 日付ごとに再編成処理をシリアライズして競合を防ぐ
            for (const date of affectedDates) {
                // この日付が既に処理中の場合は待機
                while (processingDates.has(date)) {
                    await sleep(100);
                }
                
                try {
                    processingDates.add(date);
                    // preFilteredNotesにundefinedを渡してフレームから取得させる
                    // forceIncludedTasksとしてmovedItemsByDate.get(date)を渡す
                    // 他の日付に移動したタスクを除外するためにmovedTaskIdsを渡す
                    await reorganizeTasksOnDate(date, undefined, undefined, movedItemsByDate.get(date), movedTaskIds);
                    // 日付間の遅延を追加して安全性を確保
                    await sleep(200);
                } finally {
                    processingDates.delete(date);
                }
            }
        } catch (error) {
            console.error('processBatchでエラーが発生しました:', error);
        }
}

// タスクの内容をフォーマットするヘルパー
function formatTaskContent(task: Task, settings: Settings): string {
  const lines: string[] = [];

  // 1. タイトル
  lines.push(task.title);

  // 2. 時間範囲または期間
  if (task.time && task.time.startTime) {
    if (task.time.duration) {
        const startMins = parseTime(task.time.startTime);
        const endMins = startMins + task.time.duration;
        lines.push(`${task.time.startTime}-${formatTime(endMins)}`);
    } else {
        lines.push(task.time.startTime);
    }
  } else if (task.time && task.time.duration) {
      lines.push(`${task.time.duration}min`);
  }

  // 3. 参加者
  const participants: string[] = [];
  
  // PM
  if (task.roles.pmId) {
    const pm = settings.devs.find(d => d.id === task.roles.pmId);
    if (pm) participants.push(`${pm.name}(PM)`);
  }

  // Dev計画
  if (task.roles.devPlan.mode === 'Tracks') {
    const assignedIds = task.roles.devPlan.assignedTrackIds || [];
    if (assignedIds.length > 0) {
      // 確定: トラック名
      const trackNames = assignedIds.map(id => {
        const track = settings.tracks.find(t => t.id === id);
        return track ? track.name : '';
      }).filter(Boolean);
      participants.push(trackNames.join(', '));
    } else {
      // 未確定: 必要数
      participants.push(`${task.roles.devPlan.requiredTrackCount}Track`);
    }
  } else if (task.roles.devPlan.mode === 'AllDev') {
    participants.push('All Dev');
  }

  // デザイナー / その他
  if (task.roles.designerIds && task.roles.designerIds.length > 0) {
    const designers = task.roles.designerIds.map(id => {
      const dev = settings.devs.find(d => d.id === id);
      return dev ? dev.name : '';
    }).filter(Boolean);
    participants.push(...designers);
  }

  if (participants.length > 0) {
    lines.push(participants.join('、'));
  }

  // 4. 外部チーム
  if (task.externalParticipants && task.externalParticipants.length > 0) {
    const teams = task.externalParticipants.map(p => {
      const team = settings.externalTeams.find(t => t.id === p.teamId);
      return team ? team.name : '';
    }).filter(Boolean);
    if (teams.length > 0) {
      lines.push(teams.join('、'));
    }
  }

  // 5. 外部リンク（埋め込みHTML）
  if (task.externalLink) {
    lines.push(`<a href="${task.externalLink}">🔗Link</a>`);
  }

  // HTML段落として行区切りで返す
  return `<p>${lines.join('<br>')}</p>`;
}

// タスクの既存のリンクインジケーターを削除するヘルパー関数
async function removeExistingLinkShapes(_taskId: string): Promise<void> {
  // 最適化: レート制限を防ぐため無効化
  // 新しいレイアウトではレガシーリンク図形は使用されなくなった
  return;
}

// タスクに基づいて付箋のすべてのプロパティを更新するヘルパー
async function updateStickyNoteProperties(note: any, task: Task, settings: Settings, skipLinkCleanup = false): Promise<void> {
  // 1. コンテンツを更新
  note.content = formatTaskContent(task, settings);
  
  // 2. スタイルを更新
  note.style = {
    ...note.style,
    fillColor: getTaskColor(task),
  };
  
  // 3. メタデータを更新
  const cleanTask = JSON.parse(JSON.stringify(task));
  await withRetry(() => note.setMetadata(TASK_METADATA_KEY, cleanTask), undefined, 'note.setMetadata(task)');
  await withRetry(() => note.setMetadata('appType', 'task'), undefined, 'note.setMetadata(appType)');

  // 4. 変更を同期
  await withRetry(() => note.sync(), undefined, 'note.sync(update)');

  // 5. レガシーリンク図形を削除（スキップされない限り）
  if (!skipLinkCleanup) {
    await removeExistingLinkShapes(task.id);
  }
}

// 親フレームからノートを切り離すヘルパー
async function detachFromParent(note: any, signal?: AbortSignal) {
    if (note.parentId) {
        try {
            const parentItems = await withRetry<any[]>(() => miro.board.get({ id: note.parentId }), signal, 'board.get(parentId)');
            if (parentItems && parentItems.length > 0) {
                const parent = parentItems[0];
                // 親にremoveメソッドがあるか確認（通常Frameにはある）
                if (parent.remove) {
                    await withRetry(() => parent.remove(note), signal, 'parent.remove');
                    // 可能であればローカル状態を更新
                    try { note.parentId = null; } catch(e) {}
                }
            }
        } catch (e) {
            console.warn('親からの切り離しに失敗しました', e);
        }
    }
}

// 特定の日付のタスクを再編成して重なりを防ぐヘルパー
export async function reorganizeTasksOnDate(
  date: string, 
  updatedTask?: Task, 
  preFilteredNotes?: { note: any, task: Task }[],
  forceIncludedTasks?: { note: any, task: Task }[],
  excludeTaskIds?: Set<string>
): Promise<void> {
  debugService.startOperation('reorganizeTasksOnDate');
  try {
    let dateNotes: { note: any, task: Task }[] = [];

    if (preFilteredNotes) {
        dateNotes = preFilteredNotes;
    } else {
        // 最適化: グローバルボード検索の代わりにFrame検索を使用
        const dateObj = new Date(date);
        const frame = await getCalendarFrame(dateObj.getFullYear(), dateObj.getMonth());
        
        if (frame) {
            // フレームのすべての子要素を取得
            const children = await withRetry<any[]>(() => frame.getChildren(), undefined, 'frame.getChildren');
            const stickyNotes = children.filter((item: any) => item.type === 'sticky_note');
            
            // これらのノートのみを処理
            // メタデータ取得をバッチ化してAPI呼び出しを削減
            const metadataPromises = stickyNotes.map(async (note: any) => {
                try {
                    const metadata = await note.getMetadata(TASK_METADATA_KEY);
                    return { note, metadata };
                } catch (e) {
                    return { note, metadata: null };
                }
            });
            
            const metadataResults = await Promise.all(metadataPromises);
            
            const results = metadataResults.map(({ note, metadata }) => {
                try {
                    let task = metadata as Task;
                    
                    // メタデータが日付と一致するか確認
                    if (task && task.date === date) {
                        // 要求された場合は除外（例：別の日付に移動したがまだこのフレームの子に残っているタスク）
                        if (excludeTaskIds && excludeTaskIds.has(task.id)) return null;
                        
                        // キャッシュを確認：キャッシュがタスクが他の場所にあると言っている場合は除外（古いメタデータ/フレームよりキャッシュを信頼）
                        const cachedDate = taskDateCache.get(task.id);
                        if (cachedDate && cachedDate !== date) return null;

                        // 座標チェック用に修正
                        let checkX = note.x;
                        let checkY = note.y;
                        
                        if (note.parentId === frame.id) {
                             checkX = frame.x + note.x;
                             checkY = frame.y + note.y;
                        }

                        // セーフティネット: タスクが物理的にこのフレームの外にある場合、別の日付に属しているか確認
                        // これにより、メタデータ/キャッシュが古い場合やタスクがバッチでスキップされた場合の「元に戻る」グリッチを防ぐ
                        const isInsideFrame = 
                            checkX >= frame.x - frame.width / 2 && 
                            checkX <= frame.x + frame.width / 2 &&
                            checkY >= frame.y - frame.height / 2 &&
                            checkY <= frame.y + frame.height / 2;

                        if (!isInsideFrame) {
                            // 実際の位置を確認（追加のAPI呼び出しを避けるため非同期処理は行わない）
                            // この場合は単に除外
                            console.log(`タスク${task.title}が物理的にフレームの外にあるため、${date}の再編成から除外します`);
                            return null;
                        }

                        // 提供された場合は更新されたタスクデータを使用
                        if (updatedTask && task.id === updatedTask.id) {
                            task = updatedTask;
                        }
                        return { note, task };
                    }
                    
                    // 自己修復: メタデータの不一致の場合、空間位置を確認
                    // これにより「内部日付vs実際の位置」の同期問題を修正
                    if (task) {
                        // 要求された場合は除外
                        if (excludeTaskIds && excludeTaskIds.has(task.id)) return null;
                        
                        // キャッシュを確認：キャッシュがタスクが他の場所にあると言っている場合は除外
                        const cachedDate = taskDateCache.get(task.id);
                        if (cachedDate && cachedDate !== date) return null;

                        // 座標から計算した日付が一致する場合
                        // 高コストのため、実際には非同期チェックをスキップし、内部境界チェックを信頼
                        // ここでは単純に不一致として扱い、除外
                        console.log(`タスク${task.title}のメタデータ不一致: metadata=${task.date}, expected=${date}のため除外`);
                        return null;
                    }
                } catch (e) { }
                return null;
            });
            
            dateNotes = results.filter((item): item is { note: any, task: Task } => item !== null);
        } else {
            // フレームが見つからない場合のフォールバック（新しいレイアウトでは発生しないはず）
            console.warn(`日付${date}のフレームが見つかりません、再編成をスキップします`);
            return;
        }
    }

    // forceIncludedTasks（IDで重複を排除）をマージ
    if (forceIncludedTasks && forceIncludedTasks.length > 0) {
        const existingIds = new Set(dateNotes.map(dn => dn.task.id));
        for (const item of forceIncludedTasks) {
            if (!existingIds.has(item.task.id)) {
                dateNotes.push(item);
                existingIds.add(item.task.id);
            } else {
                // 存在する場合は、強制されたもので置き換える（それが新しい）
                const index = dateNotes.findIndex(dn => dn.task.id === item.task.id);
                if (index !== -1) {
                    dateNotes[index] = item;
                }
            }
        }
    }

    if (dateNotes.length === 0) return;

    // Y位置でソートして視覚的な順序を尊重（特に時刻のないタスクの場合）
    // これにより、ユーザーが時刻なしでタスクを手動で並べ替えた場合や
    // 特定の順序でドロップした場合、その順序が保持されることを保証
    dateNotes.sort((a, b) => a.note.y - b.note.y);

    // 3. 新しい位置を計算
    const tasks = dateNotes.map(dn => dn.task);
    const newPositions = await calculateTaskPositionsForDate(date, tasks);
    const settings = await loadSettings(); // これでキャッシュされる！

    // この日付のフレームを取得してアイテムが最上位にあることを保証
    const taskDate = new Date(date);
    const frame = await getCalendarFrame(taskDate.getFullYear(), taskDate.getMonth());

    // 4. 位置とコンテンツを更新
    for (const { note, task } of dateNotes) {
      const pos = newPositions.get(task.id);
      if (pos) {
        // すべてのプロパティを更新（コンテンツ、色、URL、メタデータ）
        await updateStickyNoteProperties(note, task, settings);

        // 位置が大幅に変更された場合のみ更新
        if (Math.abs(note.x - pos.x) > 1 || Math.abs(note.y - pos.y) > 1) {
          // ノートが既にフレーム内にある場合（parentIdを持つ）、最初に削除する必要がある場合がある
          // または単に移動を試みる。失敗した場合、フレームから削除を試みる
          try {
             note.x = pos.x;
             note.y = pos.y;
             await withRetry(() => note.sync(), undefined, 'note.sync');
          } catch (e: any) {
             // エラーが子アイテムに関するものである場合、まず親から削除を試みる
             if (e.message && e.message.includes('child of another board item')) {
                 try {
                     // 1. note.parentIdを使用して切り離しを試みる（有効な場合）
                     await detachFromParent(note);
                     
                     // 2. ターゲットフレームがある場合、そこからも削除を試みる（note.parentIdが古い場合に備えて）
                     if (frame) {
                         try { await withRetry(() => frame.remove(note), undefined, 'frame.remove(fallback)'); } catch(e){}
                     }
                     
                     // 移動を再試行
                     note.x = pos.x;
                     note.y = pos.y;
                     await withRetry(() => note.sync(), undefined, 'note.sync(retry)');
                 } catch (retryError) {
                     console.error('フレームから削除した後もタスクの移動に失敗しました', retryError);
                 }
             } else {
                 throw e;
             }
          }
        }

        // 最後に、フレーム内にあることを保証
        if (frame) {
             try {
                 // note.parentIdが古い場合、ここで簡単に確認できない
                 // しかし、frame.addはほぼ冪等（既に子である場合、何もしないか最上部に移動する）
                 await withRetry(() => frame.add(note), undefined, 'frame.add');
             } catch (e) {}
        }
      }
    }

    // 5. 個人スケジュールの再編成（新機能）
    // この日付の個人ノートを検索（効率のためにフレームの子を使用）
    if (frame) {
        const children = await frame.getChildren();
        const personalNotes: any[] = [];
        
        for (const child of children) {
            if (child.type === 'sticky_note') {
                try {
                    const appType = await child.getMetadata('appType');
                    if (appType === PERSONAL_SCHEDULE_APP_TYPE) {
                        const noteDate = await child.getMetadata('date');
                        if (noteDate === date) {
                            personalNotes.push(child);
                        }
                    }
                } catch (e) {
                    // 無視
                }
            }
        }

        if (personalNotes.length > 0) {
            // Y位置でソートして相対的な順序を維持
            personalNotes.sort((a, b) => a.y - b.y);
            
            for (let i = 0; i < personalNotes.length; i++) {
                const note = personalNotes[i];
                const pos = await calculatePersonalSchedulePosition(date, i);
                
                // 必要に応じて位置とサイズを更新
                if (Math.abs(note.x - pos.x) > 1 || Math.abs(note.y - pos.y) > 1 || note.width !== PERSONAL_NOTE_WIDTH) {
                    note.x = pos.x;
                    note.y = pos.y;
                    note.width = PERSONAL_NOTE_WIDTH;
                    
                    try {
                        await withRetry(() => note.sync(), undefined, 'personalNote.sync');
                    } catch (e: any) {
                        if (e.message && e.message.includes('child of another board item')) {
                             try {
                                 await detachFromParent(note);
                                 
                                 // 移動を再試行
                                 note.x = pos.x;
                                 note.y = pos.y;
                                 note.width = PERSONAL_NOTE_WIDTH;
                                 await withRetry(() => note.sync(), undefined, 'personalNote.sync(retry)');
                             } catch (retryError) {
                                 console.error('フレームから削除した後も個人ノートの移動に失敗しました', retryError);
                             }
                         } else {
                            console.error('個人ノートの同期に失敗しました', e);
                         }
                    }
                }
            }
        }
    }
  } catch (error) {
    console.error('タスクの再編成中にエラーが発生しました:', error);
  } finally {
    debugService.endOperation();
  }
}

// Create a new task as a sticky note on the board
export async function createTask(task: Task, options?: { skipReorganize?: boolean }): Promise<Task> {
  try {
    // Calculate position based on date and settings
    const settings = await loadSettings();
    // Initial position (might be adjusted by reorganize)
    const position = await calculateTaskPosition(task, settings);

    // Format sticky note content
    const content = formatTaskContent(task, settings);

    const stickyNote = await withRetry<any>(() => miro.board.createStickyNote({
      content: content,
      x: position.x,
      y: position.y,
      width: 140,
      style: {
        fillColor: getTaskColor(task),
        fontSize: 14,
      },
    }), undefined, 'board.createStickyNote');
    
    // Update task ID with sticky note ID
    const taskWithId = { ...task, id: stickyNote.id };

    // Update properties using common helper (sets metadata, etc.)
    await updateStickyNoteProperties(stickyNote, taskWithId, settings);
    
    // Add to frame if exists (ensures visibility on top of frame)
    if (taskWithId.date) {
        const date = new Date(taskWithId.date);
        const frame = await getCalendarFrame(date.getFullYear(), date.getMonth());
        if (frame) {
            try {
                await withRetry(() => frame.add(stickyNote), undefined, 'frame.add(new)');
            } catch (e) {
                console.warn('Failed to add task to frame', e);
            }
        }
    }
    
    // Reorganize tasks on this date to prevent overlap
    if (taskWithId.date && !options?.skipReorganize) {
      await reorganizeTasksOnDate(taskWithId.date, taskWithId);
    }

    return taskWithId;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// Remove createExternalLinkIndicator function entirely
// async function createExternalLinkIndicator(stickyNote: any, url: string): Promise<void> { ... }

// ステータスに基づいてタスクの色を取得するヘルパー関数
function getTaskColor(task: Task): string {
  switch (task.status) {
    case 'Draft':
      return 'light_yellow';
    case 'Planned':
      return 'light_green';
    case 'Done':
      return 'gray';
    default:
      return 'light_yellow';
  }
}

// Load all tasks from the board
export async function loadTasks(): Promise<Task[]> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), undefined, 'board.get(sticky_note)');
    const tasks: Task[] = [];
    
    for (const note of stickyNotes) {
      const appType = await withRetry(() => note.getMetadata('appType'), undefined, 'note.getMetadata(appType)');
      if (appType === 'task') {
        const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY), undefined, 'note.getMetadata(task)');
        if (metadata) {
          const task = metadata as Task;
          // Self-healing: Ensure task ID matches note ID
          if (task.id !== note.id) {
             // console.warn(`Task ID mismatch: metadata=${task.id}, note=${note.id}. Using note ID.`);
             task.id = note.id;
          }
          tasks.push(task);
        }
      } else {
        // Fallback for backward compatibility or if appType wasn't set but TASK_METADATA_KEY exists
        const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY), undefined, 'note.getMetadata(task)');
        if (metadata) {
           const task = metadata as Task;
           // Self-healing: Ensure task ID matches note ID
           if (task.id !== note.id) {
              task.id = note.id;
           }
           tasks.push(task);
        }
      }
    }
    
    return tasks;
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
}

// Update an existing task
export async function updateTask(task: Task, providedSettings?: Settings): Promise<void> {
  try {
    let note: any = null;
    let oldTask: Task | null = null;

    // 1. Try to get by ID (Fastest)
    try {
        // Check if ID looks valid (Miro IDs are usually numeric strings)
        // If it starts with 'task-', it's a temp ID and we should skip direct get
        if (!task.id.startsWith('task-')) {
            const items = await withRetry<any[]>(() => miro.board.get({ id: task.id }), undefined, 'board.get(id)');
            if (items && items.length > 0) {
                note = items[0];
                const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY), undefined, 'note.getMetadata(task)');
                if (metadata) {
                    oldTask = metadata as Task;
                }
            }
        }
    } catch (e) {
        console.warn(`Failed to get task by ID ${task.id}, falling back to search`, e);
    }

    // 2. Fallback: Search by metadata (Slow but robust)
    if (!note) {
        console.log(`Task ${task.id} not found by ID, searching all sticky notes...`);
        const allNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), undefined, 'board.get(sticky_note)');
        for (const n of allNotes) {
            try {
                const metadata = await n.getMetadata(TASK_METADATA_KEY);
                if (metadata && (metadata as Task).id === task.id) {
                    note = n;
                    oldTask = metadata as Task;
                    console.log(`Found task ${task.id} on note ${note.id}`);
                    break;
                }
            } catch (e) {}
        }
    }
    
    if (note && oldTask) {
        // Update all properties using common helper
        const settings = providedSettings || await loadSettings();
        await updateStickyNoteProperties(note, task, settings);
        
        // CRITICAL FIX: If date changed, move to new frame immediately
        // This ensures reorganizeTasksOnDate finds it via frame.getChildren()
        if (task.date && oldTask.date !== task.date) {
             const dateObj = new Date(task.date);
             const newFrame = await getCalendarFrame(dateObj.getFullYear(), dateObj.getMonth());
             if (newFrame) {
                 await withRetry(() => newFrame.add(note), undefined, 'frame.add(new)');
             }
        }
        
        // Reorganize tasks on this date to prevent overlap
        // Also reorganize old date if date changed
        if (task.date) {
          await reorganizeTasksOnDate(task.date, task);
        }
        if (oldTask.date && oldTask.date !== task.date) {
          await reorganizeTasksOnDate(oldTask.date);
        }
        
        return;
    }
    
    throw new Error(`Task with id ${task.id} not found`);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// Remove updateExternalLinkIndicator function entirely
// async function updateExternalLinkIndicator(stickyNote: any, task: Task): Promise<void> { ... }

// Delete a task
export async function deleteTask(taskId: string): Promise<void> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    
    for (const note of stickyNotes) {
      const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
      if (metadata && (metadata as Task).id === taskId) {
        const task = metadata as Task;
        
        // Remove associated link indicators using the helper function
        await removeExistingLinkShapes(taskId);
        
        // Remove the sticky note
        await withRetry(() => miro.board.remove(note));
        
        // Reorganize remaining tasks on this date
        if (task.date) {
          await reorganizeTasksOnDate(task.date);
        }
        
        return;
      }
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

// Get a single task by ID
export async function getTask(taskId: string): Promise<Task | null> {
  try {
    // 1. Try direct ID access first (Fastest)
    if (!taskId.startsWith('task-')) {
        try {
            const items = await withRetry<any[]>(() => miro.board.get({ id: taskId }), undefined, 'board.get(id)');
            if (items && items.length > 0) {
                const note = items[0];
                const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY), undefined, 'note.getMetadata(task)');
                if (metadata) {
                    const task = metadata as Task;
                    // Self-healing
                    if (task.id !== note.id) {
                        task.id = note.id;
                    }
                    return task;
                }
            }
        } catch (e) {
            console.warn(`Failed to get task by ID ${taskId}, falling back to search`, e);
        }
    }

    // 2. Fallback: Search all notes
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), undefined, 'board.get(sticky_note)');
    
    for (const note of stickyNotes) {
      const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY), undefined, 'note.getMetadata(task)');
      if (metadata && (metadata as Task).id === taskId) {
        const task = metadata as Task;
        // Self-healing
        if (task.id !== note.id) {
            task.id = note.id;
        }
        return task;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting task:', error);
    return null;
  }
}

// Bulk update tasks
export async function bulkUpdateTasks(tasksToUpdate: Task[]): Promise<void> {
  try {
    const settings = await loadSettings();
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    const affectedDates = new Set<string>();
    
    // Create a map of taskId -> note to avoid O(N^2) lookups
    const taskNoteMap = new Map<string, any>();
    
    // We need to read metadata from all notes to build the map
    for (const note of stickyNotes) {
        try {
            // Use a simpler check if possible, or just try to get task metadata directly
            // Getting metadata is an API call, so we want to minimize it.
            // However, we don't know which notes are tasks without checking.
            // Optimization: Check if it has our specific metadata key first if possible? 
            // Miro SDK doesn't support "hasMetadata".
            
            const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
            if (metadata && (metadata as Task).id) {
                taskNoteMap.set((metadata as Task).id, note);
            }
        } catch (e) {
            // ignore
        }
    }

    for (const task of tasksToUpdate) {
        const note = taskNoteMap.get(task.id);
        if (note) {
            // Get old task to check for date change
            const oldTask = await withRetry(() => note.getMetadata(TASK_METADATA_KEY)) as Task;
            
            if (oldTask.date) affectedDates.add(oldTask.date);
            if (task.date) affectedDates.add(task.date);

            await updateStickyNoteProperties(note, task, settings);
        }
    }

    // Reorganize affected dates efficiently
    // Instead of calling reorganizeTasksOnDate (which fetches all notes), we use the notes we already have if possible.
    // But reorganizeTasksOnDate needs ALL notes for that date to calculate positions correctly.
    // So we must fetch notes. But we can optimize by fetching ONCE if we rewrite the logic.
    // For now, let's just add a delay to avoid rate limits.
    for (const date of affectedDates) {
        await sleep(200); // Add delay between date reorganizations
        await reorganizeTasksOnDate(date);
    }

  } catch (error) {
    console.error('Error in bulk update:', error);
    throw error;
  }
}

// Bulk delete tasks
export async function bulkDeleteTasks(taskIds: string[]): Promise<void> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    const allShapes = await withRetry<any[]>(() => miro.board.get({ type: 'shape' }));
    const allTexts = await withRetry<any[]>(() => miro.board.get({ type: 'text' }));
    
    const affectedDates = new Set<string>();
    const itemsToRemove: any[] = [];
    const taskIdsSet = new Set(taskIds);

    // Find notes to delete
    for (const note of stickyNotes) {
        try {
            const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
            if (metadata && (metadata as Task).id && taskIdsSet.has((metadata as Task).id)) {
                const task = metadata as Task;
                itemsToRemove.push(note);
                if (task.date) affectedDates.add(task.date);
            }
        } catch (e) {
            // ignore
        }
    }
    
    // Find links to delete
    for (const shape of allShapes) {
        try {
            const appType = await withRetry(() => shape.getMetadata('appType'));
            const linkedTaskId = await withRetry(() => shape.getMetadata('taskId'));
            if (appType === 'taskLink' && linkedTaskId && typeof linkedTaskId === 'string' && taskIdsSet.has(linkedTaskId)) {
                itemsToRemove.push(shape);
            }
        } catch (e) {}
    }
    
    for (const text of allTexts) {
        try {
            const appType = await withRetry(() => text.getMetadata('appType'));
            const linkedTaskId = await withRetry(() => text.getMetadata('taskId'));
            if (appType === 'taskLink' && linkedTaskId && typeof linkedTaskId === 'string' && taskIdsSet.has(linkedTaskId)) {
                itemsToRemove.push(text);
            }
        } catch (e) {}
    }

    // Delete all items
    for (const item of itemsToRemove) {
        await withRetry(() => miro.board.remove(item));
    }

    // Reorganize affected dates
    for (const date of affectedDates) {
        await reorganizeTasksOnDate(date);
    }

  } catch (error) {
    console.error('Error in bulk delete:', error);
    throw error;
  }
}

// Render personal schedules for a month
export async function renderPersonalSchedulesForMonth(yearMonth: string, signal?: AbortSignal): Promise<void> {
  try {
    const settings = await loadSettings();
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;

    // 1. Get all existing personal schedule notes
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), signal);
    const existingNotes = [];
    
    for (const note of stickyNotes) {
      try {
        const appType = await withRetry(() => note.getMetadata('appType'), signal);
        if (appType === PERSONAL_SCHEDULE_APP_TYPE) {
          const noteDate = await withRetry<string>(() => note.getMetadata('date'), signal);
          if (noteDate && typeof noteDate === 'string' && noteDate.startsWith(yearMonth)) {
            existingNotes.push(note);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 2. Delete existing notes for this month (simpler than update for now)
    for (const note of existingNotes) {
      if (signal?.aborted) throw new Error('Operation cancelled');
      await withRetry(() => miro.board.remove(note), signal);
    }

    // 3. Group schedules by date and user
    const schedulesByDateAndUser = new Map<string, Map<string, any[]>>();
    
    if (settings.personalSchedules) {
      for (const [devId, schedules] of Object.entries(settings.personalSchedules)) {
        for (const schedule of schedules) {
          if (schedule.date.startsWith(yearMonth)) {
            if (!schedulesByDateAndUser.has(schedule.date)) {
              schedulesByDateAndUser.set(schedule.date, new Map());
            }
            const dateMap = schedulesByDateAndUser.get(schedule.date)!;
            if (!dateMap.has(devId)) {
              dateMap.set(devId, []);
            }
            dateMap.get(devId)!.push(schedule);
          }
        }
      }
    }

    // 4. Create new notes
    const frame = await withRetry(() => getCalendarFrame(year, month), signal);
    
    for (const [date, userMap] of schedulesByDateAndUser.entries()) {
      let userIndex = 0;
      for (const [devId, schedules] of userMap.entries()) {
        if (signal?.aborted) throw new Error('Operation cancelled');
        
        const dev = settings.devs.find(d => d.id === devId);
        const devName = dev ? dev.name : 'Unknown';
        const role = dev && dev.roleId ? settings.roles.find(r => r.id === dev.roleId)?.name : '';
        
        // Format content
        const lines = [`<strong>${devName}</strong> ${role ? `(${role})` : ''}`];
        
        // Sort schedules by time
        schedules.sort((a, b) => {
            if (a.type === 'fullDayOff') return -1;
            if (b.type === 'fullDayOff') return 1;
            return (a.start || '').localeCompare(b.start || '');
        });

        for (const sch of schedules) {
          if (sch.type === 'fullDayOff') {
            lines.push('終日休暇');
          } else if (sch.type === 'partial' || sch.type === 'nonAgileTask' || sch.type === 'personalErrand') {
             const timeRange = sch.start && sch.end ? `${sch.start}-${sch.end}` : '';
             lines.push(`${timeRange} ${sch.reason || ''}`);
          }
        }
        
        const content = `<p>${lines.join('<br>')}</p>`;
        const position = await calculatePersonalSchedulePosition(date, userIndex);
        
        const note = await withRetry<any>(() => miro.board.createStickyNote({
          content,
          x: position.x,
          y: position.y,
          shape: 'rectangle',
          width: PERSONAL_NOTE_WIDTH, // Fit in right column (2 columns)
          style: {
            fillColor: 'gray', // Distinct color for personal
            fontSize: 10, // Smaller font to fit content
            textAlign: 'left'
          }
        }), signal);
        
        await withRetry(() => note.setMetadata('appType', PERSONAL_SCHEDULE_APP_TYPE), signal);
        await withRetry(() => note.setMetadata('date', date), signal);
        
        if (frame) {
          try {
            await withRetry(() => frame.add(note), signal);
          } catch (e) {}
        }
        
        userIndex++;
      }
    }

  } catch (error) {
    console.error('Error rendering personal schedules:', error);
  }
}

// Rearrange all tasks for a specific month
export async function rearrangeTasksForMonth(yearMonth: string, signal?: AbortSignal): Promise<void> {
  const settings = await loadSettings();
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed month
  
  // 1. Get all sticky notes ONCE
  const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), signal);
  const tasksByDate = new Map<string, { note: any, task: Task }[]>();
  
  for (const note of stickyNotes) {
    const metadata = await note.getMetadata(TASK_METADATA_KEY);
    if (metadata) {
      const task = metadata as Task;
      if (task.date && task.date.startsWith(yearMonth)) {
        if (!tasksByDate.has(task.date)) {
          tasksByDate.set(task.date, []);
        }
        tasksByDate.get(task.date)!.push({ note, task });
      }
    }
  }

  // Optimization: Bulk remove all legacy link shapes for the entire board (or just this month's tasks)
  // To be safe and simple, let's fetch all shapes/texts once and remove any that are 'taskLink'
  // This avoids calling removeExistingLinkShapes inside the loop which is very expensive
  try {
      const allShapes = await withRetry<any[]>(() => miro.board.get({ type: 'shape' }), signal);
      const allTexts = await withRetry<any[]>(() => miro.board.get({ type: 'text' }), signal);
      
      const itemsToRemove = [];
      
      for (const shape of allShapes) {
          const appType = await shape.getMetadata('appType');
          if (appType === 'taskLink') itemsToRemove.push(shape);
      }
      for (const text of allTexts) {
          const appType = await text.getMetadata('appType');
          if (appType === 'taskLink') itemsToRemove.push(text);
      }
      
      // Remove in batches to avoid rate limits
      for (const item of itemsToRemove) {
          if (signal?.aborted) throw new Error('Operation cancelled');
          await withRetry(() => miro.board.remove(item), signal);
      }
  } catch (e) {
      console.warn('Failed to cleanup legacy links', e);
  }
  
  // 2. Process each date
  const frame = await withRetry(() => getCalendarFrame(year, month), signal);

  for (const [date, dateNotes] of tasksByDate.entries()) {
     if (signal?.aborted) throw new Error('Operation cancelled');
     
     // Add delay to avoid rate limits
     await sleep(100);

     const tasks = dateNotes.map(dn => dn.task);
     const newPositions = await calculateTaskPositionsForDate(date, tasks);
     
     for (const { note, task } of dateNotes) {
        if (signal?.aborted) throw new Error('Operation cancelled');

        const pos = newPositions.get(task.id);
        if (pos) {
            // Update properties (content, url, etc.)
            // Skip link cleanup because we did it in bulk
            await withRetry(() => updateStickyNoteProperties(note, task, settings, true), signal);

            if (Math.abs(note.x - pos.x) > 1 || Math.abs(note.y - pos.y) > 1) {
                try {
                    note.x = pos.x;
                    note.y = pos.y;
                    await withRetry(() => note.sync(), signal);
                } catch (e: any) {
                    if (e.message && e.message.includes('child of another board item')) {
                        try {
                            // Detach from old parent first
                            await detachFromParent(note, signal);
                            
                            // Move to new position
                            note.x = pos.x;
                            note.y = pos.y;
                            await withRetry(() => note.sync(), signal);
                            
                            // Add to new frame
                            if (frame) {
                                await withRetry(() => frame.add(note), signal);
                            }
                        } catch (retryError) {
                            console.error('Failed to move task in rearrange', retryError);
                        }
                    }
                }
            }

            if (frame) {
                try { await withRetry(() => frame.add(note), signal); } catch (e) {}
            }
        }
     }
  }
  
  // Render personal schedules
  await renderPersonalSchedulesForMonth(yearMonth, signal);
}
