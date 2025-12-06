import { Settings, DailyTrackAssignment } from '../models/types';

/**
 * 過去のペアリング回数を集計する
 */
const calculatePairingCounts = (settings: Settings): Map<string, Map<string, number>> => {
  const counts = new Map<string, Map<string, number>>();

  // 全開発者のエントリを初期化
  settings.devs.forEach(dev => {
    counts.set(dev.id, new Map());
    settings.devs.forEach(partner => {
      if (dev.id !== partner.id) {
        counts.get(dev.id)!.set(partner.id, 0);
      }
    });
  });

  // 履歴から集計
  Object.values(settings.dailyTrackAssignments).forEach(assignment => {
    Object.values(assignment).forEach(devIds => {
      // 同じトラックにいるメンバー同士のカウントを増やす
      for (let i = 0; i < devIds.length; i++) {
        for (let j = i + 1; j < devIds.length; j++) {
          const dev1 = devIds[i];
          const dev2 = devIds[j];

          if (counts.has(dev1)) {
            const dev1Counts = counts.get(dev1)!;
            dev1Counts.set(dev2, (dev1Counts.get(dev2) || 0) + 1);
          }
          if (counts.has(dev2)) {
            const dev2Counts = counts.get(dev2)!;
            dev2Counts.set(dev1, (dev2Counts.get(dev1) || 0) + 1);
          }
        }
      }
    });
  });

  return counts;
};

/**
 * 指定された日付の自動割り当てを生成する
 */
export const generateAutoAssignment = (
  date: string,
  settings: Settings,
  currentAssignment: DailyTrackAssignment
): DailyTrackAssignment => {
  const pairingCounts = calculatePairingCounts(settings);
  const newAssignment: DailyTrackAssignment = JSON.parse(JSON.stringify(currentAssignment));

  // 1. 利用可能な開発者を特定
  // 休暇などのチェックはここでは簡易的に、settings.personalSchedulesを見る必要があるが、
  // 今回の要件では「手動操作のあとに自動アサイン」なので、
  // UI上で「未割り当て」として表示されている人を対象にするのが自然。
  // しかし、ロジックとしては「まだ割り当てられていないアクティブな開発者」を対象にする。

  const assignedDevIds = new Set<string>();
  Object.entries(newAssignment).forEach(([key, ids]) => {
    if (key !== 'absent') {
      ids.forEach(id => assignedDevIds.add(id));
    }
  });

  // 休暇でない、かつ未割り当ての開発者を取得
  // 'absent' に割り当てられている人も除外する
  const absentDevIds = new Set(newAssignment['absent'] || []);

  const availableDevs = settings.devs.filter(dev => {
    if (assignedDevIds.has(dev.id)) return false;
    if (absentDevIds.has(dev.id)) return false;
    
    // 休暇チェック (personalSchedules)
    const schedules = settings.personalSchedules[dev.id] || [];
    const isOff = schedules.some(s => s.date === date && s.type === 'fullDayOff');
    return !isOff;
  });

  // 2. トラックへの割り当て
  // アクティブなトラックを取得（順序は設定順を維持＝Track1, Track2...の順と仮定）
  const activeTracks = settings.tracks.filter(t => t.active);
  
  // 利用可能な開発者をリスト化（操作用にコピー）
  let remainingDevs = [...availableDevs];

  // トラック順に埋めていく
  for (const track of activeTracks) {
    if (remainingDevs.length === 0) break;

    // 現在のトラックのメンバー
    if (!newAssignment[track.id]) {
      newAssignment[track.id] = [];
    }
    const currentMembers = newAssignment[track.id];
    
    // このトラックに必要な人数
    const capacity = track.capacity;
    let slotsNeeded = capacity - currentMembers.length;

    if (slotsNeeded <= 0) continue;

    // 必要な人数分だけ補充
    while (slotsNeeded > 0 && remainingDevs.length > 0) {
      // 候補者を選ぶ
      let bestDevIndex = -1;
      
      // トラックに既にメンバーがいる場合、そのメンバーとの相性を考慮
      if (currentMembers.length > 0) {
        // 既存メンバーとのペアリング回数が最小の人を探す
        let minScore = Infinity;
        
        // 候補者全員をチェック
        // ランダム性を出すためにシャッフルしてからチェック
        const candidateIndices = Array.from({ length: remainingDevs.length }, (_, i) => i)
          .sort(() => Math.random() - 0.5);

        for (const index of candidateIndices) {
          const dev = remainingDevs[index];
          let score = 0;
          
          // 既存メンバー全員とのスコア合計
          for (const memberId of currentMembers) {
            score += pairingCounts.get(dev.id)?.get(memberId) || 0;
          }

          if (score < minScore) {
            minScore = score;
            bestDevIndex = index;
          }
        }
      } else {
        // トラックが空の場合
        // 1人目はランダムに選ぶ（まだペアが決まっていないので誰でもいい）
        bestDevIndex = Math.floor(Math.random() * remainingDevs.length);
      }

      if (bestDevIndex !== -1) {
        const selectedDev = remainingDevs[bestDevIndex];
        // 割り当て
        newAssignment[track.id].push(selectedDev.id);
        // リストから削除
        remainingDevs.splice(bestDevIndex, 1);
        // トラックのメンバーが増えたので更新（ループ内の判定用）
        // newAssignment[track.id]は参照なのでpush済みだが、currentMembers変数も更新しておく必要があるか？
        // currentMembersはnewAssignment[track.id]への参照なので、pushで更新されているはず。
      }
      
      slotsNeeded--;
    }
  }

  return newAssignment;
};

/**
 * 前日の割り当てをコピーする（一人だけ残すなどのロジックはUI側で制御するか、ここでオプションとして受け取る）
 * ここでは単純なコピーを提供
 */
export const copyPreviousDayAssignment = (
  targetDate: string,
  settings: Settings
): DailyTrackAssignment | null => {
  // 日付文字列の比較で前日を探すのは大変なので、settings.dailyTrackAssignmentsのキーから
  // targetDateより小さい最大の日付を探す
  const dates = Object.keys(settings.dailyTrackAssignments).sort();
  const targetIndex = dates.indexOf(targetDate);
  
  let prevDate: string | null = null;
  
  if (targetIndex > 0) {
    prevDate = dates[targetIndex - 1];
  } else {
    // targetDateがキーにない場合、それより前の日付を探す
    const prevDates = dates.filter(d => d < targetDate);
    if (prevDates.length > 0) {
      prevDate = prevDates[prevDates.length - 1];
    }
  }

  if (prevDate) {
    return JSON.parse(JSON.stringify(settings.dailyTrackAssignments[prevDate]));
  }
  
  return null;
};
