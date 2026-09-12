import { readdir,readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const destructive=/\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i;
const prisma=new PrismaClient();
try{
  let appliedRows=[];
  try{appliedRows=await prisma.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')}catch{/* Banco novo: nenhuma migration foi aplicada. */}
  const applied=new Set(appliedRows.map(row=>row.migration_name));
  const directories=(await readdir('prisma/migrations',{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();
  const dangerous=[];
  for(const name of directories){if(applied.has(name))continue;const sql=await readFile(`prisma/migrations/${name}/migration.sql`,'utf8');if(destructive.test(sql))dangerous.push(name)}
  if(!dangerous.length)process.exit(0);
  const backupId=process.env.TALENTUM_VERIFIED_BACKUP_ID;
  if(!backupId)throw new Error(`Migration destrutiva pendente (${dangerous.join(', ')}): informe TALENTUM_VERIFIED_BACKUP_ID.`);
  const backup=await prisma.databaseBackup.findFirst({where:{id:backupId,status:'verified',verifiedAt:{not:null}},select:{schemaVersion:true,checksum:true,byteSize:true}});
  const lastApplied=[...applied].sort().at(-1);
  if(!backup||backup.schemaVersion!==lastApplied||!/^[a-f0-9]{64}$/i.test(backup.checksum)||backup.byteSize<=0)throw new Error('O backup informado não foi validado para a versão atual do schema.');
}finally{await prisma.$disconnect()}
