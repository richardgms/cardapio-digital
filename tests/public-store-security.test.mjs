import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import publicStoreModule from '../src/lib/public-store.ts';
const { loadPublicStore, PUBLIC_STORE_WITH_HOURS } = publicStoreModule;
const runtime=createRequire(new URL('../docs/sql-test-runtime/package.json',import.meta.url));
const {PGlite}=await import(pathToFileURL(runtime.resolve('@electric-sql/pglite')).href);
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const writeMigration=read('../database/migrations/2026100803_harden_config_and_image_writes.sql');
const readMigration=read('../database/migrations/2026100804_private_store_configuration.sql');
const reference=JSON.parse(read('../database/reference/public-storage-preflight-20261008.json'));
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
async function fixture(apply=true){
 const database=new PGlite();
 const columns=reference.effective_column_permissions.filter(x=>x.relation_name==='store_config'&&x.role_name==='anon').map(x=>`${x.column_name} ${x.data_type}${x.column_name==='id'?' primary key':x.column_name==='created_at'?' default now()':x.column_name==='table_mode_available'?' default false':''}`).join(',');
 await database.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; grant usage on schema auth to public;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
 create table public.print_settings(enabled boolean); insert into public.print_settings values(false);
 create table public.store_config(${columns});
 grant all on public.store_config to anon,authenticated,service_role;
 alter table public.store_config enable row level security;
 create policy public_read on public.store_config for select to public using(true);
 create policy owner_write on public.store_config for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
 create table public.admin_impersonation_logs(id uuid primary key,payload jsonb);
 grant all on public.admin_impersonation_logs to public,service_role;
 alter table public.admin_impersonation_logs enable row level security;
 create policy legacy_logs on public.admin_impersonation_logs for all to public using(true) with check(true);
 create schema storage; grant usage on schema storage to public;
 create table storage.buckets(id text primary key,public boolean);
 insert into storage.buckets values('images',true);
 create table storage.objects(id uuid primary key,bucket_id text,owner_id text,name text,unique(bucket_id,name));
 grant all on storage.objects to anon,authenticated,service_role;
 alter table storage.objects enable row level security;
 create policy public_images on storage.objects for select to public using(bucket_id='images');
 create policy legacy_storage_write on storage.objects for all to public using(true) with check(true);
 insert into store_config(id,name,admin_email,created_at,table_mode_available) values('${a}','Loja A','privado-a@example.invalid',now(),true),('${b}','Loja B','privado-b@example.invalid',now(),false);
 insert into storage.objects values('${a}','images','${a}','a.jpg'),('${b}','images','${b}','b.jpg');
 insert into admin_impersonation_logs values('${a}','{}');`);
 if(apply)await database.exec(writeMigration);
 return database;
}
let db;
before(async()=>{db=await fixture();}); after(async()=>{await db.close();});
beforeEach(async()=>{await db.exec('begin');}); afterEach(async()=>{await db.exec('rollback');});
async function asRole(database,role,uid,fn){
 await database.exec(`set local role ${role}`);
 await database.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.email',$2,true)",[uid||'',uid?'identidade@example.invalid':'']);
 try{return await fn();}finally{await database.exec('reset role');}
}
async function denied(database,fn){
 await database.exec('savepoint denied');
 try{await assert.rejects(fn,/permission denied|protected|protegido|administrativo|row-level security/i);}
 finally{await database.exec('rollback to savepoint denied; release savepoint denied');}
}
test('escrita endurecida preserva leitura pública antiga até o deploy e é reaplicável',async()=>{
 await asRole(db,'anon',null,async()=>assert.equal((await db.query('select * from store_config')).rows.length,2));
 // Reaplicação em banco independente, sem interferir na transação do teste.
 const other=await fixture();try{await other.exec(writeMigration);}finally{await other.close();}
});
test('formulário antigo com e-mail somente leitura e upsert conserva funcionamento',async()=>{
 await asRole(db,'authenticated',a,async()=>{
   await db.query("insert into store_config(id,name,admin_email) values($1,'Nome novo','privado-a@example.invalid') on conflict(id) do update set name=excluded.name,admin_email=excluded.admin_email",[a]);
   assert.equal((await db.query('select name from store_config where id=$1',[a])).rows[0].name,'Nome novo');
 });
});
for(const [column,value] of [['admin_email',"'falso@example.invalid'"],['table_mode_available','false'],['created_at',"'2000-01-01'::timestamptz"]]){
 test(`cliente não altera ${column}, inclusive na própria loja`,async()=>{
   await asRole(db,'authenticated',a,()=>denied(db,()=>db.query(`update store_config set ${column}=${value} where id=$1`,[a])));
 });
}
test('cadastro do cliente deriva identidade do JWT e não concede plano',async()=>{
 const c='10000000-0000-4000-8000-000000000003';
 await asRole(db,'authenticated',c,async()=>{
  await denied(db,()=>db.query('insert into store_config(id,table_mode_available) values($1,true)',[c]));
  await db.query("insert into store_config(id,admin_email,created_at) values($1,'forjado','2000-01-01')",[c]);
  const row=(await db.query('select admin_email,created_at from store_config where id=$1',[c])).rows[0];
  assert.equal(row.admin_email,'identidade@example.invalid');assert.notEqual(new Date(row.created_at).getFullYear(),2000);
 });
});
test('servidor conserva gestão administrativa; clientes não acessam logs mesmo com policy ampla',async()=>{
 await asRole(db,'service_role',null,()=>db.query("update store_config set table_mode_available=true where id=$1",[b]));
 for(const role of ['anon','authenticated'])await asRole(db,role,role==='authenticated'?a:null,()=>denied(db,()=>db.query('select * from admin_impersonation_logs')));
 await asRole(db,'service_role',null,async()=>assert.equal((await db.query('select * from admin_impersonation_logs')).rows.length,1));
});
test('imagem permanece pública; dono atualiza e exclui apenas seu arquivo',async()=>{
 await asRole(db,'anon',null,async()=>assert.equal((await db.query('select * from storage.objects')).rows.length,2));
 await asRole(db,'authenticated',a,async()=>{
  assert.equal((await db.query("update storage.objects set name='outra.jpg' where id=$1 returning id",[b])).rows.length,0);
  assert.equal((await db.query('delete from storage.objects where id=$1 returning id',[b])).rows.length,0);
  assert.equal((await db.query("update storage.objects set name='a-nova.jpg' where id=$1 returning id",[a])).rows.length,1);
  assert.equal((await db.query('delete from storage.objects where id=$1 returning id',[a])).rows.length,1);
 });
});
test('upload exige dono do JWT; mudança de dono e escrita anônima não passam',async()=>{
 await asRole(db,'authenticated',a,async()=>{
  await denied(db,()=>db.query("update storage.objects set owner_id=$1 where id=$2",[b,a]));
  await denied(db,()=>db.query("insert into storage.objects(id,bucket_id,owner_id,name) values(gen_random_uuid(),'images',$1,'forjada.jpg')",[b]));
  await db.query("insert into storage.objects(id,bucket_id,owner_id,name) values(gen_random_uuid(),'images',$1,'nova.jpg')",[a]);
 });
 await asRole(db,'anon',null,()=>denied(db,()=>db.query("insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'images','anon.jpg')")));
});
test('política permissiva futura não rompe barreira de propriedade',async()=>{
 await db.exec('create policy unsafe_future on storage.objects for all to public using(true) with check(true)');
 await asRole(db,'authenticated',a,async()=>assert.equal((await db.query('delete from storage.objects where id=$1 returning id',[b])).rows.length,0));
 await asRole(db,'anon',null,async()=>assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0));
});
test('arquivo sem dono não é apropriado ou apagado pelo cliente; servidor pode gerir',async()=>{
 await db.query("insert into storage.objects values(gen_random_uuid(),'images',null,'legado.jpg')");
 await asRole(db,'authenticated',a,async()=>assert.equal((await db.query("delete from storage.objects where name='legado.jpg' returning id")).rows.length,0));
 await asRole(db,'service_role',null,async()=>assert.equal((await db.query("delete from storage.objects where name='legado.jpg' returning id")).rows.length,1));
});
test('contrato após deploy: anon sem configuração, dono só sua linha, servidor conserva leitura',async()=>{
 const other=await fixture();
 try{
  await assert.rejects(()=>other.exec(readMigration),/Etapa bloqueada/);await other.exec('rollback');
  await other.exec("set rmenu.public_read_contract_ready='published-consumers-2026100804'");
  await other.exec(readMigration);await other.exec(readMigration);await other.exec('begin');
  await asRole(other,'anon',null,()=>denied(other,()=>other.query('select admin_email from store_config')));
  await other.exec('create policy unsafe_config_read on store_config for select to public using(true)');
  await asRole(other,'authenticated',a,async()=>assert.deepEqual((await other.query('select id from store_config')).rows.map(x=>x.id),[a]));
  await asRole(other,'service_role',null,async()=>assert.equal((await other.query('select id from store_config')).rows.length,2));
  await other.exec('rollback');
  const results=await other.exec(read('../database/verify-private-store-configuration-readonly.sql'));
  const verification=results.flatMap(x=>x.rows).find(x=>x.private_config_verification).private_config_verification;
  assert.equal(verification.all_passed,true);
  assert.equal(verification.enabled_store_count,0);
  assert.equal(verification.automatic_printing_activated_by_this_query,false);
  await other.exec('update public.print_settings set enabled=true');
  const activeResults=await other.exec(read('../database/verify-private-store-configuration-readonly.sql'));
  const activeVerification=activeResults.flatMap(x=>x.rows).find(x=>x.private_config_verification).private_config_verification;
  assert.equal(activeVerification.all_passed,true);
  assert.equal(activeVerification.enabled_store_count,1);
  assert.equal(activeVerification.automatic_printing_activated_by_this_query,false);
  assert.equal((await other.query('select enabled from public.print_settings')).rows[0].enabled,true);
 }finally{await other.close();}
});
test('projeção pública elimina campos administrativos, futuros e extras dos horários',async()=>{
 const input={id:a,name:'Fictícia',whatsapp:'',address:null,is_open:false,minimum_order:0,logo_url:null,cover_url:null,auto_schedule_enabled:false,subdomain:'teste',pix_key:null,pix_key_type:null,table_mode_available:false,table_mode_enabled:false,table_count:1,accept_pix:true,accept_cash:true,accept_card:true,admin_email:'privado',future_secret:'privado',created_at:'privado',updated_at:'privado',business_hours:[{id:a,store_config_id:a,day_of_week:1,is_open:false,secret:'privado',periods:[]}]};
 const result=await loadPublicStore('teste',async()=>input);
 assert.ok(result);assert.ok(!JSON.stringify(result).includes('privado'));
 assert.ok(!PUBLIC_STORE_WITH_HOURS.includes('*'));assert.ok(!PUBLIC_STORE_WITH_HOURS.includes('admin_email'));
});
test('subdomínio inválido não acessa servidor; erros e resposta inválida não vazam dados',async()=>{
 for(const input of [null,{},'','www','teste.rmenu.com.br','../teste','A','a'.repeat(64)])assert.equal(await loadPublicStore(input,async()=>{throw new Error('não deveria consultar');}),null);
 assert.equal(await loadPublicStore('teste',async()=>{throw new Error('erro SQL privado');}),null);
 assert.equal(await loadPublicStore('teste',async()=>({admin_email:'privado'})),null);
});
test('schema diferente aborta antes de alterar permissões',async()=>{
 const other=await fixture(false);try{
  await other.exec("insert into storage.buckets values('outro',false)");
  await assert.rejects(()=>other.exec(writeMigration),/Schema\/buckets diferentes/);
  await other.exec('rollback');
  assert.equal((await other.query("select to_regprocedure('public.rmenu_guard_config_admin_fields()') as fn")).rows[0].fn,null);
  assert.equal((await other.query("select has_table_privilege('anon','admin_impersonation_logs','INSERT') as allowed")).rows[0].allowed,true);
 }finally{await other.close();}
});
test('grant herdado não previsto desfaz a migração inteira',async()=>{
 const other=await fixture(false);try{
  await other.exec('create role inherited_access; grant inherited_access to authenticated; grant select on admin_impersonation_logs to inherited_access');
  await assert.rejects(()=>other.exec(writeMigration),/Grant herdado inesperado/);
  await other.exec('rollback');
  assert.equal((await other.query("select to_regprocedure('public.rmenu_guard_config_admin_fields()') as fn")).rows[0].fn,null);
  assert.equal((await other.query("select count(*)::int as n from pg_policies where schemaname='storage' and policyname='legacy_storage_write'")).rows[0].n,1);
 }finally{await other.close();}
});
test('preflight e verificação retornam checks reais sem ativar impressão',async()=>{
 const other=await fixture();try{
  for(const [file,field,flag] of [['preflight-config-image-writes-readonly.sql','config_image_preflight','ready'],['verify-config-image-writes-readonly.sql','config_image_verification','all_passed']]){
   const results=await other.exec(read('../database/'+file));
   const result=results.flatMap(x=>x.rows).find(x=>x[field])[field];
   assert.equal(result[flag],true,JSON.stringify(result));
   assert.ok(Object.values(result.checks).every(Boolean));
  }
  assert.equal((await other.query('select enabled from print_settings')).rows[0].enabled,false);
 }finally{await other.close();}
});
