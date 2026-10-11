import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ruxsatlarni backendda tekshirish uchun yordamchi.
 * O'qituvchi faqat o'z guruhlari/o'quvchilariga, o'quvchi faqat o'ziga tegishli
 * ma'lumotlarga kira oladi.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async teacherGroupIds(teacherId: string): Promise<string[]> {
    const groups = await this.prisma.group.findMany({
      where: { teacherId },
      select: { id: true },
    });
    return groups.map((g) => g.id);
  }

  async assertTeacherOwnsGroup(teacherId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, teacherId },
      select: { id: true },
    });
    if (!group) throw new ForbiddenException('Bu guruhga ruxsat yo\'q');
    return group.id;
  }

  async assertStudentInTeacherGroups(teacherId: string, studentId: string) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: { studentId, group: { teacherId } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Bu o\'quvchiga ruxsat yo\'q');
  }

  async studentGroupIds(studentId: string): Promise<string[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { studentId },
      select: { groupId: true },
    });
    return memberships.map((m) => m.groupId);
  }

  async assertStudentInGroup(studentId: string, groupId: string) {
    const membership = await this.prisma.groupMembership.findUnique({
      where: { groupId_studentId: { groupId, studentId } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException('Bu guruhga ruxsat yo\'q');
  }
}
