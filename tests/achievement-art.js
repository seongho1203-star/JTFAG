// node tests/achievement-art.js — artwork coverage, mobile crop bounds, and image cache behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const store = new Map();
const ctx = vm.createContext({console, Map, golfers: [], escapeHtml: value => String(value), localStorage: {getItem: key => store.get(key) || null}});
['achievement-art.js', 'badges.js', 'ui-awards.js'].forEach(file => vm.runInContext(source(file), ctx, {filename: file}));
const run = code => vm.runInContext(code, ctx);
const defs = JSON.parse(run('JSON.stringify(BADGE_GROUPS.flatMap(group => group.badges).map(({id,kind})=>({id,kind})))'));
const atlases = JSON.parse(run('JSON.stringify(ACHIEVEMENT_ATLASES)'));
const badges = JSON.parse(run('JSON.stringify(ACHIEVEMENT_BADGE_ART)'));
const trophies = JSON.parse(run('JSON.stringify(ACHIEVEMENT_TROPHY_ART)'));
assert.equal(defs.length, 51);
assert.equal(Object.keys(badges).length, 61);
assert.equal(Object.keys(trophies).length, 10);
const butterflyKeys = ['firstBirdie','multiBirdie','tripleBirdie','backToBack','birdies:1','birdies:2','birdies:3','birdie1'];
const butterflyAtlas = atlases.findIndex(a=>a.file==='assets/achievements/v2/birdie-butterflies.webp');
assert.ok(butterflyAtlas>=0,'The corrected butterfly artwork has a distinct asset URL');
for (const [id,rect] of Object.entries(badges)) {
    assert.equal(rect[0]===butterflyAtlas,butterflyKeys.includes(id),id+' uses its intended artwork');
}
for (const def of defs) {
    for (let level = 1; level <= (def.kind === 'tier' ? 3 : 1); level++) {
        const key = def.kind === 'tier' ? `${def.id}:${level}` : def.id;
        assert.ok(badges[key], `Missing artwork: ${key}`);
        assert.match(run(`achievementArt('badge', '${def.id}', 64, ${level})`), new RegExp(`data-achievement-id="${key}"`));
    }
}
for (const [id, rect] of Object.entries({...badges, ...Object.fromEntries(Object.entries(trophies).map(([id,r])=>['trophy:'+id,r]))})) {
    const [index,x,y,width,height] = rect, atlas = atlases[index];
    assert.ok(width > 0 && height > 0 && x >= 0 && y >= 0 && x + width <= atlas.width && y + height <= atlas.height, id);
}
for (const atlas of atlases) {
    const bytes = fs.readFileSync(path.join(root, atlas.file));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X');
    assert.ok(bytes[20] & 0x10, `${atlas.file} must retain alpha`);
    assert.equal(bytes.readUIntLE(24, 3) + 1, atlas.width);
    assert.equal(bytes.readUIntLE(27, 3) + 1, atlas.height);
}
assert.match(run("achievementArt('badge','birdies',64,0)"), /birdies:1/);
assert.match(run("achievementArt('badge','birdies',64,99)"), /birdies:3/);
for(const id of ['firstBirdie','multiBirdie','tripleBirdie','backToBack','birdie1']) {
    assert.match(run(`achievementArt('badge','${id}',128)`),/v2\/birdie-butterflies\.webp/);
}
assert.equal(run("achievementArt('badge','missing')"), '');
for (const id of Object.keys(trophies)) assert.match(run(`awSvg('${id}', 92)`), /data-achievement-kind="trophy"/);
assert.match(run('AW_CUP'), /data-achievement-id="grand"/);
assert.match(run('AW_CROWN'), /data-achievement-id="grand"/);
for (const def of defs) {
    ctx.testId = def.id;
    assert.match(run(`(() => {const def=BADGE_GROUPS.flatMap(g=>g.badges).find(d=>d.id===testId);return badgeTileHtml({def,earned:false,level:0,value:0,next:def.steps&&def.steps[0],holders:[],round:-1},-1,'preview');})()`), /bdg-medal illustrated/);
}
assert.ok(source('index.html').indexOf('achievement-art.js?ver=') < source('index.html').indexOf('badges.js?ver='));
console.log('PASS: all 61 badge illustrations and 10 trophies are mapped; alpha, atlas bounds, levels and render entry points');

async function checkCache() {
    const entries = new Map(), handlers = {}, requests = [];
    let failNetwork = false, disableCache = false;
    const cache = {
        match: async url => entries.get(url)?.clone(),
        put: async (url,response) => entries.set(url,response.clone())
    };
    const sw = vm.createContext({Map, URL, Response, Promise, Number, console,
        self:{registration:{scope:'https://example.test/JTFAG/'},addEventListener:(type,fn)=>{handlers[type]=fn;}},
        caches:{open:async()=>{if(disableCache)throw Error('Storage unavailable');return cache;}},
        fetch:async url=>{requests.push(url);if(failNetwork)throw Error('Offline');return new Response('image',{headers:{'content-type':'image/webp'}});}
    });
    vm.runInContext(source('sw.js'),sw);
    const cached = url => {sw.url=url;return vm.runInContext('cachedAchievementArt(url)',sw);};
    const url='https://example.test/JTFAG/assets/achievements/v1/records.webp';
    await Promise.all([cached(url),cached(url)]);
    assert.equal(requests.length,1,'Concurrent requests share one download');
    failNetwork=true;
    assert.equal(await (await cached(url)).text(),'image','Cached illustration works offline');
    assert.equal(requests.length,1,'Cache hit does not revalidate');
    const missing=url.replace('records','titles');
    await assert.rejects(cached(missing),/Offline/);
    failNetwork=false;
    await cached(missing);
    assert.ok(entries.has(missing),'Failed request can be retried');
    disableCache=true;
    await cached(url.replace('records','ranks'));
    disableCache=false;
    const butterflyUrl='https://example.test/JTFAG/assets/achievements/v2/birdie-butterflies.webp';
    let correctedImage;
    handlers.fetch({request:{method:'GET',url:butterflyUrl,mode:'cors'},respondWith:p=>{correctedImage=p;}});
    assert.ok(correctedImage,'The new butterfly asset is handled by the image cache');
    assert.equal(await (await correctedImage).text(),'image');
    const beforeHit=requests.length;
    failNetwork=true;
    assert.equal(await (await cached(butterflyUrl)).text(),'image');
    assert.equal(requests.length,beforeHit,'All corrected birdie badges reuse the cached asset offline');
    let intercepted=false;
    handlers.fetch({request:{method:'GET',url:'https://example.test/JTFAG/badges.js',mode:'cors'},respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,'Application code is never cached by the image handler');
    console.log('PASS: image download deduplication, offline cache, retry, unavailable storage and code-cache isolation');
}
checkCache().catch(error=>{console.error(error);process.exitCode=1;});
