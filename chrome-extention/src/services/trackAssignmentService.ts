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
  const assignedDevIds = new Set<string>();
  Object.entries(newAssignment).forEach(([key, ids]) => {
    if (key !== 'absent') {
      ids.forEach(id => assignedDevIds.add(id));
    }
  });

  // 休暇でない、かつ未割り当ての開発者を取得
  const absentDevIds = new Set(newAssignment['absent'] || []);

  const availableDevs = settings.devs.filter(dev => {
    if (assignedDevIds.has(dev.id)) return false;
    if (absentDevIds.has(dev.id)) return false;

    // Role check: Only assign Devs
    const role = settings.roles.find(r => r.id === dev.roleId);
    if (!role || (role.name !== 'Dev' && role.id !== 'role-dev')) return false;
    
    // 休暇チェック (personalSchedules)
    const schedules = settings.personalSchedules[dev.id] || [];
    const isOff = schedules.some(s => s.date === date && s.type === 'fullDayOff');
    return !isOff;
  });

  // 2. トラックへの割り当て
  const activeTracks = settings.tracks.filter(t => t.active);
  
  let remainingDevs = [...availableDevs];

  // トラック順に埋めていく
  for (const track of activeTracks) {
    if (remainingDevs.length === 0) break;

    if (!newAssignment[track.id]) {
      newAssignment[track.id] = [];
    }
    const currentMembers = newAssignment[track.id];
    
    const capacity = track.capacity;
    let slotsNeeded = capacity - currentMembers.length;

    if (slotsNeeded <= 0) continue;

    while (slotsNeeded > 0 && remainingDevs.length > 0) {
      let bestDevIndex = -1;
      
      if (currentMembers.length > 0) {
        let minScore = Infinity;
        
        const candidateIndices = Array.from({ length: remainingDevs.length }, (_, i) => i)
          .sort(() => Math.random() - 0.5);

        for (const index of candidateIndices) {
          const dev = remainingDevs[index];
          let score = 0;
          
          for (const memberId of currentMembers) {
            score += pairingCounts.get(dev.id)?.get(memberId) || 0;
          }

          if (score < minScore) {
            minScore = score;
            bestDevIndex = index;
          }
        }
      } else {
        bestDevIndex = Math.floor(Math.random() * remainingDevs.length);
      }

      if (bestDevIndex !== -1) {
        const selectedDev = remainingDevs[bestDevIndex];
        newAssignment[track.id].push(selectedDev.id);
        remainingDevs.splice(bestDevIndex, 1);
      }
      
      slotsNeeded--;
    }
  }

  return newAssignment;
};

/**
 * 前日の割り当てをコピーする
 */
export const copyPreviousDayAssignment = (
  targetDate: string,
  settings: Settings
): DailyTrackAssignment | null => {
  const dates = Object.keys(settings.dailyTrackAssignments).sort();
  const targetIndex = dates.indexOf(targetDate);
  
  let prevDate: string | null = null;
  
  if (targetIndex > 0) {
    prevDate = dates[targetIndex - 1];
  } else {
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
