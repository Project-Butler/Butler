// 단일 PrismaClient 인스턴스. 여러 파일에서 각자 new PrismaClient()를 만들면
// 커넥션이 낭비된다 — 다른 코드는 전부 이 파일에서 가져다 쓴다.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
