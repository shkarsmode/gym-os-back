const fs=require('fs');
for (const f of ['/tmp/prod.env']) { if (fs.existsSync(f)) for (const line of fs.readFileSync(f,'utf8').split(/\r?\n/)) { const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const users = await p.user.findMany({select:{id:true,displayName:true,email:true}});
  console.log('USERS:', users.map(u=>u.displayName+'|'+u.id.slice(-8)).join(', '));
  const rows = await p.workout.findMany({where:{date:{gte:new Date('2026-08-10')}}, select:{id:true,userId:true,date:true,status:true,type:true,createdAt:true}, orderBy:{date:'desc'}});
  console.log('WORKOUTS since Aug10:', rows.length);
  for(const r of rows) console.log(r.date.toISOString().slice(0,10), String(r.status).padEnd(10), String(r.type||'-').padEnd(8), ((users.find(u=>u.id===r.userId)||{}).displayName||'?').padEnd(18), r.id);
  await p.$disconnect();
})().catch(e=>{console.error('ERR',e.message); process.exit(1);});
