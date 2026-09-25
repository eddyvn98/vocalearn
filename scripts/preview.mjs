// Render actual view functions with deterministic fixtures for visual QA only.
import {SourceTextModule,createContext} from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {webcrypto} from 'node:crypto';
const root=process.cwd(),cache=new Map();
const context=createContext({console,Intl,Date,Math,Set,Map,JSON,Number,String,Object,Array,BigInt,
  structuredClone,performance,crypto:webcrypto,navigator:{onLine:true},window:{addEventListener(){}},setTimeout,clearTimeout});
async function load(path){
  if(cache.has(path))return cache.get(path);
  const pending=readFile(path,'utf8').then(code=>new SourceTextModule(code,{context,identifier:path}));
  cache.set(path,pending);return pending;
}
const source=`
import {app} from './public/js/state.js';
import {homeView} from './public/js/views/home.js';
import {libraryView} from './public/js/views/library.js';
import {studyView} from './public/js/views/study.js';
import {replay} from './core/model.js';
import {question} from './core/questions.js';
const now=Date.now();
const e=(id,kind,data,seq)=>({id,kind,data,seq,at:now,deviceId:'fixture'});
const cards=[['deploy','tri\u1ec3n khai'],['confirm','x\u00e1c nh\u1eadn'],['deadline','h\u1ea1n ch\u00f3t'],['improve','c\u1ea3i thi\u1ec7n'],['reliable','\u0111\u00e1ng tin c\u1eady'],['opportunity','c\u01a1 h\u1ed9i']];
app.user={id:'fixture',email:'fixture@example.com'};app.setId='work';
app.model=replay([e('set','set',{id:'work',name:'English for work',language:'en',meaningLanguage:'vi'},1),...cards.map(([word,meaning],i)=>e('e'+i,'word',{id:'w'+i,setId:'work',patch:{word,meaning}},i+2))]);
export const home=homeView();app.page='library';export const library=libraryView();
app.session={id:'fixture',mode:'free',index:0,queue:[question(app.model.words.w0,Object.values(app.model.words),'typing','meaning','free',app.model.settings,()=>crypto.randomUUID())]};
export const study=studyView();
`;
const entry=new SourceTextModule(source,{context,identifier:resolve(root,'preview-entry.js')});
await entry.link((specifier,parent)=>load(specifier.startsWith('/core/')?resolve(root,specifier.slice(1)):resolve(dirname(parent.identifier),specifier)));await entry.evaluate();
const css=(await Promise.all(['base','components','responsive'].map(n=>readFile(`public/css/${n}.css`,'utf8')))).join('\n');
await mkdir('test-results/preview',{recursive:true});
for(const key of ['home','library','study'])await writeFile(`test-results/preview/${key}.html`,`<!doctype html><html lang="vi"><meta charset="utf-8"><style>${css}</style><body>${entry.namespace[key]}</body></html>`);
console.log('Static view fixtures written; not an end-to-end interaction test.');
