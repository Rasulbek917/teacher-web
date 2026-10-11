import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  SubmissionsService,
  ReviewDto,
  BulkReviewDto,
} from './submissions.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { StudentHomeworksQueryDto } from './dto/submissions.dto';

@Roles(Role.TEACHER)
@Controller('submissions')
export class SubmissionsController {
  constructor(private submissions: SubmissionsService) {}

  @Get('homework/:homeworkId')
  listForHomework(
    @CurrentUser() user: AuthUser,
    @Param('homeworkId') homeworkId: string,
  ) {
    return this.submissions.listForHomework(user.id, homeworkId);
  }

  @Get('group/:groupId/summary')
  groupSummary(@CurrentUser() user: AuthUser, @Param('groupId') groupId: string) {
    return this.submissions.groupSummary(user.id, groupId);
  }

  @Get('student/:studentId')
  studentHomeworks(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Query() query: StudentHomeworksQueryDto,
  ) {
    return this.submissions.studentHomeworks(user.id, studentId, query.groupId);
  }

  @Patch('bulk-review')
  bulkReview(@CurrentUser() user: AuthUser, @Body() dto: BulkReviewDto) {
    return this.submissions.bulkReview(user.id, dto);
  }

  @Post('homework/:homeworkId/student/:studentId/receive')
  receive(
    @CurrentUser() user: AuthUser,
    @Param('homeworkId') homeworkId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.submissions.receive(user.id, homeworkId, studentId);
  }

  @Patch(':id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.submissions.review(user.id, id, dto);
  }
}
