// 📊 [AI 전담 기록용] 차수별 홀 단위 스코어 기록
//
// ▸ ROUND_HOLES 가 유일한 원본이다. 스코어카드를 판독해 여기에 차수를 추가한다.
// ▸ 아래 ROUND_STATS(차수별 집계)와 CUMULATIVE_STATS(누적 총합)는 자동 계산된다.
//   두 값은 직접 고치지 말 것.
// ▸ 같은 차수를 다시 등록하면 덮어쓰므로 중복 집계되지 않는다.
//
// [기록 형식]
//   par : 18홀의 파. 앞 9홀 + 뒤 9홀 순서.
//   rel : 파 대비 타수. 0=파, -1=버디, -2=이글, 1=보기, 2=더블보기.
//         (앱 스코어카드의 🦋 표시가 -1이다)
//   실제 타수 = par + rel. 18홀 합계가 그 차수의 그로스 스코어가 된다.
//
// [집계 기준]
//   holeInOne : 1타로 끝낸 홀. 파3 홀인원은 이글에도 함께 잡힌다.
//   doublePar : 파의 2배 이상 친 홀(양파). 파4에서 8타, 파3에서 6타.

const ROUND_HOLES = {
    "1": {
        course: "함평엘리체 (임페리얼-마제스티)",
        par: [4, 5, 4, 3, 5, 4, 3, 4, 4,   5, 4, 3, 4, 4, 3, 4, 5, 4],
        rel: {
            "이관교": [0, 3, 1, -1, 2, 0, 1, 1, 1,   2, 1, 2, 1, 2, 0, 0, -1, 3],
            "김지명": [0, 2, 0, 0, 1, 1, 1, 1, 0,   0, 1, 0, 2, 1, 0, 2, 1, 2],
            "신성호": [1, -1, 1, 2, 0, 0, 0, 1, 1,   0, 1, 2, 1, 0, 1, 1, 4, 1],
            "박승수": [3, 1, 3, 0, 3, 2, 2, 1, 1,   0, 2, 1, 1, 0, 0, 3, -1, 2]
        }
    },

    "2": {
        course: "함평엘리체 (마제스티-펠리스)",
        par: [5, 4, 3, 4, 4, 3, 4, 5, 4,   4, 3, 5, 4, 3, 4, 4, 5, 4],
        rel: {
            "이관교": [0, 2, 0, 1, 1, 1, -1, 0, 1,   1, 0, 1, 0, 1, 1, 0, 0, 2],
            "김지명": [1, 1, 0, 0, -1, 3, 0, 3, 1,   0, 2, 0, 1, 0, 0, 1, 1, 2],
            "신성호": [1, -1, 1, 1, 1, 1, 2, 1, 1,   2, 0, 0, 0, 2, 0, 0, 0, 1],
            "박승수": [2, 1, 1, 1, 2, 2, 0, 0, 1,   1, 1, 1, 2, 2, 2, -1, 3, 3]
        }
    },

    "3": {
        course: "어등산 (하남-어등)",
        par: [4, 4, 5, 3, 4, 4, 3, 5, 4,   4, 4, 3, 4, 5, 4, 4, 3, 5],
        rel: {
            "이관교": [2, 2, 2, 0, 2, 1, 1, 3, 1,   1, 1, 1, -1, 1, 2, 4, 0, 2],
            "김지명": [-1, 1, -1, 2, 1, 2, 1, 0, -1,   1, 1, 0, 2, 4, 0, 1, 1, 0],
            "신성호": [2, 0, 0, 2, 1, 0, -1, 0, 0,   1, 2, 0, 2, 0, 3, 0, 1, 0],
            "박승수": [1, 1, 0, 0, 4, 1, 1, 0, 0,   1, 0, 0, -1, 1, 1, 1, 3, 2]
        }
    },

    "4": {
        course: "해피니스 (힐링-하트)",
        par: [4, 4, 3, 4, 4, 5, 3, 4, 5,   4, 3, 4, 5, 4, 4, 5, 3, 4],
        rel: {
            "이관교": [1, 0, 0, 2, 1, 3, 1, 1, 1,   1, 0, 0, 1, 3, 2, 1, 0, 2],
            "김지명": [-1, 2, 1, 1, 1, 0, 1, 0, 1,   0, 1, 1, 0, 1, 1, 2, 0, 2],
            "신성호": [1, 2, 1, 1, 3, 1, 1, 1, 0,   2, 0, 2, 3, 1, -1, 0, 1, 2],
            "박승수": [1, 1, 1, 1, 0, 1, 1, 0, 1,   -1, 2, 1, 3, 1, 2, 2, 1, 0]
        }
    }
};

// 홀 기록이 없는 차수는 여기에 개수만 직접 넣는다. (형식은 ROUND_STATS와 동일)
const ROUND_STATS_MANUAL = {};

// 홀 기록 → 차수별 집계
const ROUND_STATS = (function () {
    const result = {};
    Object.keys(ROUND_HOLES).forEach(function (round) {
        const par = ROUND_HOLES[round].par;
        const rel = ROUND_HOLES[round].rel;
        result[round] = {};
        Object.keys(rel).forEach(function (name) {
            const t = { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 };
            rel[name].forEach(function (x, i) {
                const p = par[i];
                if (x === 1 - p) t.holeInOne++;
                if (x === -2) t.eagle++;
                else if (x === -1) t.birdie++;
                else if (x === 0) t.par++;
                if (x >= p) t.doublePar++;
            });
            result[round][name] = t;
        });
    });
    Object.keys(ROUND_STATS_MANUAL).forEach(function (round) {
        result[round] = ROUND_STATS_MANUAL[round];
    });
    return result;
})();

// 차수별 집계 → 누적 총합. calc.js와 ui.js가 이 값을 그대로 사용한다.
// stats.js는 api.js보다 먼저 로드되므로 golfers 상수에 의존하지 않고
// 기록에 등장하는 이름만으로 집계한다.
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
