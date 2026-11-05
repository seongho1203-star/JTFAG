// node tests/rank-art.js — approved rank assets, cached greeting migration and image cache.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {make} = require('./prediction-passport');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root,name),'utf8');
const m = make();
const ranks = JSON.parse(m.run('JSON.stringify(RANK_CONFIG)'));
const files = ['eagle','falcon','crane','sparrow'];
const urls = files.map(name=>'assets/ranks/v1/'+name+'.webp');
files.forEach((name,i)=>{
    assert.match(ranks[i].icon,new RegExp('src="'+urls[i].replaceAll('.','\\.')+'"'));
    assert.match(ranks[i].icon,/class="jtfag-rank"/);
    const b=fs.readFileSync(path.join(root,urls[i]));
    assert.equal(b.toString('ascii',8,12),'WEBP');
    assert.ok(b[20]&0x10,'transparent alpha retained');
    assert.equal(b.readUIntLE(24,3)+1,1254);
    assert.equal(b.readUIntLE(27,3)+1,1254);
});
assert.equal(m.run('EAGLE_HERO_URL'),urls[0]);
for(const file of fs.readdirSync(root).filter(f=>/\.(js|html)$/.test(f))) {
    assert.doesNotMatch(source(file),/IMG_(?:8343|8331|8333|8335|8606)\.(?:png|gif)/,file+' must not use old rank images');
}
assert.match(source('calc.js'),/const imgE = RANK_CONFIG\[0\]\.icon/);
assert.match(source('ui-report.js'),/const iS = RANK_CONFIG\[3\]\.icon/);
assert.match(source('ui-rounds.js'),/RANK_CONFIG\[x\.rank\]\.icon/);
assert.match(source('badges.js'),/class="jtfag-rank" src="\$\{img\}"/);
console.log('PASS: all rank image entry points use the four approved transparent assets');

const early = source('index.html').split('<script>').find(block=>block.includes('var rankPics')).split('</script>')[0];
Object.values(ranks).forEach((rank,i)=>{
    const old='https://old.example/rank.png', data=new Map([
        ['jtfag_my_name','preview'],
        ['jtfag_greet',JSON.stringify({name:'preview',rankName:rank.name,pic:old})],
        ['jtfag_greet_pic',JSON.stringify({url:old,data:'data:image/png;base64,old'})]
    ]);
    const picture={classList:{remove(){}},complete:false},nodes={};
    const overlay={dataset:{},classList:{add(){},remove(){}},style:{setProperty(){}},querySelector:selector=>selector==='.greet-pic'?picture:(nodes[selector]??={}),addEventListener(){},remove(){}};
    const ctx={localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},document:{createElement:()=>overlay,body:{appendChild(){}},documentElement:{appendChild(){}}},window:{__greetFont(){}},setTimeout(){return 1;},Date,JSON,requestAnimationFrame:fn=>fn()};
    vm.runInNewContext(early,ctx);
    assert.equal(JSON.parse(data.get('jtfag_greet')).pic,urls[i]);
    assert.equal(picture.src,urls[i],'first greeting frame must not reuse the obsolete cached bitmap');
});
console.log('PASS: all four cached greeting images migrate before the first display');

async function cacheTest(){
    const entries=new Map(),handlers={},requests=[],removed=[];
    const cache={match:async u=>entries.get(u)?.clone(),put:async(u,r)=>entries.set(u,r.clone())};
    const ctx=vm.createContext({Map,URL,Response,Promise,Number,console,
        self:{registration:{scope:'https://example.test/JTFAG/'},addEventListener:(t,f)=>{handlers[t]=f;},clients:{claim:async()=>{}}},
        caches:{open:async()=>cache,keys:async()=>['jtfag-rank-icons-v1','jtfag-rank-icons-v2','jtfag-club-marks-v1','unrelated'],delete:async k=>removed.push(k)},
        fetch:async u=>{requests.push(u);return new Response('rank',{headers:{'content-type':'image/webp'}});}});
    vm.runInContext(source('sw.js'),ctx);
    const actual=JSON.parse(vm.runInContext('JSON.stringify(RANK_ICON_URLS)',ctx));
    assert.deepEqual(actual,urls.map(u=>'https://example.test/JTFAG/'+u));
    await Promise.all([vm.runInContext('cachedRankIcon(RANK_ICON_URLS[0])',ctx),vm.runInContext('cachedRankIcon(RANK_ICON_URLS[0])',ctx)]);
    assert.equal(requests.length,1);
    await vm.runInContext('cachedRankIcon(RANK_ICON_URLS[0])',ctx);
    assert.equal(requests.length,1,'cached rank must avoid another network request');
    let activation;handlers.activate({waitUntil:p=>{activation=p;}});await activation;
    assert.deepEqual(removed,['jtfag-rank-icons-v1']);
    console.log('PASS: rank image download sharing, cache hits and old-cache cleanup');
}
cacheTest().catch(error=>{console.error(error);process.exitCode=1;});
