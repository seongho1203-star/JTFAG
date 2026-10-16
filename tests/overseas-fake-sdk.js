// overseas-scorecard.js가 쓰는 가짜 @anthropic-ai/sdk. 사진 대신 태그 글자가 온다.
// 가짜 9홀 화면. 영문 이름은 일부러 철자·순서를 제각각으로 둔다.
const PAR_F = [4, 4, 5, 3, 4, 3, 5, 4, 4];     // 36
const PAR_B = [4, 5, 3, 4, 4, 4, 3, 5, 4];     // 36
const ST = {
    F: { 'LEE KWANKYO': [5, 4, 6, 3, 5, 4, 6, 5, 4], 'Jimyung Kim': [4, 4, 5, 4, 4, 3, 5, 4, 5], 'SHIN S.': [6, 5, 5, 3, 4, 3, 6, 4, 4], 'seungsu PARK': [5, 4, 5, 3, 5, 3, 5, 4, 4] },
    B: { 'LEE KWANKYO': [4, 6, 3, 5, 5, 4, 4, 5, 4], 'Jimyung Kim': [4, 5, 4, 4, 4, 5, 3, 5, 4], 'SHIN S.': [5, 5, 3, 4, 5, 4, 3, 6, 4], 'seungsu PARK': [4, 5, 3, 4, 4, 4, 4, 5, 5] }
};

function half(tag) {
    const h = tag.startsWith('B') ? 'B' : 'F';
    const players = Object.entries(ST[h]).map(([name, strokes]) => ({ name, strokes: strokes.slice() }));
    const out = { course: '', firstHole: h === 'F' ? 1 : 10, playerCount: players.length, par: (h === 'F' ? PAR_F : PAR_B).slice(), players };
    if (tag.includes('blank')) out.players[1].strokes[3] = 0;
    return out;
}

// ── 가짜 SDK: 사진 대신 태그 글자가 온다. 'flaky'는 첫 판독만 한 칸을 틀리고, 'chaos'는 매번 다르게 틀린다.
const calls = {};
module.exports = class Anthropic {
        constructor() {
            this.messages = { create: async ({ messages }) => {
                const tag = Buffer.from(messages[0].content[0].source.data, 'base64').toString();
                calls[tag] = (calls[tag] || 0) + 1;
                const r = half(tag);
                if (tag.includes('flaky') && calls[tag] === 1) r.players[0].strokes[0] += 1;
                if (tag.includes('chaos')) r.players[0].strokes[0] += calls[tag];
                return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(r) }] };
            } };
        }
};

