import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import {
  MarkPaidDto,
  PaymentsQueryDto,
  SetPaymentDeadlineDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { monthOf, yearOf } from '../common/date.util';

@Roles(Role.TEACHER)
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaymentsQueryDto) {
    return this.payments.list(user.id, query);
  }

  @Get('deadline')
  getDeadline(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.payments.getDeadline(
      user.id,
      parseInt(year || String(yearOf(now)), 10),
      parseInt(month || String(monthOf(now)), 10),
    );
  }

  @Put('deadline')
  setDeadline(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetPaymentDeadlineDto,
  ) {
    return this.payments.setDeadline(user.id, dto);
  }

  @Post('mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Body() dto: MarkPaidDto) {
    return this.payments.markPaid(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.payments.update(user.id, id, dto);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.cancel(user.id, id);
  }
}

@Roles(Role.STUDENT)
@Controller('my/payments')
export class StudentPaymentsController {
  constructor(private payments: PaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.payments.studentPayments(user.id);
  }
}
