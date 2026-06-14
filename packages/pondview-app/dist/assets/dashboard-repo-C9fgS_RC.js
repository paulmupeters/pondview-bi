import{B as e,C as t,E as n,G as r,L as i,Lt as a,M as o,N as s,Pt as c,R as l,Rt as u,S as ee,St as te,T as ne,W as re,Y as ie,et as ae,ht as oe,it as se,jt as ce,k as le,r as ue,st as de,ut as fe,v as d,w as pe,x as me,y as f,yt as he}from"./button-C2rAbLCV.js";import{C as ge,S as p,T as _e,_ as m,b as ve,g as h,m as g,w as _,x as v}from"./vendor-ai-BLznu2Ed.js";function y(e){return typeof e==`string`&&e.trim().length>0?e.trim():null}function b(e){let t=y(e.dbIdentifier),n=y(e.catalogContext);return e.kind===`runtime`?{kind:`runtime`,runtimeBackend:e.runtimeBackend,dbIdentifier:e.runtimeBackend===`duckdb-wasm`?t??`wasm:local`:t,catalogContext:n}:e.kind===`motherduck`?{kind:`motherduck`,runtimeBackend:e.runtimeBackend,dbIdentifier:t,catalogContext:null}:{kind:`external`,runtimeBackend:e.runtimeBackend,dbIdentifier:t,catalogContext:n,externalType:e.externalType,connection:e.connection}}function x(t){let n=y(t.dbIdentifier),i=y(t.catalogContext);if(n&&a(n))return b({kind:`motherduck`,runtimeBackend:t.runtimeBackend,dbIdentifier:n,catalogContext:null});let o=n?c(n):null;return o&&(o.type===`postgres`||o.type===`mysql`||o.type===`sqlite`||o.type===`quack`||o.type===`httpfs`)?b({kind:`external`,runtimeBackend:t.runtimeBackend,dbIdentifier:n,catalogContext:i,externalType:o.type}):b({kind:`runtime`,runtimeBackend:t.runtimeBackend,dbIdentifier:t.runtimeBackend===`duckdb-wasm`&&r(n??void 0)?e:n,catalogContext:i})}function ye(e){if(!e||typeof e!=`object`)return null;let t=e,n=t.kind,r=t.runtimeBackend;if(n!==`runtime`&&n!==`motherduck`&&n!==`external`||r!==`duckdb-wasm`&&r!==`bridge`)return null;let i={kind:n,runtimeBackend:r,dbIdentifier:y(t.dbIdentifier),catalogContext:y(t.catalogContext)};return n===`external`&&(t.externalType===`postgres`||t.externalType===`mysql`||t.externalType===`sqlite`||t.externalType===`quack`||t.externalType===`httpfs`||t.externalType===`custom`)&&(i.externalType=t.externalType),n===`external`&&xe(t.connection)&&(i.connection=t.connection),b(i)}function be(e){if(typeof e!=`string`||e.trim().length===0)return null;try{return ye(JSON.parse(e))}catch{return null}}function S(e){return e?JSON.stringify(b(e)):null}function C(e){return e?.runtimeBackend??null}function w(e){return e?b(e).dbIdentifier:null}function T(e){return e?.catalogContext??null}function xe(e){if(!e||typeof e!=`object`)return!1;let t=e;return typeof t.type!=`string`||!t.type.trim()||t.identifier!==void 0&&typeof t.identifier!=`string`||t.connectionId!==void 0&&typeof t.connectionId!=`string`||t.alias!==void 0&&typeof t.alias!=`string`||t.setupSql!==void 0&&typeof t.setupSql!=`string`||t.readOnly!==void 0&&typeof t.readOnly!=`boolean`||t.duckdbExtension!==void 0&&typeof t.duckdbExtension!=`string`||t.duckdbExtensionRepository!==void 0&&typeof t.duckdbExtensionRepository!=`string`?!1:t.type===`custom`?typeof t.setupSql==`string`&&t.setupSql.trim().length>0&&t.identifier===void 0&&t.connectionId===void 0&&t.alias===void 0&&t.readOnly===void 0&&t.duckdbExtension===void 0&&t.duckdbExtensionRepository===void 0&&t.attachOptions===void 0:!0}var Se=new Set([`on`,`where`,`group`,`order`,`having`,`limit`,`offset`,`join`,`left`,`right`,`inner`,`full`,`cross`,`union`,`intersect`,`except`,`qualify`,`window`,`with`,`from`]),Ce=new Set([`select`,`from`,`join`,`on`,`where`,`group`,`order`,`having`,`limit`,`offset`,`union`,`intersect`,`except`,`with`,`as`,`case`,`when`,`then`,`else`,`end`,`by`,`and`,`or`,`in`,`exists`]);function we(e){let t=[],n=Ee(e);for(let e of n){let n=o(e.rawReference);n&&t.push({rawReference:e.rawReference,tableName:n,alias:e.alias})}return t}function Te(e){let t=Ee(e).find(e=>e.keyword===`from`&&e.depth===0&&e.functionDepth===0);if(!t)return null;let n=o(t.rawReference);return n?{rawReference:t.rawReference,tableName:n,alias:t.alias,matchedFromClause:t.matchedClause}:null}function Ee(e){let t=Me(e),n=[],r=[],i=0;for(let a=0;a<t.length;a+=1){let o=t[a];if(o.kind===`punct`&&o.text===`(`){let e=Oe(t,a-1),n=!!e&&(e.kind===`word`||e.kind===`quoted`)&&!Ce.has(e.lower);r.push(n?`function`:`other`),n&&(i+=1);continue}if(o.kind===`punct`&&o.text===`)`){r.pop()===`function`&&i>0&&--i;continue}if(o.kind!==`word`||o.lower!==`from`&&o.lower!==`join`||i>0)continue;let s=De(t,a+1);if(!s)continue;let c=e.slice(o.start,s.clauseEnd).trim();n.push({keyword:o.lower,depth:r.length,functionDepth:i,tokenIndex:a,token:o,rawReference:s.rawReference,alias:s.alias,matchedClause:c})}return n}function De(e,t){let n=t;if(n>=e.length||(e[n]?.kind===`word`&&e[n]?.lower===`lateral`&&(n+=1),n>=e.length))return null;let r=n,i=e[r];if(!i||i.kind===`punct`&&i.text===`(`||!ke(i))return null;let a=i;for(n+=1;n+1<e.length;){let t=e[n],r=e[n+1];if(t?.kind!==`punct`||t.text!==`.`||!r||!ke(r))break;a=r,n+=2}let o=e.slice(r,n).map(e=>e.text).join(``).trim();if(!o)return null;let s,c=a.end,l=e[n],u=e[n+1];return l?.kind===`word`&&l.lower===`as`?u&&Ae(u)&&(s=je(u.text),c=u.end):l&&Ae(l)&&(s=je(l.text),c=l.end),{rawReference:o,alias:s,clauseEnd:c}}function Oe(e,t){for(let n=t;n>=0;--n){let t=e[n];if(t)return t}return null}function ke(e){return e.kind===`word`||e.kind===`quoted`}function Ae(e){return ke(e)?e.kind===`word`?!Se.has(e.lower):!0:!1}function je(e){return e.startsWith(`"`)&&e.endsWith(`"`)||e.startsWith("`")&&e.endsWith("`")||e.startsWith(`[`)&&e.endsWith(`]`)?e.slice(1,-1):e}function Me(e){let t=[],n=0;for(;n<e.length;){let r=e[n]??``;if(Ne(r)){n+=1;continue}if(r===`-`&&e[n+1]===`-`){for(n+=2;n<e.length&&e[n]!==`
`;)n+=1;continue}if(r===`/`&&e[n+1]===`*`){for(n+=2;n+1<e.length&&!(e[n]===`*`&&e[n+1]===`/`);)n+=1;n+=2;continue}if(r===`'`||r===`"`||r==="`"||r===`[`){let i=r===`[`?`]`:r,a=n;for(n+=1;n<e.length;){if((e[n]??``)===i){if((i===`'`||i===`"`||i==="`")&&e[n+1]===i){n+=2;continue}n+=1;break}n+=1}let o=e.slice(a,n);t.push({text:o,lower:o.toLowerCase(),start:a,end:n,kind:r===`'`?`string`:`quoted`});continue}if(Pe(r)){let r=n;for(n+=1;n<e.length&&Fe(e[n]??``);)n+=1;let i=e.slice(r,n);t.push({text:i,lower:i.toLowerCase(),start:r,end:n,kind:`word`});continue}if(Ie(r)){t.push({text:r,lower:r,start:n,end:n+1,kind:`punct`}),n+=1;continue}n+=1}return t}function Ne(e){return/\s/.test(e)}function Pe(e){return/[A-Za-z_]/.test(e)}function Fe(e){return/[A-Za-z0-9_$]/.test(e)}function Ie(e){return e===`(`||e===`)`||e===`.`||e===`,`}p({section:_(),explanation:_()});var Le=p({visualType:g([`chart`,`table`,`card`]).describe(`Type of visualization`),description:_().describe(`Describe the chart. What is it showing? What is interesting about the way the data is displayed?`),takeaway:_().describe(`What is the main takeaway from the chart?`).optional(),type:g([`bar`,`line`,`area`,`pie`]).describe(`Type of chart`),title:_(),xKey:_().describe(`Key for x-axis or category`),yKeys:h(_()).describe(`Key(s) for y-axis values this is typically the quantitative column`),multipleLines:m().describe(`For line charts only: whether the chart is comparing groups of data.`).optional().default(!1),measurementColumn:_().nullish().describe(`For line charts only: key for quantitative y-axis column to measure against (eg. values, counts etc.)`).optional(),categoryColumn:_().nullish().describe(`Column to group lines by (e.g., Country)`).optional(),lineCategories:h(_()).nullish().describe(`For line charts only: Categories used to compare different lines or data series. Each category represents a distinct line in the chart.`).optional(),colors:ge(_().describe(`Any of the yKeys`),_().describe(`Color value in CSS format (e.g., hex, rgb, hsl)`)).describe(`Mapping of data keys to color values for chart elements`).optional(),legend:m().describe(`Whether to show legend`).default(!1),countMode:m().describe(`For bar charts: whether to count occurrences of xKey values instead of using yKeys`).optional().default(!1),showGrid:m().describe(`Whether to display gridlines on supported charts`).optional(),showXAxis:m().describe(`Whether to display the X axis on supported charts`).optional(),showYAxis:m().describe(`Whether to display the Y axis on supported charts`).optional(),showDots:m().describe(`For line charts: whether to display data point dots`).optional(),showLine:m().describe(`For line charts: whether to display the connecting line`).optional(),showTooltip:m().describe(`Whether to display the hover tooltip`).optional(),lineSize:v().min(1).max(10).describe(`Stroke width for line charts in pixels`).optional(),suffixLabelY:_().describe(`Suffix applied to the Y axis label and units`).optional(),labelYAngle:v().min(-90).max(90).describe(`Rotation angle for the Y axis label`).optional(),referenceLineLabel:_().nullish().describe(`Label to display alongside a reference line if rendered`).optional(),colSpan:v().int().min(1).max(6).describe(`Number of grid columns this chart should span`).optional()}).describe(`Chart configuration object`),Re=e=>({...e,measurementColumn:e.measurementColumn??void 0,categoryColumn:e.categoryColumn??void 0,lineCategories:e.lineCategories??void 0,referenceLineLabel:e.referenceLineLabel??void 0}),ze=p({configType:ve(`card`).describe(`Discriminator field for card config`).default(`card`),measureId:_().describe(`Optional reusable measure backing this metric card`).optional(),title:_().describe(`Title for the card displaying the single value`),description:_().describe(`Description of what the card value represents and what it shows`),takeaway:_().describe(`Main insight or takeaway from this single value`).optional()}).describe(`Card configuration object for single-value results`),Be=p({configType:ve(`table`).describe(`Discriminator field for table config`).default(`table`),title:_().describe(`Title for the table`),description:_().describe(`Description of what the table shows and its purpose`),takeaway:_().describe(`Main insight or takeaway from the data in the table`).optional(),sortColumn:_().describe(`Column to sort by default`).optional(),sortDirection:g([`asc`,`desc`]).describe(`Default sort direction`).optional(),colSpan:v().int().min(1).max(6).describe(`Number of grid columns this table should span`).optional()}).describe(`Table configuration object for tabular data display`),Ve=p({configType:ve(`text`).describe(`Discriminator field for text card`).default(`text`),title:_().optional(),content:_().describe(`Markdown content to display`)}).describe(`Text card configuration for markdown content`),E=ve(1),D=_().trim().min(1),O=_().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),He=g([`runtime`,`motherduck`,`external`]),Ue=g([`postgres`,`mysql`,`sqlite`,`quack`,`httpfs`,`custom`]),We=_e([Le,Be,ze,Ve]),Ge=p({type:_().trim().min(1),identifier:_().trim().min(1).optional(),connectionId:_().trim().min(1).optional(),alias:_().trim().min(1).optional(),setupSql:_().trim().min(1).optional(),readOnly:m().optional(),duckdbExtension:_().trim().min(1).optional(),duckdbExtensionRepository:_().trim().min(1).optional(),attachOptions:p({type:_().trim().min(1).optional(),token:_().optional(),disableSsl:m().optional()}).optional()}).refine(e=>e.type===`custom`?!!e.setupSql:!!(e.identifier||e.connectionId),{message:`Custom source connections require setupSql; non-custom source connections require identifier or connectionId`}).refine(e=>e.type===`custom`?e.identifier===void 0&&e.connectionId===void 0&&e.alias===void 0&&e.readOnly===void 0&&e.duckdbExtension===void 0&&e.duckdbExtensionRepository===void 0&&e.attachOptions===void 0:!0,{message:`Custom source connections are SQL-backed and cannot include identifier, connectionId, alias, readOnly, duckdbExtension, duckdbExtensionRepository, or attachOptions`}),Ke=p({runtimeBackend:g([`duckdb-wasm`,`bridge`]),dbIdentifier:_().nullable().optional(),catalogContext:_().nullable().optional(),connection:Ge.optional()}),qe=p({schemaVersion:E,bindings:ge(O,Ke)}),Je=p({schemaVersion:E,name:D,defaultSourceRef:O.nullable().optional(),description:_().optional(),sourceBindings:ge(O,Ke).optional()}),Ye=p({schemaVersion:E,sources:h(p({id:O,kind:He,externalType:Ue.optional(),description:_().optional()}))}),Xe=p({id:O.optional(),field:D,title:_().optional(),limit:v().int().positive().optional()}),Ze=p({schemaVersion:E,joins:h(p({leftTable:D,leftColumn:D,rightTable:D,rightColumn:D,type:g([`inner`,`left`,`right`,`full`]).optional()}))}),Qe=p({id:O,metadataFile:D,sqlFile:D}),$e=p({id:O,metadataFile:D,sqlFile:D}),et=p({schemaVersion:E,id:O,title:D,description:_().optional(),columns:v().int().positive().max(12).optional(),autoFitRows:m().optional(),sourceRef:O.optional(),joinsFile:D.optional(),slicers:h(Xe).optional(),measures:h(Qe),visuals:h($e)}),tt=p({schemaVersion:E,id:O,key:D,label:D,description:_().optional(),sourceRef:O.optional(),catalogContext:_().optional()}),nt=p({schemaVersion:E,id:O,sourceRef:O.optional(),catalogContext:_().optional(),config:We}),rt=p({schemaVersion:E,id:O,name:D,kind:g([`query`,`view`]).optional(),description:_().optional(),sourceRef:O.optional(),catalogContext:_().optional(),tags:h(D).optional()}),it=p({id:O,kind:g([`text`,`ai`,`sql`]),file:D,visualFile:D.optional(),sourceRef:O.optional(),catalogContext:_().optional()}),at=p({schemaVersion:E,id:O,title:D,description:_().optional(),cells:h(it)});function k(e){let t=typeof e==`string`?e.trim():``;return t.length>0?t:null}function ot(e){return k(e)??void 0}function st(e){return k(e)?.toLowerCase()??null}var ct=80;function lt(e,t){return e.length<=t?e:e.slice(0,t).replace(/-+$/g,``)}function A(e,t=`artifact`){return lt((e??``).normalize(`NFKD`).replace(/[\u0300-\u036f]/g,``).toLowerCase().replace(/['"`]/g,``).replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``).replace(/-{2,}/g,`-`),ct)||t}function ut(){let e=new Map;return(t,n)=>{let r=A(t,n),i=e.get(r)??0;if(e.set(r,i+1),i===0)return r;let a=`-${i+1}`;return`${lt(r,ct-a.length)}${a}`}}function dt(e){if(!e?.trim())return null;try{return JSON.parse(e)}catch{return null}}function ft(e){return e.sourceDescriptor??be(e.sourceDescriptorJson)??null}function pt(e,t,n={}){let r=k(t?.(e)??e.fallbackSourceRef??null);if(!r&&n.required&&mt(e)){let e=n.label?` for ${n.label}`:``;throw Error(`Missing project sourceRef mapping${e}.`)}return r??void 0}function mt(e){return e.sourceDescriptor!==null&&e.sourceDescriptor!==void 0&&w(e.sourceDescriptor)!==null||k(e.dbIdentifier)!==null||k(e.catalogContext)!==null}function ht(e){let t=e.map(e=>({sourceRef:k(e.sourceRef),dbIdentifier:st(e.dbIdentifier),catalogContext:st(e.catalogContext),sqlBackend:e.sqlBackend??null})).filter(e=>e.sourceRef!==null);return e=>{let n=st(e.dbIdentifier??w(e.sourceDescriptor)),r=st(e.catalogContext??T(e.sourceDescriptor)),i=e.sqlBackend??C(e.sourceDescriptor);return t.find(e=>e.dbIdentifier&&e.dbIdentifier!==n||e.catalogContext&&e.catalogContext!==r||e.sqlBackend&&e.sqlBackend!==i?!1:e.dbIdentifier!==null||e.catalogContext!==null)?.sourceRef??null}}function j(e){return k(e)??void 0}function gt(e){return Array.isArray(e)?e.map(e=>gt(e)):!e||typeof e!=`object`||e instanceof Date?e:Object.fromEntries(Object.entries(e).sort(([e],[t])=>e.localeCompare(t)).map(([e,t])=>[e,gt(t)]))}function M(e){return Array.isArray(e)?e.map(e=>M(e)):!e||typeof e!=`object`||e instanceof Date?e:Object.fromEntries(Object.entries(e).filter(([,e])=>e!==void 0).map(([e,t])=>[e,M(t)]))}function N(e,t){return{path:e,content:`${JSON.stringify(gt(t),null,2)}\n`}}function _t(e,t){return{path:e,content:`${t.trim()}\n`}}function vt(e,t){return{path:e,content:`${t.trim()}\n`}}function yt(e,t){let n=dt(t);if(n&&typeof n==`object`){if(`visualType`in n)return M(Re(Le.parse(n)));if(n.configType===`table`)return M(Be.parse(n));if(n.configType===`card`)return M(ze.parse(n));if(n.configType===`text`)return M(Ve.parse(n))}throw Error(`Invalid dashboard visual config for chart "${e}".`)}function bt(e){return[...e].sort((e,t)=>{let n=[o(e.leftTable),e.leftColumn.toLowerCase(),o(e.rightTable),e.rightColumn.toLowerCase(),e.type??`left`].join(`|`),r=[o(t.leftTable),t.leftColumn.toLowerCase(),o(t.rightTable),t.rightColumn.toLowerCase(),t.type??`left`].join(`|`);return n.localeCompare(r)})}function xt(e){let t=dt(e.resultPayloadJson);return t&&typeof t==`object`?t:null}function St(e){let t=xt(e);return t?t.visualType===`chart`&&t.chartConfig?M(Re(Le.parse(t.chartConfig))):t.visualType===`table`&&t.tableConfig?M(Be.parse(t.tableConfig)):t.visualType===`card`&&t.cardConfig||t.cardConfig?M(ze.parse(t.cardConfig)):t.tableConfig?M(Be.parse(t.tableConfig)):t.chartConfig?M(Re(Le.parse(t.chartConfig))):null:null}function Ct(e){let t=xt(e);return{sourceDescriptor:ye(t?.sourceDescriptor),dbIdentifier:k(e.selectedDbIdentifier)??k(t?.dbIdentifier)??null,catalogContext:k(e.selectedCatalogContext)??k(t?.catalogContext)??null,sqlBackend:t?.sqlBackend??null}}function wt(e){let t=xt(e);return k(e.sqlDraft)??k(t?.query)??``}function Tt(e){let t=e.artifactId??A(e.dashboard.title,`dashboard`),n=`pondview/dashboards/${t}`,r=`${n}/dashboard.json`,i=e.joins&&e.joins.length>0?`${n}/joins.json`:null,a=ut(),o=ut(),s=pt({dbIdentifier:e.dashboard.homeDbIdentifier??null,sqlBackend:e.dashboard.homeSqlBackend??null,fallbackSourceRef:e.fallbackSourceRef??null},e.resolveSourceRef,{required:e.requireSourceRefs,label:`dashboard "${e.dashboard.title}"`}),c=[...e.measures??[]].sort((e,t)=>{let n=`${e.key}|${e.label}`.toLowerCase(),r=`${t.key}|${t.label}`.toLowerCase();return n.localeCompare(r)}).map(t=>{let r=a(t.key||t.label,`measure`),i=pt({sourceDescriptor:ft(t),dbIdentifier:t.dbIdentifier,catalogContext:t.catalogContext??null,sqlBackend:t.sqlBackend??null,fallbackSourceRef:s??null},e.resolveSourceRef,{required:e.requireSourceRefs,label:`dashboard measure "${t.label}"`}),o=tt.parse(M({schemaVersion:1,id:r,key:t.key,label:t.label,sourceRef:i&&i!==s?i:void 0,catalogContext:j(t.catalogContext??null)}));return{id:r,metadataPath:`${n}/measures/${r}.measure.json`,sqlPath:`${n}/measures/${r}.sql`,metadata:o,sql:t.sql.trim()}}),l=[...e.charts].sort((e,t)=>e.position-t.position).map((t,r)=>{let i=yt(t.id,t.chartConfigJson),a=t.title||(`title`in i&&typeof i.title==`string`?i.title:`visual-${r+1}`),c=o(a,`visual`),l=pt({sourceDescriptor:ft(t),dbIdentifier:t.dbIdentifier,catalogContext:t.catalogContext??null,sqlBackend:t.sqlBackend??null,fallbackSourceRef:s??null},e.resolveSourceRef,{required:e.requireSourceRefs,label:`dashboard visual "${a}"`}),u=nt.parse(M({schemaVersion:1,id:c,sourceRef:l&&l!==s?l:void 0,catalogContext:j(t.catalogContext??null),config:i}));return{id:c,metadataPath:`${n}/visuals/${c}.visual.json`,sqlPath:`${n}/visuals/${c}.sql`,metadata:u,sql:t.sql.trim()}});return{rootPath:n,manifestPath:r,manifest:et.parse(M({schemaVersion:1,id:t,title:e.dashboard.title,columns:e.dashboard.columns??3,autoFitRows:e.dashboard.autoFitRows??!1,sourceRef:s,joinsFile:i?`joins.json`:void 0,slicers:[...e.slicers??[]].sort((e,t)=>e.position-t.position).map((e,t)=>M({id:A(e.title||e.field,`slicer-${t+1}`),field:e.field,title:ot(e.title),limit:e.limit})),measures:c.map(e=>({id:e.id,metadataFile:`measures/${e.id}.measure.json`,sqlFile:`measures/${e.id}.sql`})),visuals:l.map(e=>({id:e.id,metadataFile:`visuals/${e.id}.visual.json`,sqlFile:`visuals/${e.id}.sql`}))})),joinsPath:i,joins:i&&e.joins?Ze.parse({schemaVersion:1,joins:bt(e.joins)}):null,measures:c,visuals:l}}function Et(e){let t=[N(e.manifestPath,e.manifest)];e.joins&&e.joinsPath&&t.push(N(e.joinsPath,e.joins));for(let n of e.measures)t.push(N(n.metadataPath,n.metadata)),t.push(_t(n.sqlPath,n.sql));for(let n of e.visuals)t.push(N(n.metadataPath,n.metadata)),t.push(_t(n.sqlPath,n.sql));return t}function Dt(e){let t=A(e.group,`shared`),n=e.artifactId??A(e.query.name,`saved-query`),r=`pondview/queries/${t}`,i=`${r}/${n}.query.json`,a=`${r}/${n}.sql`,o=Array.from(new Set((e.tags??[]).concat(e.query.tags??[]).map(e=>k(e)).filter(e=>e!==null))).sort((e,t)=>e.localeCompare(t)),s=k(e.sourceRef)??k(e.query.sourceRef)??void 0;if(e.requireSourceRef&&!s)throw Error(`Missing project sourceRef mapping for query "${e.query.name}".`);return{rootPath:r,metadataPath:i,metadata:rt.parse(M({schemaVersion:1,id:n,name:e.query.name,kind:e.kind??e.query.kind??`query`,description:ot(e.description??e.query.description),sourceRef:s,catalogContext:j(e.catalogContext??e.query.catalogContext??null),tags:o.length>0?o:void 0})),sqlPath:a,sql:e.query.sql.trim()}}function Ot(e){return[N(e.metadataPath,e.metadata),_t(e.sqlPath,e.sql)]}function kt(e){let t=e.artifactId??A(e.notebook.title,`notebook`),n=`pondview/notebooks/${t}`,r=`${n}/notebook.json`,i=ut(),a=[],o=[];return{rootPath:n,manifestPath:r,manifest:at.parse(M({schemaVersion:1,id:t,title:e.notebook.title??`Untitled Analysis`,description:ot(e.description),cells:[...e.cells].sort((e,t)=>e.position-t.position).map((t,r)=>{let s=i(t.promptText||t.kind||`cell-${r+1}`,`${t.kind??`cell`}-${r+1}`),c=Ct(t),l=pt({...c,fallbackSourceRef:e.fallbackSourceRef??null},e.resolveSourceRef,{required:e.requireSourceRefs,label:`notebook cell "${s}"`});if(t.kind===`sql`){let e=`${n}/cells/${s}.sql`;a.push({cellId:s,path:e,content:wt(t)});let r=St(t);return r&&o.push({cellId:s,path:`${n}/cells/${s}.visual.json`,config:r}),M({id:s,kind:`sql`,file:`cells/${s}.sql`,visualFile:r?`cells/${s}.visual.json`:void 0,sourceRef:l,catalogContext:j(c.catalogContext??null)})}let u=`${n}/cells/${s}.md`;return a.push({cellId:s,path:u,content:t.promptText}),M({id:s,kind:t.kind===`text`?`text`:`ai`,file:`cells/${s}.md`,sourceRef:l,catalogContext:j(c.catalogContext??null)})})})),contentFiles:a,visualFiles:o}}function At(e){let t=[N(e.manifestPath,e.manifest)];for(let n of e.contentFiles){if(n.path.endsWith(`.sql`)){t.push(_t(n.path,n.content));continue}t.push(vt(n.path,n.content))}for(let n of e.visualFiles)t.push(N(n.path,n.config));return t}var jt=`open-project`,Mt=`project-registry`,Nt=`pondview.project-store-mode`;function P(e){return e.trim().replace(/\\/g,`/`).replace(/^\/+/,``).replace(/\/{2,}/g,`/`)}function Pt(e){return P(e).replace(/\/+$/,``)}function Ft(e,t){return`${e}:${P(t)}`}function It(e){if(!e||typeof e!=`object`)return!1;let t=e;return typeof t.key==`string`&&typeof t.projectId==`string`&&typeof t.path==`string`&&typeof t.content==`string`&&typeof t.updatedAt==`number`}function Lt(e){if(!e||typeof e!=`object`)return!1;let t=e;return typeof t.id==`string`&&typeof t.name==`string`&&(t.backingKind===`browser-indexeddb`||t.backingKind===`bridge-filesystem`)&&typeof t.openedAt==`number`&&typeof t.updatedAt==`number`}function Rt(e){if(!e||typeof e!=`object`)return!1;let t=e;return t.key===Mt&&Array.isArray(t.projects)}function zt(e){let t=Date.now();return{id:e.id.trim(),name:e.name.trim(),backingKind:e.backingKind,openedAt:e.openedAt||t,updatedAt:e.updatedAt||t,defaultSourceRef:typeof e.defaultSourceRef==`string`?e.defaultSourceRef:null,rootPath:typeof e.rootPath==`string`?e.rootPath:void 0}}function Bt(e){let t=new Map;for(let n of e){let e=zt(n);if(!e.id||!e.name)continue;let r=t.get(e.id);t.set(e.id,{...r,...e,openedAt:r?.openedAt??e.openedAt,updatedAt:Math.max(r?.updatedAt??0,e.updatedAt),defaultSourceRef:e.defaultSourceRef??r?.defaultSourceRef??null})}return Array.from(t.values()).sort((e,t)=>e.name.localeCompare(t.name))}function Vt(e,t,n=Date.now()){let r=new Map;for(let i of t){let t=P(i.path);t&&r.set(t,{key:Ft(e,t),projectId:e,path:t,content:i.content,updatedAt:n})}return Array.from(r.values()).sort((e,t)=>e.path.localeCompare(t.path))}function Ht(e){return{path:e.path,content:e.content}}function Ut(){return typeof window<`u`&&window.localStorage!==void 0}function Wt(e){return`${Nt}:${e}`}function Gt(e){if(!Ut())return null;let t=window.localStorage.getItem(Wt(e));return t===`browser-indexeddb`||t===`bridge-filesystem`?t:null}function Kt(e,t){Ut()&&window.localStorage.setItem(Wt(e),t)}async function F(){let e=await pe();e.objectStoreNames.contains(`projectSessions`)&&e.objectStoreNames.contains(`projectFiles`)||(e.close(),await new Promise((t,n)=>{let r=indexedDB.open(e.name,e.version+1);r.onupgradeneeded=()=>{let e=r.result;if(e.objectStoreNames.contains(`projectSessions`)||e.createObjectStore(f,{keyPath:`key`}),!e.objectStoreNames.contains(`projectFiles`)){let t=e.createObjectStore(d,{keyPath:`key`});t.createIndex(`projectId`,`projectId`,{unique:!1}),t.createIndex(`projectIdPath`,[`projectId`,`path`],{unique:!0})}},r.onsuccess=()=>{r.result.close(),t()},r.onerror=()=>{n(r.error??Error(`Failed to initialize project stores.`))},r.onblocked=()=>{n(Error(`Project store upgrade is blocked by another open Pondview tab.`))}}))}var qt=class{async getProjectRegistry(){await F();let e=await t(f,Mt);return!e||!Rt(e)?[]:Bt(e.projects.filter(Lt))}async saveProjectRegistry(e){await n(f,{key:Mt,projects:Bt(e)})}async rememberProject(e){let t=await this.getProjectRegistry();await this.saveProjectRegistry([...t,e])}async getOpenProject(){await F();let e=await t(f,jt);return e?.project&&Lt(e.project)?e.project:null}async setOpenProject(e){if(await F(),e===null){await me(f,jt);return}let t=zt(e);if(!t.id||!t.name)throw Error(`Open project state requires a non-empty id and name.`);await n(f,{key:jt,project:t}),await this.rememberProject(t)}async listProjects(){await F();let e=await this.getOpenProject(),t=await this.getProjectRegistry();return Bt(e?[...t,e]:t)}async listProjectFiles(e){return await F(),(await ee(d)).filter(t=>It(t)&&t.projectId===e).sort((e,t)=>e.path.localeCompare(t.path)).map(Ht)}async readProjectFile(e,n){await F();let r=await t(d,Ft(e,n));return!r||!It(r)||r.projectId!==e?null:Ht(r)}async saveProjectFiles(e,t){await F();let n=Vt(e,t);n.length!==0&&await ne(d,n)}async deleteProjectFiles(e,t){await F();for(let n of t){let t=P(n);t&&await me(d,Ft(e,t))}}async replaceProjectFiles(e,t,n){await F();let r=Pt(t),i=Vt(e,n),a=new Set(i.map(e=>e.path)),o=(await this.listProjectFiles(e)).map(e=>e.path).filter(e=>(r.length===0||e===r||e.startsWith(`${r}/`))&&!a.has(e));o.length>0&&await this.deleteProjectFiles(e,o),i.length>0&&await ne(d,i)}},Jt={getProject:de,updateProject:ce,listFiles:oe,saveFiles:te,replaceFiles:he,deleteFiles:ae},Yt=class{constructor(e=Jt){this.deps=e}async getOpenProject(){let{project:e}=await this.deps.getProject();return e}async setOpenProject(e){e&&await this.deps.updateProject({name:e.name,defaultSourceRef:e.defaultSourceRef??null})}async listProjects(){let e=await this.getOpenProject();return e?[e]:[]}async listProjectFiles(e){return(await this.deps.listFiles()).files}async readProjectFile(e,t){return(await this.listProjectFiles(e)).find(e=>e.path===P(t))??null}async saveProjectFiles(e,t){await this.deps.saveFiles({files:t})}async deleteProjectFiles(e,t){await this.deps.deleteFiles({paths:t})}async replaceProjectFiles(e,t,n){await this.deps.replaceFiles({scopePath:t,files:n})}},Xt=class{constructor(){this.browser=new qt,this.bridge=new Yt}async activeStore(){if(!await Qt())return this.browser;let e=await this.bridge.getOpenProject();return e&&Gt(e.id)===`browser-indexeddb`?this.browser:this.bridge}async getOpenProject(){return(await this.activeStore()).getOpenProject()}async setOpenProject(e){await(await this.activeStore()).setOpenProject(e)}async listProjects(){return(await this.activeStore()).listProjects()}async listProjectFiles(e){return(await this.activeStore()).listProjectFiles(e)}async readProjectFile(e,t){return(await this.activeStore()).readProjectFile(e,t)}async saveProjectFiles(e,t){await(await this.activeStore()).saveProjectFiles(e,t)}async deleteProjectFiles(e,t){await(await this.activeStore()).deleteProjectFiles(e,t)}async replaceProjectFiles(e,t,n){await(await this.activeStore()).replaceProjectFiles(e,t,n)}},Zt={getSession:fe,getCapabilities:se};async function Qt(e=Zt){try{return(await e.getSession()).isQueryReady?(await e.getCapabilities()).projects===!0:!1}catch{return!1}}var $t=null;function I(){return $t||=new Xt,$t}async function L(){return I().getOpenProject()}async function en(e){await I().setOpenProject(e)}async function tn(){return I().listProjects()}async function nn(){let e=await L();return e?I().listProjectFiles(e.id):[]}async function rn(e){let t=await L();t&&await I().deleteProjectFiles(t.id,e)}async function an(e,t){let n=await L();n&&await I().replaceProjectFiles(n.id,e,t)}function on(e){if(e.projectPath){let t=e.projectPath.replace(/\\/g,`/`).split(`/`).filter(Boolean),n=t[t.indexOf(`dashboards`)+1];if(n?.trim())return n.trim()}return A(e.title,`dashboard`)}function sn(e){let t=typeof e==`string`?e.trim().replace(/\\/g,`/`).replace(/\/+$/,``):``;return t.length>0?t:null}function cn(e){try{let t=JSON.parse(e.content);return typeof t.id==`string`&&t.id.trim()?t.id.trim():null}catch{return null}}function ln(e,t){for(let n of e){let e=sn(n.path);if(!(!e||!/^pondview\/dashboards\/[^/]+\/dashboard\.json$/.test(e))&&cn(n)===t)return e.replace(/\/dashboard\.json$/,``)}return null}function un(e){return e.projectPath?.trim()?e.projectPath.trim().replace(/\\/g,`/`).replace(/\/+$/,``):`pondview/dashboards/${A(e.title,`dashboard`)}`}async function dn(e){let t=(await nn()).map(e=>e.path).filter(t=>t===e||t.startsWith(`${e}/`));t.length>0&&await rn(t)}async function fn(e){let t=await L();if(!t)return null;let n=await nn(),r=sn(e.dashboard.projectPath)??ln(n,e.dashboard.id),i={...e.dashboard,projectPath:r??e.dashboard.projectPath},a=Tt({dashboard:i,charts:e.charts,measures:e.measures,slicers:e.slicers,joins:e.joins,artifactId:on(i),fallbackSourceRef:t.defaultSourceRef??null,requireSourceRefs:!1});return r&&r!==a.rootPath&&await dn(r),await an(a.rootPath,Et(a)),{projectPath:a.rootPath}}async function pn(e){await L()&&await dn(un(e))}var R=`pondview`,mn=`pondview_exec`,hn=`pondview_snapshot`,gn=new Map;function z(e){return e==null?`NULL`:l(e)}function _n(e){return e==null?`NULL`:l(e)}function vn(e){return e?`TRUE`:`FALSE`}function B(e){return typeof e==`string`?e.trim():``}function V(e){let t=B(e);return t.length>0?t:null}function H(e,t){if(typeof e==`number`&&Number.isFinite(e))return e;if(typeof e==`bigint`)return Number(e);if(typeof e==`string`&&e.trim().length>0){let t=Number(e);if(Number.isFinite(t))return t}return t}function yn(e,t=!1){if(typeof e==`boolean`)return e;if(typeof e==`number`)return e!==0;if(typeof e==`string`){let t=e.trim().toLowerCase();if(t===`true`||t===`1`)return!0;if(t===`false`||t===`0`)return!1}return t}function bn(e){return e===`shared`?`shared`:`best-effort`}function U(e){return e===`bridge`||e===`duckdb-wasm`?e:null}function xn(e,t,n,r){return`${e}:${t}:${n??`__runtime_default__`}:${r??`__current__`}`}function Sn(){return{key:xn(`wasm-local`,`duckdb-wasm`,e),kind:`wasm-local`,dbIdentifier:e,sqlBackend:`duckdb-wasm`,storageStatus:`best-effort`}}function Cn(e){return{key:xn(`runtime-default`,e,null),kind:`runtime-default`,dbIdentifier:null,sqlBackend:e,storageStatus:`shared`}}function wn(e,t){return{key:xn(`attached-catalog`,e.sqlBackend,e.dbIdentifier,t),kind:`attached-catalog`,dbIdentifier:e.dbIdentifier,sqlBackend:e.sqlBackend,storageStatus:e.storageStatus,catalog:t,sourceKind:`attached`}}function Tn(e){return[`attached`,encodeURIComponent(e.backend),encodeURIComponent(e.dbIdentifier??``),encodeURIComponent(e.catalog),encodeURIComponent(e.dashboardId)].join(`:`)}function En(e){let t=e.split(`:`);if(t.length!==5||t[0]!==`attached`)return null;let n=decodeURIComponent(t[1]);if(n!==`duckdb-wasm`&&n!==`bridge`)return null;let r=decodeURIComponent(t[3]),i=decodeURIComponent(t[4]);return!r||!i?null:{backend:n,dbIdentifier:decodeURIComponent(t[2])||null,catalog:r,dashboardId:i}}function Dn(t){return t.kind===`wasm-local`?e:t.dbIdentifier}function On(e){return e.kind===`attached-catalog`&&e.catalog?`${i(e.catalog)}.${i(R)}`:i(R)}function W(e,t){return`${On(e)}.${i(t)}`}function kn(e){return e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)}async function An(e){if(e.kind===`attached-catalog`)return null;let t=gn.get(e.key);if(t!==void 0)return t;let n=V((await K(e,`SELECT current_catalog() AS current_catalog;`,{skipMetadataQualification:!0}).catch(()=>[]))[0]?.current_catalog),r=n?.toLowerCase()===R.toLowerCase()?n:null;return gn.set(e.key,r),r}function jn(e,t){if(!t)return e;let n=i(R),r=`${i(t)}.${n}`;return e.includes(`${r}.`)?e:Mn(e,e=>e.replace(RegExp(`SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${kn(n)}`,`gi`),e=>e.replace(n,r)).replace(RegExp(`${kn(n)}\\.(?!${kn(n)})`,`g`),`${r}.`))}function Mn(e,t){let n=``,r=0,i=0;for(;i<e.length;){if(e[i]!==`'`){i+=1;continue}n+=t(e.slice(r,i));let a=i;for(i+=1;i<e.length;){if(e[i]===`'`){if(e[i+1]===`'`){i+=2;continue}i+=1;break}i+=1}n+=e.slice(a,i),r=i}return n+=t(e.slice(r)),n}async function Nn(e,t){return jn(t,await An(e))}function Pn(e){return En(e)?.dashboardId??e}function Fn(e,t){return e.kind!==`attached-catalog`||!e.catalog?t:{...t,id:Tn({backend:e.sqlBackend,dbIdentifier:e.dbIdentifier,catalog:e.catalog,dashboardId:t.id}),runtimeBackend:e.sqlBackend,homeDbIdentifier:e.dbIdentifier,homeSqlBackend:e.sqlBackend,originalId:t.id,sourceKind:`attached`,sourceCatalog:e.catalog}}function In(e,t){if(e.kind!==`attached-catalog`||!e.catalog)return t;let n=Tn({backend:e.sqlBackend,dbIdentifier:e.dbIdentifier,catalog:e.catalog,dashboardId:t.dashboardId}),r=x({runtimeBackend:e.sqlBackend,dbIdentifier:e.dbIdentifier,catalogContext:t.catalogContext??e.catalog});return{...t,dashboardId:n,catalogContext:t.catalogContext??e.catalog,dbIdentifier:e.dbIdentifier,sqlBackend:e.sqlBackend,sourceDescriptor:r,sourceDescriptorJson:S(r),sourceCatalogContext:t.sourceCatalogContext??e.catalog}}function Ln(e,t){if(e.kind!==`attached-catalog`||!e.catalog)return t;let n=Tn({backend:e.sqlBackend,dbIdentifier:e.dbIdentifier,catalog:e.catalog,dashboardId:t.dashboardId}),r=x({runtimeBackend:e.sqlBackend,dbIdentifier:e.dbIdentifier,catalogContext:t.catalogContext??e.catalog});return{...t,dashboardId:n,catalogContext:t.catalogContext??e.catalog,dbIdentifier:e.dbIdentifier,sqlBackend:e.sqlBackend,sourceDescriptor:r,sourceDescriptorJson:S(r),sourceCatalogContext:t.sourceCatalogContext??e.catalog}}function Rn(){return s(le())}function zn(e){return e===void 0?Rn():s(e)}function Bn(e){let t=ie({backendPreference:e??re()});return t===`bridge`?Cn(t):Sn()}function Vn(e){let t=e.sourceDescriptor?.runtimeBackend??e.sqlBackend??null;return t===`bridge`?Cn(t):t===`duckdb-wasm`?Sn():Bn()}function G(){let e=new Map,t=t=>{e.set(t.key,t)};return t(Sn()),t(Bn()),Array.from(e.values())}function Hn(e){let t=e.backend===`duckdb-wasm`?Sn():Cn(e.backend);return e.dbIdentifier&&e.backend===`duckdb-wasm`?{...t,dbIdentifier:e.dbIdentifier,key:xn(t.kind,t.sqlBackend,e.dbIdentifier)}:t}async function Un(e){return V((await K(e,`SELECT current_catalog() AS current_catalog;`).catch(()=>[]))[0]?.current_catalog)}async function Wn(e){let t=new Map;for(let n of e){let e=await Un(n),r=await K(n,`SELECT DISTINCT table_catalog
       FROM information_schema.tables
       WHERE table_schema = ${l(R)}
         AND table_name = 'dashboards'
       ORDER BY table_catalog;`).catch(()=>[]);for(let i of r){let r=V(i.table_catalog);if(!r||n.kind===`wasm-local`&&r===`wasm:local`||e&&r.toLowerCase()===e.toLowerCase()||r.toLowerCase()===`memory`||r.toLowerCase()===`main`)continue;let a=wn(n,r);a.key!==n.key&&t.set(a.key,a)}}return Array.from(t.values())}function Gn(e){let t=B(e.id),n=B(e.title);return!t||!n?null:{id:t,title:n,createdAt:H(e.created_at,Date.now()),updatedAt:H(e.updated_at,Date.now()),columns:H(e.columns,4),autoFitRows:yn(e.auto_fit_rows,!1),runtimeBackend:U(e.runtime_backend)??U(e.home_sql_backend)??Bn().sqlBackend,activeSnapshotId:V(e.active_snapshot_id),homeDbIdentifier:V(e.home_db_identifier),homeSqlBackend:U(e.home_sql_backend)??U(e.runtime_backend),storageStatus:bn(e.storage_status),projectPath:V(e.project_path)}}function Kn(e){let t=B(e.id),n=B(e.dashboard_id),r=String(e.source_sql??e.sql??``),i=String(e.chart_config_json??``);if(!t||!n||!i)return null;let a=be(e.source_descriptor_json)??x({runtimeBackend:U(e.sql_backend)??Bn().sqlBackend,dbIdentifier:V(e.db_identifier),catalogContext:V(e.catalog_context)});return{id:t,dashboardId:n,title:V(e.title),description:V(e.description),sql:r,sourceDescriptor:a,sourceDescriptorJson:S(a)??null,snapshotId:V(e.snapshot_id),dbIdentifier:w(a),catalogContext:T(a),sqlBackend:C(a),chartConfigJson:i,semanticQueryJson:V(e.semantic_query_json),exploreName:V(e.explore_name),position:H(e.position,0),layoutX:e.layout_x==null?null:H(e.layout_x,0),layoutY:e.layout_y==null?null:H(e.layout_y,0),layoutW:e.layout_w==null?null:H(e.layout_w,1),layoutH:e.layout_h==null?null:H(e.layout_h,3),createdAt:H(e.created_at,Date.now()),updatedAt:H(e.updated_at,Date.now()),sourceSql:r,sourceDbIdentifier:w(a),sourceCatalogContext:T(a),sourceSqlBackend:C(a)}}function qn(e){let t=B(e.id),n=B(e.dashboard_id),r=B(e.key),i=B(e.label),a=String(e.source_sql??e.sql??``);if(!t||!n||!r||!i)return null;let o=be(e.source_descriptor_json)??x({runtimeBackend:U(e.sql_backend)??Bn().sqlBackend,dbIdentifier:V(e.db_identifier),catalogContext:V(e.catalog_context)});return{id:t,dashboardId:n,key:r,label:i,sql:a,sourceDescriptor:o,sourceDescriptorJson:S(o)??null,snapshotId:V(e.snapshot_id),dbIdentifier:w(o),catalogContext:T(o),sqlBackend:C(o),createdAt:H(e.created_at,Date.now()),updatedAt:H(e.updated_at,Date.now()),sourceSql:a,sourceDbIdentifier:w(o),sourceCatalogContext:T(o),sourceSqlBackend:C(o)}}function Jn(e){let t=B(e.id),n=B(e.dashboard_id),r=B(e.field);return!t||!n||!r?null:{id:t,dashboardId:n,field:r,title:V(e.title),limit:H(e.limit,50),position:H(e.position,0),createdAt:H(e.created_at,Date.now()),updatedAt:H(e.updated_at,Date.now())}}function Yn(e){let t=B(e.id),n=B(e.chart_id),r=B(e.field);return!t||!n||!r?null:{id:t,chartId:n,field:r,title:V(e.title),limit:H(e.limit,50),position:H(e.position,0),createdAt:H(e.created_at,Date.now()),updatedAt:H(e.updated_at,Date.now())}}async function K(e,t,n={}){return(await ue({sql:n.skipMetadataQualification?t:await Nn(e,t),dbIdentifier:e.dbIdentifier??void 0,backendPreference:e.sqlBackend,catalogContext:n.catalogContext??void 0})).rows}async function Xn(e,t){for(let n of t)await K(e,n)}async function q(e){try{return(await K(e,`SELECT 1
       FROM information_schema.tables
       WHERE table_schema = ${l(R)}
         ${e.kind===`attached-catalog`&&e.catalog?`AND table_catalog = ${l(e.catalog)}`:``}
         AND table_name = 'dashboards'
       LIMIT 1;`)).length>0}catch{return!1}}async function J(e){await Xn(e,[`CREATE SCHEMA IF NOT EXISTS ${i(R)};`,`CREATE SCHEMA IF NOT EXISTS ${i(mn)};`,`CREATE SCHEMA IF NOT EXISTS ${i(hn)};`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      columns INTEGER NOT NULL DEFAULT 4,
      auto_fit_rows BOOLEAN NOT NULL DEFAULT FALSE,
      runtime_backend TEXT NOT NULL,
      active_snapshot_id TEXT,
      home_db_identifier TEXT,
      home_sql_backend TEXT,
      storage_status TEXT NOT NULL DEFAULT 'best-effort',
      project_path TEXT
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_charts (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      sql TEXT NOT NULL,
      db_identifier TEXT,
      catalog_context TEXT,
      sql_backend TEXT,
      source_sql TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      snapshot_id TEXT,
      chart_config_json TEXT NOT NULL,
      semantic_query_json TEXT,
      explore_name TEXT,
      position INTEGER NOT NULL,
      layout_x INTEGER,
      layout_y INTEGER,
      layout_w INTEGER,
      layout_h INTEGER,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_measures (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      sql TEXT NOT NULL,
      db_identifier TEXT,
      catalog_context TEXT,
      sql_backend TEXT,
      source_sql TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      snapshot_id TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_slicers (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      field TEXT NOT NULL,
      title TEXT,
      ${i(`limit`)} INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.chart_slicers (
      id TEXT PRIMARY KEY,
      chart_id TEXT NOT NULL,
      field TEXT NOT NULL,
      title TEXT,
      ${i(`limit`)} INTEGER NOT NULL,
      position INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_join_defs (
      dashboard_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      left_table TEXT NOT NULL,
      left_column TEXT NOT NULL,
      right_table TEXT NOT NULL,
      right_column TEXT NOT NULL,
      join_type TEXT,
      PRIMARY KEY (dashboard_id, position)
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_source_caches (
      cache_id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      source_descriptor_hash TEXT NOT NULL,
      source_descriptor_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_cache_tables (
      cache_id TEXT NOT NULL,
      dashboard_id TEXT NOT NULL,
      canonical_table_name TEXT NOT NULL,
      cache_table_name TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (cache_id, canonical_table_name)
    );`,`CREATE TABLE IF NOT EXISTS ${i(R)}.dashboard_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      source_snapshot_id TEXT,
      source_descriptor_json TEXT NOT NULL,
      canonical_table_name TEXT NOT NULL,
      snapshot_table_name TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );`,`ALTER TABLE ${i(R)}.dashboards
     ADD COLUMN IF NOT EXISTS runtime_backend TEXT;`,`ALTER TABLE ${i(R)}.dashboards
     ADD COLUMN IF NOT EXISTS active_snapshot_id TEXT;`,`ALTER TABLE ${i(R)}.dashboards
     ADD COLUMN IF NOT EXISTS project_path TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS sql TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS db_identifier TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS catalog_context TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS sql_backend TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS source_sql TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS source_descriptor_json TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS snapshot_id TEXT;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_x INTEGER;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_y INTEGER;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_w INTEGER;`,`ALTER TABLE ${i(R)}.dashboard_charts
     ADD COLUMN IF NOT EXISTS layout_h INTEGER;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS sql TEXT;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS db_identifier TEXT;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS catalog_context TEXT;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS sql_backend TEXT;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS source_sql TEXT;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS source_descriptor_json TEXT;`,`ALTER TABLE ${i(R)}.dashboard_measures
     ADD COLUMN IF NOT EXISTS snapshot_id TEXT;`,`ALTER TABLE ${i(R)}.dashboard_cache_tables
     ADD COLUMN IF NOT EXISTS dashboard_id TEXT;`])}async function Zn(e){return await q(e)?(await K(e,`SELECT *
     FROM ${W(e,`dashboards`)}
     ORDER BY updated_at DESC;`)).map(e=>Gn(e)).filter(e=>e!==null).map(t=>Fn(e,t)):[]}async function Qn(e,t){if(!await q(e))return null;let n=Gn((await K(e,`SELECT *
     FROM ${W(e,`dashboards`)}
     WHERE id = ${l(Pn(t))}
     LIMIT 1;`))[0]??{})??null;return n?Fn(e,n):null}async function $n(e,t){if(!await q(e))return null;let n=Kn((await K(e,`SELECT *
     FROM ${W(e,`dashboard_charts`)}
     WHERE id = ${l(t)}
     LIMIT 1;`))[0]??{})??null;return n?In(e,n):null}async function er(e,t){if(!await q(e))return null;let n=qn((await K(e,`SELECT *
     FROM ${W(e,`dashboard_measures`)}
     WHERE id = ${l(t)}
     LIMIT 1;`))[0]??{})??null;return n?Ln(e,n):null}async function Y(e,t){return await q(e)?(await K(e,`SELECT *
     FROM ${W(e,`dashboard_charts`)}
     WHERE dashboard_id = ${l(Pn(t))}
     ORDER BY position ASC;`)).map(e=>Kn(e)).filter(e=>e!==null).map(t=>In(e,t)):[]}async function tr(e,t){return await q(e)?(await K(e,`SELECT *
     FROM ${W(e,`dashboard_measures`)}
     WHERE dashboard_id = ${l(Pn(t))}
     ORDER BY label ASC;`)).map(e=>qn(e)).filter(e=>e!==null).map(t=>Ln(e,t)):[]}async function nr(e,t){return await q(e)?(await K(e,`SELECT *
     FROM ${W(e,`dashboard_slicers`)}
     WHERE dashboard_id = ${l(Pn(t))}
     ORDER BY position ASC;`)).map(e=>Jn(e)).filter(e=>e!==null):[]}async function rr(e,t){return await q(e)?(await K(e,`SELECT *
     FROM ${W(e,`chart_slicers`)}
     WHERE chart_id = ${l(t)}
     ORDER BY position ASC;`)).map(e=>Yn(e)).filter(e=>e!==null):[]}async function ir(e,t){if(!await q(e))return[];let n=await K(e,`SELECT left_table, left_column, right_table, right_column, join_type
     FROM ${W(e,`dashboard_join_defs`)}
     WHERE dashboard_id = ${l(Pn(t))}
     ORDER BY position ASC;`),r=[];for(let e of n){let t=B(e.left_table),n=B(e.left_column),i=B(e.right_table),a=B(e.right_column);!t||!n||!i||!a||r.push({leftTable:t,leftColumn:n,rightTable:i,rightColumn:a,type:e.join_type===`inner`||e.join_type===`left`||e.join_type===`right`||e.join_type===`full`?e.join_type:`left`})}return s(r)}async function ar(e,t,n){await J(e),await K(e,`DELETE FROM ${i(R)}.dashboard_join_defs
     WHERE dashboard_id = ${l(t)};`);let r=s(n);for(let n=0;n<r.length;n+=1){let a=r[n];await K(e,`INSERT OR REPLACE INTO ${i(R)}.dashboard_join_defs (
        dashboard_id,
        position,
        left_table,
        left_column,
        right_table,
        right_column,
        join_type
      ) VALUES (
        ${l(t)},
        ${n},
        ${l(a.leftTable)},
        ${l(a.leftColumn)},
        ${l(a.rightTable)},
        ${l(a.rightColumn)},
        ${l(a.type??`left`)}
      );`)}}async function X(e,t){await J(e),await K(e,`INSERT OR REPLACE INTO ${i(R)}.dashboards (
      id,
      title,
      created_at,
      updated_at,
      columns,
      auto_fit_rows,
      runtime_backend,
      active_snapshot_id,
      home_db_identifier,
      home_sql_backend,
      storage_status,
      project_path
    ) VALUES (
      ${l(t.id)},
      ${l(t.title)},
      ${t.createdAt},
      ${t.updatedAt},
      ${t.columns},
      ${vn(t.autoFitRows)},
      ${l(t.runtimeBackend)},
      ${z(t.activeSnapshotId)},
      ${z(t.homeDbIdentifier)},
      ${_n(t.homeSqlBackend)},
      ${l(t.storageStatus??`best-effort`)},
      ${z(t.projectPath)}
    );`)}async function Z(e,t){await J(e);let n=t.sourceDescriptorJson??S(t.sourceDescriptor??null);await K(e,`INSERT OR REPLACE INTO ${i(R)}.dashboard_charts (
      id,
      dashboard_id,
      title,
      description,
      sql,
      db_identifier,
      catalog_context,
      sql_backend,
      source_sql,
      source_descriptor_json,
      snapshot_id,
      chart_config_json,
      semantic_query_json,
      explore_name,
      position,
      layout_x,
      layout_y,
      layout_w,
      layout_h,
      created_at,
      updated_at
    ) VALUES (
      ${l(t.id)},
      ${l(t.dashboardId)},
      ${z(t.title)},
      ${z(t.description)},
      ${l(t.sql)},
      ${z(t.dbIdentifier)},
      ${z(t.catalogContext??null)},
      ${_n(t.sqlBackend)},
      ${l(t.sql)},
      ${l(n??`{}`)},
      ${z(t.snapshotId??null)},
      ${l(t.chartConfigJson)},
      ${z(t.semanticQueryJson)},
      ${z(t.exploreName)},
      ${t.position},
      ${t.layoutX??`NULL`},
      ${t.layoutY??`NULL`},
      ${t.layoutW??`NULL`},
      ${t.layoutH??`NULL`},
      ${t.createdAt},
      ${t.updatedAt}
    );`)}function or(e,t){return e.x<t.x+t.w&&e.x+e.w>t.x&&e.y<t.y+t.h&&e.y+e.h>t.y}function sr(e,t,n){let r=Math.max(1,t??4),i=1;try{let e=JSON.parse(n);typeof e.colSpan==`number`&&Number.isFinite(e.colSpan)&&(i=e.colSpan)}catch{i=1}let a=Math.min(r,Math.max(1,Math.round(i))),o=e.map(e=>{let t=Math.min(r,Math.max(1,Math.round(e.layoutW??1)));return{x:Math.min(Math.max(0,Math.round(e.layoutX??e.position%r)),Math.max(0,r-t)),y:Math.max(0,Math.round(e.layoutY??Math.floor(e.position/r)*3)),w:t,h:Math.max(1,Math.round(e.layoutH??3))}}),s=o.reduce((e,t)=>Math.max(e,t.y+t.h),0),c=Array.from(new Set([0,...o.flatMap(e=>[e.y,e.y+e.h]),s])).sort((e,t)=>e-t);for(let e of c)for(let t=0;t<=r-a;t+=1){let n={x:t,y:e,w:a,h:3};if(!o.some(e=>or(n,e)))return{layoutX:t,layoutY:e,layoutW:a,layoutH:3}}return{layoutX:0,layoutY:s,layoutW:a,layoutH:3}}async function cr(e,t){await J(e);let n=t.sourceDescriptorJson??S(t.sourceDescriptor??null);await K(e,`INSERT OR REPLACE INTO ${i(R)}.dashboard_measures (
      id,
      dashboard_id,
      key,
      label,
      sql,
      db_identifier,
      catalog_context,
      sql_backend,
      source_sql,
      source_descriptor_json,
      snapshot_id,
      created_at,
      updated_at
    ) VALUES (
      ${l(t.id)},
      ${l(t.dashboardId)},
      ${l(t.key)},
      ${l(t.label)},
      ${l(t.sql)},
      ${z(t.dbIdentifier)},
      ${z(t.catalogContext??null)},
      ${_n(t.sqlBackend)},
      ${l(t.sql)},
      ${l(n??`{}`)},
      ${z(t.snapshotId??null)},
      ${t.createdAt},
      ${t.updatedAt}
    );`)}async function lr(e,t){await J(e),await K(e,`INSERT OR REPLACE INTO ${i(R)}.dashboard_slicers (
      id,
      dashboard_id,
      field,
      title,
      ${i(`limit`)},
      position,
      created_at,
      updated_at
    ) VALUES (
      ${l(t.id)},
      ${l(t.dashboardId)},
      ${l(t.field)},
      ${z(t.title)},
      ${t.limit},
      ${t.position},
      ${t.createdAt},
      ${t.updatedAt}
    );`)}async function ur(e,t){await J(e),await K(e,`INSERT OR REPLACE INTO ${i(R)}.chart_slicers (
      id,
      chart_id,
      field,
      title,
      ${i(`limit`)},
      position,
      created_at,
      updated_at
    ) VALUES (
      ${l(t.id)},
      ${l(t.chartId)},
      ${l(t.field)},
      ${z(t.title)},
      ${t.limit},
      ${t.position},
      ${t.createdAt},
      ${t.updatedAt}
    );`)}async function Q(e,t,n){let r=await Qn(e,t);r&&(await X(e,{...r,updatedAt:n}),await dr(e,t))}async function dr(e,t){let n=await Qn(e,t);if(!n)return;let[r,i,a,o]=await Promise.all([Y(e,t),tr(e,t),nr(e,t),ir(e,t)]),s=await fn({dashboard:n,charts:r,measures:i,slicers:a,joins:o});s&&s.projectPath!==n.projectPath&&await X(e,{...n,projectPath:s.projectPath})}function fr(e,t){if(t&&t.runtimeBackend!==e.runtimeBackend)throw Error(`Dashboard backend mismatch: expected ${e.runtimeBackend} but received ${t.runtimeBackend}.`)}async function pr(e,t){let n=t.sourceDescriptor??(t.sqlBackend?x({runtimeBackend:t.sqlBackend,dbIdentifier:t.dbIdentifier,catalogContext:t.catalogContext}):x({runtimeBackend:e.sqlBackend,dbIdentifier:t.dbIdentifier,catalogContext:t.catalogContext}));return{sql:t.sql,sourceDescriptor:n,sourceDescriptorJson:S(n)??null,snapshotId:null,dbIdentifier:w(n),catalogContext:T(n),sqlBackend:C(n)??e.sqlBackend}}var $=new class{async resolveDashboardTarget(e){let t=En(e);if(t){let e=wn(Hn(t),t.catalog),n=await Qn(e,t.dashboardId).catch(()=>null);return n?{target:e,dashboard:n}:null}let n=G();for(let t of n){let n=await Qn(t,e).catch(()=>null);if(n)return{target:t,dashboard:n}}return null}async resolveChartTarget(e){let t=G();for(let n of t){let t=await $n(n,e).catch(()=>null);if(t)return{target:n,chart:t}}return null}async resolveMeasureTarget(e){let t=G();for(let n of t){let t=await er(n,e).catch(()=>null);if(t)return{target:n,measure:t}}return null}async listDashboards(){let e=G(),t=await Wn(e),n=new Map;for(let t of e){let e=await Zn(t).catch(()=>[]);for(let t of e){let e=n.get(t.id);(!e||e.updatedAt<t.updatedAt)&&n.set(t.id,t)}}for(let e of t){let t=await Zn(e).catch(()=>[]);for(let e of t)n.set(e.id,e)}return Array.from(n.values()).sort((e,t)=>t.updatedAt-e.updatedAt)}async createDashboard(e,t={}){let n=t.now??Date.now(),r=u(),i=Vn(t),a=t.sourceDescriptor?.runtimeBackend??t.sqlBackend??i.sqlBackend;return await X(i,{id:r,title:e,createdAt:n,updatedAt:n,columns:4,autoFitRows:!1,runtimeBackend:a,activeSnapshotId:null,homeDbIdentifier:Dn(i),homeSqlBackend:a,storageStatus:i.storageStatus}),await ar(i,r,zn(t.joinDefs)),await dr(i,r),{id:r}}async replaceDashboardFromProject(e){let t=Vn({dbIdentifier:e.dashboard.homeDbIdentifier??null,sqlBackend:e.dashboard.homeSqlBackend??e.dashboard.runtimeBackend??null}),n=e.dashboard.runtimeBackend??e.dashboard.homeSqlBackend??t.sqlBackend,r=e.dashboard.updatedAt||Date.now();await J(t),await Xn(t,[`DELETE FROM ${i(R)}.chart_slicers
       WHERE chart_id IN (
         SELECT id
         FROM ${i(R)}.dashboard_charts
         WHERE dashboard_id = ${l(e.dashboard.id)}
       );`,`DELETE FROM ${i(R)}.dashboard_charts
       WHERE dashboard_id = ${l(e.dashboard.id)};`,`DELETE FROM ${i(R)}.dashboard_measures
       WHERE dashboard_id = ${l(e.dashboard.id)};`,`DELETE FROM ${i(R)}.dashboard_slicers
       WHERE dashboard_id = ${l(e.dashboard.id)};`,`DELETE FROM ${i(R)}.dashboard_join_defs
       WHERE dashboard_id = ${l(e.dashboard.id)};`,`DELETE FROM ${i(R)}.dashboard_cache_tables
       WHERE dashboard_id = ${l(e.dashboard.id)};`,`DELETE FROM ${i(R)}.dashboard_source_caches
       WHERE dashboard_id = ${l(e.dashboard.id)};`,`DELETE FROM ${i(R)}.dashboard_snapshots
       WHERE dashboard_id = ${l(e.dashboard.id)};`]),await X(t,{...e.dashboard,createdAt:e.dashboard.createdAt||r,updatedAt:r,columns:e.dashboard.columns??4,autoFitRows:e.dashboard.autoFitRows??!1,runtimeBackend:n,activeSnapshotId:null,homeDbIdentifier:Dn(t),homeSqlBackend:n,storageStatus:t.storageStatus}),await ar(t,e.dashboard.id,e.joinDefs);for(let n of e.measures)await cr(t,{...n,dashboardId:e.dashboard.id,snapshotId:null});for(let n of e.charts)await Z(t,{...n,dashboardId:e.dashboard.id,snapshotId:null});for(let n of e.slicers)await lr(t,{...n,dashboardId:e.dashboard.id});return{id:e.dashboard.id}}async updateDashboardTitle(e,t,n=Date.now()){let r=await this.resolveDashboardTarget(e);return r?(await X(r.target,{...r.dashboard,title:t,updatedAt:n}),await dr(r.target,e),{updated:!0}):{updated:!1}}async updateDashboardSettings(e,t){let n=await this.resolveDashboardTarget(e);return n?(await X(n.target,{...n.dashboard,columns:t.columns??n.dashboard.columns,autoFitRows:t.autoFitRows??n.dashboard.autoFitRows,updatedAt:t.now??Date.now()}),await dr(n.target,e),{updated:!0}):{updated:!1}}async getDashboardWithCharts(e){let t=await this.resolveDashboardTarget(e);if(!t)return null;let n=await Y(t.target,e);return{dashboard:t.dashboard,charts:n}}async listChartsByDashboard(e){let t=await this.resolveDashboardTarget(e);return t?Y(t.target,e):[]}async getChartById(e){return(await this.resolveChartTarget(e))?.chart??null}async listMeasuresByDashboard(e){let t=await this.resolveDashboardTarget(e);return t?tr(t.target,e):[]}async getMeasureById(e){return(await this.resolveMeasureTarget(e))?.measure??null}async createDashboardMeasure(e){let t=await this.resolveDashboardTarget(e.dashboardId);if(!t)throw Error(`Dashboard not found`);if((await tr(t.target,e.dashboardId)).some(t=>t.key===e.key))throw Error(`Measure key already exists on this dashboard`);let n=e.now??Date.now(),r=await pr(t.target,e);return fr(t.dashboard,r.sourceDescriptor),await cr(t.target,{id:u(),dashboardId:e.dashboardId,key:e.key,label:e.label,sql:r.sql,dbIdentifier:r.dbIdentifier,catalogContext:r.catalogContext,sqlBackend:r.sqlBackend,createdAt:n,updatedAt:n,sourceDescriptor:r.sourceDescriptor,sourceDescriptorJson:r.sourceDescriptorJson,snapshotId:r.snapshotId,sourceSql:r.sql,sourceDbIdentifier:r.dbIdentifier,sourceCatalogContext:r.catalogContext,sourceSqlBackend:r.sqlBackend}),await Q(t.target,e.dashboardId,n),{id:(await tr(t.target,e.dashboardId)).find(t=>t.key===e.key)?.id??``}}async updateDashboardMeasure(e,t){let n=await this.resolveMeasureTarget(e);if(!n)return{updated:!1};let r=await this.resolveDashboardTarget(n.measure.dashboardId);if(!r)return{updated:!1};let i=t.now??Date.now(),a=t.sql!==void 0||t.dbIdentifier!==void 0||t.catalogContext!==void 0||t.sqlBackend!==void 0?await pr(n.target,{sql:t.sql??n.measure.sql,sourceDescriptor:t.sourceDescriptor??n.measure.sourceDescriptor??x({runtimeBackend:n.measure.sqlBackend??n.target.sqlBackend,dbIdentifier:n.measure.dbIdentifier,catalogContext:n.measure.catalogContext??null}),dbIdentifier:t.dbIdentifier,catalogContext:t.catalogContext,sqlBackend:t.sqlBackend}):null;fr(r.dashboard,a?.sourceDescriptor??n.measure.sourceDescriptor??null),await cr(n.target,{...n.measure,label:t.label??n.measure.label,sql:a?.sql??n.measure.sql,dbIdentifier:a?.dbIdentifier??n.measure.dbIdentifier,catalogContext:a?.catalogContext??n.measure.catalogContext,sqlBackend:a?.sqlBackend??n.measure.sqlBackend,sourceDescriptor:a?.sourceDescriptor??n.measure.sourceDescriptor,sourceDescriptorJson:a?.sourceDescriptorJson??n.measure.sourceDescriptorJson,snapshotId:a?.snapshotId??n.measure.snapshotId,sourceSql:a?.sql??n.measure.sourceSql,sourceDbIdentifier:a?.dbIdentifier??n.measure.sourceDbIdentifier,sourceCatalogContext:a?.catalogContext??n.measure.sourceCatalogContext,sourceSqlBackend:a?.sqlBackend??n.measure.sourceSqlBackend,updatedAt:i});let o=(await Y(n.target,n.measure.dashboardId)).filter(t=>{try{let n=JSON.parse(t.chartConfigJson);return n.configType===`card`&&n.measureId===e}catch{return!1}});for(let e of o)await Z(n.target,{...e,sql:a?.sql??e.sql,dbIdentifier:a?.dbIdentifier??e.dbIdentifier,catalogContext:a?.catalogContext??e.catalogContext,sqlBackend:a?.sqlBackend??e.sqlBackend,sourceDescriptor:a?.sourceDescriptor??e.sourceDescriptor,sourceDescriptorJson:a?.sourceDescriptorJson??e.sourceDescriptorJson,snapshotId:a?.snapshotId??e.snapshotId,sourceSql:a?.sql??e.sourceSql,sourceDbIdentifier:a?.dbIdentifier??e.sourceDbIdentifier,sourceCatalogContext:a?.catalogContext??e.sourceCatalogContext,sourceSqlBackend:a?.sqlBackend??e.sourceSqlBackend,updatedAt:i});return await Q(n.target,n.measure.dashboardId,i),{updated:!0}}async addChartToDashboard(e){let t=await this.resolveDashboardTarget(e.dashboardId);if(!t)throw Error(`Dashboard not found`);let n=e.now??Date.now(),r=await Y(t.target,e.dashboardId),i=await pr(t.target,e);fr(t.dashboard,i.sourceDescriptor);let a=u(),o=r.reduce((e,t)=>Math.max(e,t.position),-1),s=sr(r,t.dashboard.columns,e.chartConfigJson);return await Z(t.target,{id:a,dashboardId:e.dashboardId,title:e.title??null,description:e.description??null,sql:i.sql,dbIdentifier:i.dbIdentifier,catalogContext:i.catalogContext,sqlBackend:i.sqlBackend,chartConfigJson:e.chartConfigJson,semanticQueryJson:e.semanticQueryJson??null,exploreName:e.exploreName??null,position:o+1,...s,createdAt:n,updatedAt:n,sourceDescriptor:i.sourceDescriptor,sourceDescriptorJson:i.sourceDescriptorJson,snapshotId:i.snapshotId,sourceSql:i.sql,sourceDbIdentifier:i.dbIdentifier,sourceCatalogContext:i.catalogContext,sourceSqlBackend:i.sqlBackend}),await Q(t.target,e.dashboardId,n),{id:a}}async updateChartConfig(e,t,n=Date.now()){let r=await this.resolveChartTarget(e);return r?(await Z(r.target,{...r.chart,chartConfigJson:t,updatedAt:n}),await Q(r.target,r.chart.dashboardId,n),{updated:!0}):{updated:!1}}async updateChartLayout(e,t,n,r=Date.now()){let i=await this.resolveChartTarget(e);return i?(await Z(i.target,{...i.chart,position:n,layoutX:t.x,layoutY:t.y,layoutW:t.w,layoutH:t.h,updatedAt:r}),await Q(i.target,i.chart.dashboardId,r),{updated:!0}):{updated:!1}}async updateChartSql(e,t,n=Date.now()){let r=await this.resolveChartTarget(e);return r?(await Z(r.target,{...r.chart,sql:t,updatedAt:n}),await Q(r.target,r.chart.dashboardId,n),{updated:!0}):{updated:!1}}async reorderDashboardCharts(e,t,n=Date.now()){let r=await this.resolveDashboardTarget(e);if(!r)throw Error(`Dashboard not found`);let i=await Y(r.target,e),a=i.map(e=>e.id);if(a.length!==t.length||new Set(t).size!==t.length||t.some(e=>!a.includes(e)))throw Error(`Ordered chart ids do not match dashboard charts`);for(let e=0;e<t.length;e+=1){let a=i.find(n=>n.id===t[e]);if(!a)throw Error(`Invalid chart ordering`);await Z(r.target,{...a,position:e,updatedAt:n})}await Q(r.target,e,n)}async removeChartFromDashboard(e,t=Date.now()){let n=await this.resolveChartTarget(e);return n?(await K(n.target,`DELETE FROM ${i(R)}.chart_slicers
       WHERE chart_id = ${l(e)};`),await K(n.target,`DELETE FROM ${i(R)}.dashboard_charts
       WHERE id = ${l(e)};`),await Q(n.target,n.chart.dashboardId,t),{removed:!0}):{removed:!1}}async deleteDashboard(e){let t=await this.resolveDashboardTarget(e);return t?(await Xn(t.target,[`DELETE FROM ${i(R)}.chart_slicers
       WHERE chart_id IN (
         SELECT id
         FROM ${i(R)}.dashboard_charts
         WHERE dashboard_id = ${l(e)}
       );`,`DELETE FROM ${i(R)}.dashboard_charts
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboard_measures
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboard_slicers
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboard_join_defs
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboard_cache_tables
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboard_source_caches
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboard_snapshots
       WHERE dashboard_id = ${l(e)};`,`DELETE FROM ${i(R)}.dashboards
       WHERE id = ${l(e)};`]),await pn({title:t.dashboard.title,projectPath:t.dashboard.projectPath??null}),{deleted:!0}):{deleted:!1}}async listSlicersByDashboard(e){let t=await this.resolveDashboardTarget(e);return t?nr(t.target,e):[]}async addSlicerToDashboard(e){let t=await this.resolveDashboardTarget(e.dashboardId);if(!t)throw Error(`Dashboard not found`);let n=e.now??Date.now(),r=(await nr(t.target,e.dashboardId)).reduce((e,t)=>Math.max(e,t.position),-1),i=u();return await lr(t.target,{id:i,dashboardId:e.dashboardId,field:e.field,title:e.title??null,limit:e.limit??50,position:r+1,createdAt:n,updatedAt:n}),await Q(t.target,e.dashboardId,n),{id:i}}async updateSlicer(e){let t=G();for(let n of t){let t=Jn((await K(n,`SELECT *
         FROM ${i(R)}.dashboard_slicers
         WHERE id = ${l(e.slicerId)}
         LIMIT 1;`).catch(()=>[]))[0]??{});if(!t)continue;let r=e.now??Date.now();return await lr(n,{...t,title:e.title===void 0?t.title:e.title,limit:e.limit===void 0?t.limit:e.limit,updatedAt:r}),await Q(n,t.dashboardId,r),{updated:!0}}return{updated:!1}}async reorderDashboardSlicers(e,t,n=Date.now()){let r=await this.resolveDashboardTarget(e);if(!r)throw Error(`Dashboard not found`);let i=await nr(r.target,e),a=i.map(e=>e.id);if(a.length!==t.length||new Set(t).size!==t.length||t.some(e=>!a.includes(e)))throw Error(`Ordered slicer ids do not match dashboard slicers`);for(let e=0;e<t.length;e+=1){let a=i.find(n=>n.id===t[e]);if(!a)throw Error(`Invalid slicer ordering`);await lr(r.target,{...a,position:e,updatedAt:n})}await Q(r.target,e,n)}async removeSlicerFromDashboard(e,t=Date.now()){let n=G();for(let r of n){let n=Jn((await K(r,`SELECT *
         FROM ${i(R)}.dashboard_slicers
         WHERE id = ${l(e)}
         LIMIT 1;`).catch(()=>[]))[0]??{});if(n)return await K(r,`DELETE FROM ${i(R)}.dashboard_slicers
         WHERE id = ${l(e)};`),await Q(r,n.dashboardId,t),{removed:!0}}return{removed:!1}}async listSlicersByChart(e){let t=await this.resolveChartTarget(e);return t?rr(t.target,e):[]}async addSlicerToChart(e){let t=await this.resolveChartTarget(e.chartId);if(!t)throw Error(`Chart not found`);let n=e.now??Date.now(),r=(await rr(t.target,e.chartId)).reduce((e,t)=>Math.max(e,t.position),-1),i=u();return await ur(t.target,{id:i,chartId:e.chartId,field:e.field,title:e.title??null,limit:e.limit??50,position:r+1,createdAt:n,updatedAt:n}),await Q(t.target,t.chart.dashboardId,n),{id:i}}async updateChartSlicer(e){let t=G();for(let n of t){let t=Yn((await K(n,`SELECT *
         FROM ${i(R)}.chart_slicers
         WHERE id = ${l(e.slicerId)}
         LIMIT 1;`).catch(()=>[]))[0]??{});if(!t)continue;let r=e.now??Date.now();await ur(n,{...t,title:e.title===void 0?t.title:e.title,limit:e.limit===void 0?t.limit:e.limit,updatedAt:r});let a=await $n(n,t.chartId);return a&&await Q(n,a.dashboardId,r),{updated:!0}}return{updated:!1}}async reorderChartSlicers(e,t,n=Date.now()){let r=await this.resolveChartTarget(e);if(!r)throw Error(`Chart not found`);let i=await rr(r.target,e),a=i.map(e=>e.id);if(a.length!==t.length||new Set(t).size!==t.length||t.some(e=>!a.includes(e)))throw Error(`Ordered slicer ids do not match chart slicers`);for(let e=0;e<t.length;e+=1){let a=i.find(n=>n.id===t[e]);if(!a)throw Error(`Invalid slicer ordering`);await ur(r.target,{...a,position:e,updatedAt:n})}await Q(r.target,r.chart.dashboardId,n)}async removeSlicerFromChart(e,t=Date.now()){let n=G();for(let r of n){let n=Yn((await K(r,`SELECT *
         FROM ${i(R)}.chart_slicers
         WHERE id = ${l(e)}
         LIMIT 1;`).catch(()=>[]))[0]??{});if(!n)continue;await K(r,`DELETE FROM ${i(R)}.chart_slicers
         WHERE id = ${l(e)};`);let a=await $n(r,n.chartId);return a&&await Q(r,a.dashboardId,t),{removed:!0}}return{removed:!1}}async listJoinDefsByDashboard(e){let t=await this.resolveDashboardTarget(e);if(!t)return Rn();let n=await ir(t.target,e);return n.length>0?n:Rn()}},mr=()=>$.listDashboards();function hr(e,t){return $.createDashboard(e,t)}var gr=e=>$.replaceDashboardFromProject(e),_r=(e,t,n=Date.now())=>$.updateDashboardTitle(e,t,n),vr=e=>$.listChartsByDashboard(e),yr=e=>$.listMeasuresByDashboard(e),br=(e,t)=>$.updateDashboardMeasure(e,t),xr=e=>$.addChartToDashboard(e),Sr=(e,t,n=Date.now())=>$.updateChartConfig(e,t,n),Cr=(e,t,n=Date.now())=>$.updateChartSql(e,t,n),wr=(e,t,n,r=Date.now())=>$.updateChartLayout(e,t,n,r),Tr=(e,t=Date.now())=>$.removeChartFromDashboard(e,t),Er=e=>$.deleteDashboard(e),Dr=e=>$.listSlicersByDashboard(e),Or=e=>$.addSlicerToDashboard(e),kr=(e,t=Date.now())=>$.removeSlicerFromDashboard(e,t),Ar=e=>$.listSlicersByChart(e),jr=e=>$.addSlicerToChart(e),Mr=(e,t=Date.now())=>$.removeSlicerFromChart(e,t),Nr=e=>$.listJoinDefsByDashboard(e);export{w as $,ht as A,nt as B,I as C,an as D,tn as E,A as F,Ye as G,at as H,qe as I,Re as J,ze as K,Ze as L,Dt as M,At as N,en as O,Ot as P,T as Q,et as R,L as S,nn as T,rt as U,Je as V,We as W,Te as X,we as Y,x as Z,wr as _,Er as a,_r as b,Nr as c,Dr as d,C as et,Tr as f,Sr as g,gr as h,hr as i,kt as j,Kt as k,yr as l,kr as m,jr as n,S as nt,vr as o,Mr as p,Le as q,Or as r,mr as s,xr as t,b as tt,Ar as u,Cr as v,Gt as w,rn as x,br as y,tt as z};