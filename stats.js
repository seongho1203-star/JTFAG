// 📊 [AI 전담 기록용] 차수별 상세 스코어 기록
//
// ▸ 스코어카드를 판독해 차수별로 항목을 추가한다. 키는 차수 번호 문자열.
// ▸ 같은 차수를 다시 등록하면 덮어쓰므로 중복 집계되지 않는다.
// ▸ 아래 CUMULATIVE_STATS(누적 총합)는 자동 계산되므로 직접 고치지 말 것.
// ▸ doublePar(양파) = 파의 2배 타수를 친 홀. 파4에서 8타, 파3에서 6타.
//
// "1-3"은 차수별 원본 스코어카드가 남아있지 않아 1~3차전을 합산해 보관한 값이다.
// 나중에 개별 스코어카드를 확보하면 "1"/"2"/"3"으로 나누고 이 항목을 지우면 된다.

const ROUND_STATS = {
    "1-3": {
        "이관교": { holeInOne: 0, eagle: 0, birdie: 4, par: 13, doublePar: 1 },
        "김지명": { holeInOne: 0, eagle: 0, birdie: 4, par: 18, doublePar: 1 },
        "신성호": { holeInOne: 0, eagle: 0, birdie: 3, par: 20, doublePar: 0 },
        "박승수": { holeInOne: 0, eagle: 0, birdie: 3, par: 12, doublePar: 2 }
    },

    // 4차전 · 해피니스(힐링-하트) — 스코어카드 판독
    "4": {
        "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 5, doublePar: 0 },
        "김지명": { holeInOne: 0, eagle: 0, birdie: 1, par: 5, doublePar: 0 },
        "신성호": { holeInOne: 0, eagle: 0, birdie: 1, par: 3, doublePar: 0 },
        "박승수": { holeInOne: 0, eagle: 0, birdie: 1, par: 3, doublePar: 0 }
    }
};

// 차수별 기록을 합산한 누적 총합. calc.js와 ui.js가 이 값을 그대로 사용한다.
// stats.js는 api.js보다 먼저 로드되므로 golfers 상수에 의존하지 않고
// ROUND_STATS에 등장하는 이름만으로 집계한다.
const CUMULATIVE_STATS = (function () {
    const FIELDS = ["holeInOne", "eagle", "birdie", "par", "doublePar"];
    const total = {};
    Object.keys(ROUND_STATS).forEach(function (round) {
        const record = ROUND_STATS[round];
        Object.keys(record).forEach(function (name) {
            if (!total[name]) {
                total[name] = {};
                FIELDS.forEach(function (f) { total[name][f] = 0; });
            }
            FIELDS.forEach(function (f) { total[name][f] += (record[name][f] || 0); });
        });
    });
    return total;
})();
