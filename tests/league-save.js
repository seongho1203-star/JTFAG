// 실행: node tests/league-save.js
// 실제 서버 대신 지연·실패 응답을 주어 조회 보호와 저장 완료 시점을 검증한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);

function make() {
    const calls = [], pending = [], statuses = [], toasts = [], timers = [], storage = new Map();
    let active = 0, maxActive = 0, loadMoneyCalls = 0;
    const db = { payload: null, select: null };
    const client = { from() { return {
        select() { return { eq() { return { single: async () => db.select ? db.select() : {data:{id:1,payload:clone(db.payload)},error:null} }; } }; },
        upsert(row) {
            const sent = clone(row); calls.push(sent);
            active++; maxActive = Math.max(maxActive, active);
            return new Promise((resolve, reject) => pending.push({resolve, reject})).then(result => {
                active--;
                if (!result.error) db.payload = clone(sent.payload);
                return result;
            }, error => { active--; throw error; });
        }
    }; } };
    const ctx = {
        console:{log(){},warn(){},error(){}}, Date, Math, Intl, Promise,
        supabase:{createClient:()=>client}, selectedMoneyRoundIdx:0,
        localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
        showSaveStatus:text=>statuses.push(text),showToast:text=>toasts.push(text),
        loadMoneyTable:async()=>{loadMoneyCalls++;return false;},reapplyMyMoney:()=>false,
        applyHoleScores(){},mergeMissionData:()=>false,renderNoticeArea(){},renderAll(){},
        setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}
    };
    ctx.window = ctx; vm.createContext(ctx);
    const run = code => vm.runInContext(code, ctx);
    run(source('api.js'));
    db.payload = clone(run(`({...getDefaultData(),totalRounds:10,noticeMemo:'existing notice',
        scores:Object.fromEntries(golfers.map((g,i)=>[g,Array(10).fill(85+i)])),
        missions:{11:{preserve:true}},scoreRequests:[],
        roundMoney:Array.from({length:10},()=>Object.fromEntries(golfers.map(g=>[g,{start:200000,end:150000}])) )})`));
    return {ctx,run,db,calls,statuses,toasts,timers,storage,pending,
        boot:()=>ctx.fetchFromSupabase(),
        accept:i=>pending[i].resolve({error:null}),
        fail:i=>pending[i].resolve({error:{message:'Save failed'}}),
        reject:i=>pending[i].reject(new Error('Connection interrupted')),
        maxActive:()=>maxActive,loadMoneyCalls:()=>loadMoneyCalls};
}

async function loadProtection() {
    const invalid = [
        () => ({data:null,error:{message:'Temporary read failure'}}),
        () => { throw new TypeError('Network unavailable'); },
        () => ({data:null,error:null}),
        () => ({data:{payload:null},error:null}),
        () => ({data:{payload:[]},error:null}),
        () => ({data:{payload:{}},error:null}),
        () => ({data:{payload:{totalRounds:10,scores:null}},error:null})
    ];
    for (const select of invalid) {
        const x=make();x.ctx.seed=clone(x.db.payload);x.run('appData=seed');
        const before=x.run('JSON.stringify(appData)');x.db.select=select;
        assert.equal(await x.boot(),false);
        assert.equal(x.run('JSON.stringify(appData)'),before,'failed read preserves current state');
        assert.equal(x.calls.length,0,'failed read never seeds default data');
        assert.equal(x.loadMoneyCalls(),0,'failed read never starts migration');
        assert.equal(x.run('isLoaded'),false);
        assert.equal(await x.ctx.syncToSupabase(x.run('appData')),false,'initial local state cannot overwrite an unread league');
        assert.equal(x.calls.length,0);
    }
    const x=make();assert.equal(await x.boot(),true);
    assert.equal(x.run('isLoaded'),true);assert.equal(x.run('appData.totalRounds'),10);
    const before=x.run('JSON.stringify(appData)');x.db.select=invalid[0];
    assert.equal(await x.boot(),false);
    assert.equal(x.run('JSON.stringify(appData)'),before);assert.equal(x.run('isLoaded'),true);
    const save=x.ctx.syncToSupabase(x.run('appData'));
    assert.equal(x.calls.length,1,'a later read failure does not disable an already loaded session');
    x.accept(0);assert.equal(await save,true);

    const initial=make();let auto;
    initial.ctx.applyHoleScores=()=>{auto=initial.ctx.syncToSupabase(initial.run('appData'));};
    assert.equal(await initial.boot(),true);assert.equal(initial.calls.length,1,'initial score synchronization is allowed after a valid server read');
    initial.accept(0);assert.equal(await auto,true);
}

async function saveCompletion() {
    const x=make();await x.boot();
    const a=x.ctx.syncToSupabase({noticeMemo:'A'});
    let bDone=false,cDone=false;
    const b=x.ctx.syncToSupabase({noticeMemo:'B'}).then(ok=>{bDone=true;return ok;});
    const c=x.ctx.syncToSupabase({noticeMemo:'C',scoreRequests:[{id:'pending'}]}).then(ok=>{cDone=true;return ok;});
    await tick();assert.equal(x.calls.length,1);assert.equal(bDone,false);assert.equal(cDone,false);
    x.accept(0);assert.equal(await a,true);await tick();
    assert.equal(x.calls.length,2,'pending changes remain coalesced to the latest state');
    assert.equal(x.calls[1].payload.noticeMemo,'C');assert.equal(bDone,false);assert.equal(cDone,false);
    x.accept(1);assert.deepEqual(await Promise.all([b,c]),[true,true]);
    assert.equal(x.db.payload.scoreRequests[0].id,'pending');assert.equal(x.maxActive(),1);
    assert.ok(x.ctx.isMyEcho(x.db.payload),'revision echo protection remains active');
    assert.equal(x.run('_saveBusy'),false);assert.equal(x.run('_saveWaiters.length'),0);

    const failure=make();await failure.boot();
    const first=failure.ctx.syncToSupabase({noticeMemo:'will fail'});
    const second=failure.ctx.syncToSupabase({noticeMemo:'will succeed'});
    failure.fail(0);assert.equal(await first,false);await tick();
    failure.accept(1);assert.equal(await second,true);
    const rejected=failure.ctx.syncToSupabase({noticeMemo:'network exception'});
    failure.reject(2);assert.equal(await rejected,false);
    const next=failure.ctx.syncToSupabase({noticeMemo:'after exception'});
    failure.accept(3);assert.equal(await next,true);assert.equal(failure.maxActive(),1);
    assert.equal(failure.run('_saveWaiters.length'),0);assert.equal(failure.run('_saveBusy'),false);
}

function installConsumer(x,kind) {
    // ui.js는 조각(ui-*.js)으로 나뉘어 있다 — 이어 붙여 예전 ui.js처럼 다룬다.
    const ui=['ui.js',...fs.readdirSync(root).filter(f=>/^ui-.*\.js$/.test(f)).sort()].map(source).join('\n'),mission=source('mission.js');
    const slice=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));
    const ctx=x.ctx;
    x.storage.set('jtfag_my_name','신성호');
    Object.assign(ctx,{
        selectedScorecardRound:0,hasHoleRecord:()=>true,escapeHtml:value=>String(value),
        showConfirmPrompt:async()=>true,renderScoreRequestModal(){},pruneScoreRequests(){},
        document:{getElementById:()=>({checked:false,value:''})},missionYearNow:()=>2026,
        compressImageToBlob:async file=>file,uploadPhotoBlob:async()=> 'https://example.invalid/scorecard.jpg',
        mulliganRound:()=>11,mulliganUsedIn:()=>false,mulliganInfo:()=>({left:1}),
        writeMine:fn=>fn({mulligans:[]}),renderMissionPage(){}
    });
    if(kind==='delete')x.run(slice(ui,'async function requestHoleDelete()','async function handleScorecardUpload('));
    else if(kind==='score')x.run(slice(ui,'async function handleScorecardUpload(','// payload에 base64'));
    else x.run(slice(mission,'async function useMulligan()','\n// ── 미션 화면'));
    const kicks=[];
    ctx.kickScorecardWorkflow=async()=>{
        assert.ok((x.db.payload.scoreRequests||[]).some(req=>kind==='score'?!req.action:req.action===(kind==='delete'?'삭제':'멀리건')),'workflow only starts after the request is stored');
        kicks.push(kind);return true;
    };
    return {kicks,start:()=>kind==='score'?ctx.handleScorecardUpload({target:{files:[{name:'test.jpg'}],value:'test'}}):kind==='delete'?ctx.requestHoleDelete():ctx.useMulligan()};
}

async function consumers() {
    for(const kind of ['score','delete','mulligan'])for(const success of [true,false]) {
        const x=make();await x.boot();const consumer=installConsumer(x,kind);
        const previous=x.ctx.syncToSupabase(x.run('({...appData,noticeMemo:"prior write"})'));
        const action=consumer.start();await tick();
        assert.equal(x.calls.length,1);assert.equal(consumer.kicks.length,0);
        assert.ok(!x.toasts.some(text=>/✅|🚀|삭제를 요청했습니다|사용권을 사용했습니다/.test(text)),'no completion toast before server acknowledgement');
        x.accept(0);assert.equal(await previous,true);await tick();
        assert.equal(x.calls.length,2);assert.equal(consumer.kicks.length,0);
        assert.ok(!x.toasts.some(text=>/✅|🚀|삭제를 요청했습니다|사용권을 사용했습니다/.test(text)));
        if(success)x.accept(1);else x.fail(1);
        await action;
        assert.equal(consumer.kicks.length,success?1:0);
        assert.equal(x.toasts.some(text=>text.includes('저장에 실패')), !success);
        if(!success){assert.equal(x.timers.length,0,'failed save does not schedule a delayed workflow');assert.ok(!x.toasts.some(text=>/✅|🚀|삭제를 요청했습니다|사용권을 사용했습니다/.test(text)));}
        assert.equal(x.maxActive(),1);
    }
}

(async()=>{
    await loadProtection();
    await saveCompletion();
    await consumers();
    console.log('PASS: 조회 오류·빈 자료·잘못된 자료에서 기존 상태 보존, 기본값 저장·미확인 초기 상태 저장 차단');
    console.log('PASS: 정상 접속·초기 타수 동기화·재접속 오류 처리 유지');
    console.log('PASS: 요청별 저장 완료 대기, 대기 변경 병합, 동시 요청 최대 1개, 실패·예외 후 다음 저장 정상 처리');
    console.log('PASS: 스코어 판독·홀 기록 삭제·멀리건 알림은 서버 저장 성공 후에만 시작');
    console.log('모든 서버 응답은 가상 응답이며 실제 서버 자료·알림을 사용하지 않습니다.');
})().catch(error=>{console.error(error);process.exitCode=1;});
