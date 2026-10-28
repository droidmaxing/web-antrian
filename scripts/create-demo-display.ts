import { PrismaClient, AccessTokenType } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";

const prisma = new PrismaClient();

async function main(){
  const business = await prisma.business.findFirst({});
  if(!business){
    console.error('No business');
    process.exit(1);
  }
  const branch = await prisma.branch.findFirst({where:{businessId:business.id}});
  if(!branch){
    console.error('No branch');
    process.exit(1);
  }
  const token = randomBytes(32).toString('base64url');
  const display = await prisma.display.create({
    data:{
      businessId: business.id,
      branchId: branch.id,
      name: 'Demo Display',
      tokenHash: createHash('sha256').update(token).digest('hex'),
    },
    select:{id:true, tokenHash:true}
  });
  console.log('TOKEN', token);
}

main().catch(e=>{console.error(e);process.exit(1);});
